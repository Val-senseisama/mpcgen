#!/usr/bin/env node
import { Project, SyntaxKind, Node, FunctionDeclaration, VariableDeclaration, ArrowFunction, FunctionExpression, MethodDeclaration } from "ts-morph";
import fg from "fast-glob";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

// Import handling for sql-ddl-to-json-schema
let Parser: any;

async function initializeParser() {
  if (Parser) return Parser;
  
  try {
    // Try ES module import first
    const sqlModule = await import("sql-ddl-to-json-schema");
    Parser = sqlModule.Parser || sqlModule.default?.Parser;
  } catch (error) {
    try {
      // Fallback to CommonJS require
      const sqlModule = require("sql-ddl-to-json-schema");
      Parser = sqlModule.Parser;
    } catch (requireError) {
      console.error("❌ Could not import sql-ddl-to-json-schema. Make sure it's installed:");
      console.error("npm install sql-ddl-to-json-schema");
      process.exit(1);
    }
  }
  return Parser;
}

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- 🔍 ENHANCED UTILS ---
function guessDescription(name: string, params: Record<string, string> = {}): string {
  const paramCount = Object.keys(params).length;
  const hasId = Object.keys(params).some(p => p.toLowerCase().includes('id'));
  
  // More sophisticated pattern matching
  if (name.match(/^(get|fetch|find|retrieve|load|query)/i)) {
    return hasId ? `Fetch a specific ${name.replace(/^(get|fetch|find|retrieve|load|query)/i, '').toLowerCase()} by ID` 
                 : `Fetch ${name.replace(/^(get|fetch|find|retrieve|load|query)/i, '').toLowerCase()} data`;
  }
  if (name.match(/^(create|add|insert|post)/i)) {
    return `Create a new ${name.replace(/^(create|add|insert|post)/i, '').toLowerCase()} record`;
  }
  if (name.match(/^(update|edit|modify|patch|put)/i)) {
    return `Update an existing ${name.replace(/^(update|edit|modify|patch|put)/i, '').toLowerCase()} record`;
  }
  if (name.match(/^(delete|remove|destroy)/i)) {
    return `Delete a ${name.replace(/^(delete|remove|destroy)/i, '').toLowerCase()} record`;
  }
  if (name.match(/^(list|getAll)/i)) {
    return `List all ${name.replace(/^(list|getAll)/i, '').toLowerCase()} records`;
  }
  if (name.match(/^(search|filter)/i)) {
    return `Search and filter ${name.replace(/^(search|filter)/i, '').toLowerCase()} records`;
  }
  if (name.match(/^(validate|check|verify)/i)) {
    return `Validate ${name.replace(/^(validate|check|verify)/i, '').toLowerCase()} data`;
  }
  
  return `Function: ${name}${paramCount > 0 ? ` (${paramCount} parameters)` : ''}`;
}

function parseTypeScriptType(typeText: string): { type: string; description?: string; enum?: string[] } {
  if (!typeText) return { type: "any" };
  
  // Clean up the type text
  const cleanType = typeText.replace(/import\([^)]+\)\./g, '').trim();
  
  // Handle union types with string literals (enums)
  const enumMatch = cleanType.match(/^"([^"]+)"(\s*\|\s*"([^"]+)")*$/);
  if (enumMatch) {
    const enumValues = cleanType.match(/"([^"]+)"/g)?.map(s => s.slice(1, -1)) || [];
    return { type: "string", enum: enumValues, description: `One of: ${enumValues.join(', ')}` };
  }
  
  // Map TypeScript types to JSON Schema types
  const typeMap: Record<string, string> = {
    'string': 'string',
    'number': 'number',
    'boolean': 'boolean',
    'Date': 'string',
    'any': 'any',
    'unknown': 'any',
    'object': 'object',
    'void': 'null',
    'undefined': 'null',
    'null': 'null'
  };
  
  // Handle array types
  if (cleanType.includes('[]') || cleanType.startsWith('Array<')) {
    return { type: "array", description: `Array of ${cleanType.replace(/\[\]|Array<|>/g, '')}` };
  }
  
  // Handle Promise types
  if (cleanType.startsWith('Promise<')) {
    const innerType = cleanType.match(/Promise<(.+)>/)?.[1] || 'any';
    return { type: "promise", description: `Promise resolving to ${innerType}` };
  }
  
  // Handle object types with properties
  if (cleanType.includes('{') && cleanType.includes('}')) {
    return { type: "object", description: "Complex object type" };
  }
  
  return { type: typeMap[cleanType] || cleanType, description: cleanType !== (typeMap[cleanType] || cleanType) ? cleanType : undefined };
}

function isValidToolFunction(name: string, node: Node): boolean {
  // Skip private functions
  if (name.startsWith('_') || name.startsWith('#')) return false;
  
  // Skip test functions
  if (name.match(/^(test|spec|mock|stub)/i)) return false;
  
  // Skip internal utility functions (common patterns)
  if (name.match(/^(helper|util|internal|private)/i)) return false;
  
  // Skip constructor-like functions
  if (name.match(/^(constructor|init)/i)) return false;
  
  // Skip React component functions (unless they're utility functions)
  if (name.match(/^[A-Z]/) && node.getSourceFile().getFilePath().includes('component')) return false;
  
  return true;
}

// --- 🔧 ENHANCED TOOLS EXTRACTION ---
async function extractTools(): Promise<any[]> {
  console.log("🔍 Starting tool extraction...");
  
  // Try to find tsconfig.json, but don't require it
  let projectOptions: any = {
    skipAddingFilesFromTsConfig: true // Prevent auto-loading all files
  };
  
  try {
    if (fs.existsSync("tsconfig.json")) {
      projectOptions.tsConfigFilePath = "tsconfig.json";
      console.log("✅ Found tsconfig.json");
    } else {
      console.log("⚠️  No tsconfig.json found, using default TypeScript settings");
    }
  } catch (error) {
    console.log("⚠️  Could not check for tsconfig.json, using default settings");
  }
  
  let project: Project;
  try {
    project = new Project(projectOptions);
  } catch (error) {
    console.log("⚠️  Failed to create project with tsconfig, using defaults");
    project = new Project({ skipAddingFilesFromTsConfig: true });
  }
  
  const tsFiles = await fg(["**/*.ts", "**/*.tsx"], { 
    ignore: ["node_modules", "dist", "build", "**/*.test.*", "**/*.spec.*", "**/*.d.ts", ".git"],
    absolute: false
  });

  console.log(`📁 Found ${tsFiles.length} TypeScript files`);
  if (tsFiles.length === 0) {
    console.log("⚠️  No TypeScript files found in current directory");
    return [];
  }

  const tools: any[] = [];
  const processedFunctions = new Set<string>(); // Prevent duplicates

  for (const filePath of tsFiles) {
    try {
      console.log(`🔧 Processing file: ${filePath}`);
      
      if (!fs.existsSync(filePath)) {
        console.warn(`⚠️  File not found: ${filePath}`);
        continue;
      }
      
    const sourceFile = project.addSourceFileAtPath(filePath);

      // Extract regular function declarations
      const functions = sourceFile.getFunctions();
      console.log(`  - Found ${functions.length} function declarations`);
      
      // Extract exported variable declarations that are functions
      const variableDeclarations = sourceFile.getVariableDeclarations().filter(v => {
        const initializer = v.getInitializer();
        return initializer && (
          Node.isArrowFunction(initializer) || 
          Node.isFunctionExpression(initializer)
        );
      });
      console.log(`  - Found ${variableDeclarations.length} variable function declarations`);

      // Extract class methods that are exported
      const classes = sourceFile.getClasses();
      const classMethods: MethodDeclaration[] = [];
      for (const cls of classes) {
        if (cls.isExported()) {
          const methods = cls.getMethods().filter(m => 
            m.hasModifier(SyntaxKind.PublicKeyword) || 
            !m.hasModifier(SyntaxKind.PrivateKeyword)
          );
          classMethods.push(...methods);
        }
      }
      console.log(`  - Found ${classMethods.length} exported class methods`);

      // Process all function types
      const allFunctions = [
        ...functions,
        ...variableDeclarations,
        ...classMethods
      ];

      console.log(`  - Total functions to process: ${allFunctions.length}`);

      for (const fn of allFunctions) {
        try {
      const name = fn.getName() ?? "[anonymous]";
          
          if (name === "[anonymous]") {
            console.log(`  - Skipping anonymous function`);
            continue;
          }
          
          if (!isValidToolFunction(name, fn)) {
            console.log(`  - Skipping function: ${name} (filtered out)`);
            continue;
          }

          // Check if function is exported
          let isExported = false;
          try {
            if ('isExported' in fn && typeof fn.isExported === 'function') {
              isExported = fn.isExported();
            } else if ('hasModifier' in fn && typeof fn.hasModifier === 'function') {
              isExported = fn.hasModifier(SyntaxKind.ExportKeyword);
            } else {
              // Check parent for export
              const parent = fn.getParent();
              if (Node.isVariableStatement(parent)) {
                isExported = parent.hasModifier(SyntaxKind.ExportKeyword);
              }
            }
          } catch (exportError) {
            console.log(`  - Could not determine export status for ${name}, assuming not exported`);
            isExported = false;
          }

          if (!isExported) {
            console.log(`  - Skipping function: ${name} (not exported)`);
            continue;
          }

          console.log(`  - Processing exported function: ${name}`);

          // Prevent duplicate functions
          const functionKey = `${filePath}:${name}`;
          if (processedFunctions.has(functionKey)) {
            console.log(`  - Skipping duplicate function: ${name}`);
            continue;
          }
          processedFunctions.add(functionKey);

          // Extract parameters with enhanced type information
          const parameters: Record<string, any> = {};
          let paramList: any[] = [];
          
          try {
            if ('getParameters' in fn && typeof fn.getParameters === 'function') {
              paramList = fn.getParameters();
            }
          } catch (paramError) {
            console.log(`  - Could not get parameters for ${name}`);
          }

      for (const param of paramList) {
            try {
        const paramName = param.getName();
              const paramType = param.getType()?.getText() || 'any';
              const isOptional = param.hasQuestionToken ? param.hasQuestionToken() : false;
              const typeInfo = parseTypeScriptType(paramType);
              
              parameters[paramName] = {
                type: typeInfo.type,
                required: !isOptional,
                description: typeInfo.description,
                ...(typeInfo.enum && { enum: typeInfo.enum })
              };
            } catch (paramParseError) {
              console.log(`  - Error parsing parameter: ${paramParseError}`);
            }
          }

          // Extract JSDoc comments if available
          let description = guessDescription(name, parameters);
          let examples: string[] = [];
          
          try {
            const jsDocs = 'getJsDocs' in fn ? fn.getJsDocs() : [];
            if (jsDocs.length > 0) {
              const jsDoc = jsDocs[0];
              const comment = jsDoc.getComment ? jsDoc.getComment() : null;
              if (comment) {
                description = typeof comment === 'string' ? comment : 
                  Array.isArray(comment) ? comment.map(c => c?.getText ? c.getText() : String(c)).join('') :
                  String(comment);
              }
              
              // Extract @example tags
              const tags = jsDoc.getTags ? jsDoc.getTags() : [];
              examples = tags
                .filter((tag: any) => tag.getTagName && tag.getTagName() === 'example')
                .map((tag: any) => {
                  const comment = tag.getComment ? tag.getComment() : '';
                  return typeof comment === 'string' ? comment : String(comment);
                });
            }
          } catch (jsDocError) {
            console.log(`  - Could not parse JSDoc for ${name}`);
          }

          // Determine return type
          let returnType = 'any';
          try {
            if ('getReturnType' in fn && fn.getReturnType) {
              const returnTypeText = fn.getReturnType().getText();
              returnType = parseTypeScriptType(returnTypeText).type;
            }
          } catch (returnTypeError) {
            console.log(`  - Could not determine return type for ${name}`);
      }

      tools.push({
        name,
            description,
        parameters,
            returnType,
            file: path.relative(process.cwd(), filePath),
            ...(examples.length > 0 && { examples }),
            category: categorizeFunction(name, filePath)
          });

          console.log(`  - Successfully processed function: ${name}`);
        } catch (functionError) {
          console.warn(`  - Error processing function: ${functionError}`);
        }
      }
    } catch (fileError) {
      console.warn(`⚠️  Failed to process ${filePath}: ${fileError}`);
    }
  }

  console.log(`✅ Extracted ${tools.length} tools total`);
  return tools;
}

function categorizeFunction(name: string, filePath: string): string {
  // Categorize by file path
  if (filePath.includes('/api/') || filePath.includes('/routes/')) return 'api';
  if (filePath.includes('/utils/') || filePath.includes('/helpers/')) return 'utility';
  if (filePath.includes('/services/')) return 'service';
  if (filePath.includes('/models/')) return 'model';
  if (filePath.includes('/controllers/')) return 'controller';
  if (filePath.includes('/middleware/')) return 'middleware';
  
  // Categorize by function name
  if (name.match(/^(get|fetch|find|retrieve|load|query)/i)) return 'data-access';
  if (name.match(/^(create|add|insert|post)/i)) return 'data-creation';
  if (name.match(/^(update|edit|modify|patch|put)/i)) return 'data-modification';
  if (name.match(/^(delete|remove|destroy)/i)) return 'data-deletion';
  if (name.match(/^(validate|check|verify)/i)) return 'validation';
  if (name.match(/^(auth|login|logout|register)/i)) return 'authentication';
  
  return 'general';
}

// --- 📊 ENHANCED RESOURCES EXTRACTION ---
async function extractResources(): Promise<any[]> {
  console.log("🔍 Starting resource extraction...");
  
  const sqlFiles = await fg(["**/*.sql"], { 
    ignore: ["node_modules", "dist", "build", "**/migrations/**"],
    absolute: false
  });
  
  console.log(`📁 Found ${sqlFiles.length} SQL files`);
  
  const Parser = await initializeParser();
  
  const resources: any[] = [];

  for (const file of sqlFiles) {
    try {
      console.log(`📊 Processing SQL file: ${file}`);
      
      if (!fs.existsSync(file)) {
        console.warn(`⚠️  SQL file not found: ${file}`);
        continue;
      }
      
    const raw = fs.readFileSync(file, "utf8");
      if (!raw.trim()) {
        console.log(`  - Empty SQL file, skipping`);
        continue;
      }
      
      // Handle multiple SQL dialects
      const dialects = ['mysql', 'postgresql', 'sqlite', 'mssql'];
      let parsed = false;
      
      for (const dialect of dialects) {
        try {
          const parser = new Parser(dialect);
    parser.feed(raw);

          const results = Array.isArray(parser.results) ? parser.results : [parser.results];
          const tables = results.flatMap((res: any) => res?.tables ?? []);

          console.log(`  - Found ${tables.length} tables with ${dialect} dialect`);

    for (const table of tables) {
            if (!table || !table.name) continue;

            console.log(`  - Processing table: ${table.name}`);

            const columns: Record<string, any> = {};
            const indexes: string[] = [];
            const foreignKeys: any[] = [];

            // Process columns with enhanced metadata
            if (table.columns) {
              for (const col of table.columns) {
                columns[col.name] = {
                  type: col.type?.datatype || 'unknown',
                  nullable: !col.options?.notNull,
                  primaryKey: col.options?.primaryKey || false,
                  autoIncrement: col.options?.autoIncrement || false,
                  defaultValue: col.options?.defaultValue,
                  ...(col.type?.length && { length: col.type.length })
                };
              }
            }

            // Extract indexes
            if (table.indexes) {
              table.indexes.forEach((idx: any) => {
                indexes.push(idx.name || `${table.name}_${idx.columns?.join('_')}_idx`);
              });
            }

            // Extract foreign keys
            if (table.foreignKeys) {
              table.foreignKeys.forEach((fk: any) => {
                foreignKeys.push({
                  column: fk.column,
                  referencesTable: fk.references?.table,
                  referencesColumn: fk.references?.column
                });
              });
            }

      resources.push({
        name: table.name,
        type: "sql_table",
              columns,
              indexes,
              foreignKeys,
              file: path.relative(process.cwd(), file),
              dialect,
              metadata: {
                estimatedRows: 'unknown',
                lastModified: fs.statSync(file).mtime.toISOString()
              }
            });
          }
          
          parsed = true;
          break; // Successfully parsed with this dialect
        } catch (dialectError) {
          // Try next dialect
          continue;
        }
      }
      
      if (!parsed) {
        console.warn(`⚠️  Could not parse SQL file ${file} with any supported dialect`);
      }
    } catch (error) {
      console.warn(`⚠️  Failed to process SQL file ${file}: ${error}`);
    }
  }

  console.log(`✅ Extracted ${resources.length} resources total`);
  return resources;
}

// --- 📄 CONFIGURATION EXTRACTION ---
async function extractProjectMetadata(): Promise<any> {
  console.log("🔍 Extracting project metadata...");
  
  const metadata: any = {
    name: path.basename(process.cwd()),
    version: "unknown",
    description: "",
    dependencies: {},
    scripts: {}
  };

  // Read package.json if it exists
  try {
    if (fs.existsSync("package.json")) {
      const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
      metadata.name = packageJson.name || metadata.name;
      metadata.version = packageJson.version || metadata.version;
      metadata.description = packageJson.description || metadata.description;
      metadata.dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      metadata.scripts = packageJson.scripts || {};
      console.log(`✅ Read package.json for project: ${metadata.name}`);
    } else {
      console.warn("⚠️  No package.json found");
    }
  } catch (error) {
    console.warn(`⚠️  Could not read package.json: ${error}`);
  }

  // Detect framework/stack
  const frameworks = [];
  if (metadata.dependencies?.react) frameworks.push("React");
  if (metadata.dependencies?.vue) frameworks.push("Vue");
  if (metadata.dependencies?.angular) frameworks.push("Angular");
  if (metadata.dependencies?.express) frameworks.push("Express");
  if (metadata.dependencies?.nestjs) frameworks.push("NestJS");
  if (metadata.dependencies?.next) frameworks.push("Next.js");
  
  metadata.frameworks = frameworks;
  console.log(`📦 Detected frameworks: ${frameworks.join(', ') || 'none'}`);
  
  return metadata;
}

// --- 📝 ENHANCED OUTPUT WRITER ---
async function generateMCPManifest(): Promise<any> {
  console.log("🚀 Starting MCP manifest generation...");
  console.log(`📂 Working directory: ${process.cwd()}`);
  
  const [tools, resources, projectMetadata] = await Promise.all([
    extractTools().catch(error => {
      console.error("❌ Error extracting tools:", error);
      return [];
    }),
    extractResources().catch(error => {
      console.error("❌ Error extracting resources:", error);
      return [];
    }),
    extractProjectMetadata().catch(error => {
      console.error("❌ Error extracting project metadata:", error);
      return {
        name: path.basename(process.cwd()),
        version: "unknown",
        description: "",
        dependencies: {},
        scripts: {},
        frameworks: []
      };
    })
  ]);

  // Group tools by category for better organization
  const toolsByCategory = tools.reduce((acc, tool) => {
    const category = tool.category || 'general';
    if (!acc[category]) acc[category] = [];
    acc[category].push(tool);
    return acc;
  }, {} as Record<string, any[]>);

  const mcp = {
    mcpVersion: "0.1.0",
    info: {
      name: projectMetadata.name,
      version: projectMetadata.version,
      description: projectMetadata.description || `Auto-generated MCP manifest for ${projectMetadata.name}`,
      frameworks: projectMetadata.frameworks,
      generatedAt: new Date().toISOString()
    },
    tools: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: "object",
        properties: tool.parameters,
        required: Object.entries(tool.parameters)
          .filter(([_, param]: [string, any]) => param.required)
          .map(([name]) => name)
      },
      returnType: tool.returnType,
      category: tool.category,
      file: tool.file,
      ...(tool.examples && { examples: tool.examples })
    })),
    resources: resources.map(resource => ({
      uri: `sql://${resource.name}`,
      name: resource.name,
      description: `Database table: ${resource.name}`,
      mimeType: "application/json",
      metadata: {
        type: resource.type,
        columns: resource.columns,
        indexes: resource.indexes,
        foreignKeys: resource.foreignKeys,
        file: resource.file,
        dialect: resource.dialect,
        ...resource.metadata
      }
    })),
    prompts: [], // Placeholder for future functionality
    statistics: {
      totalTools: tools.length,
      totalResources: resources.length,
      toolsByCategory: Object.fromEntries(
        Object.entries(toolsByCategory).map(([cat, items]) => [cat, (items as any[]).length])
      ),
      filesProcessed: {
        typescript: (await fg(["**/*.ts", "**/*.tsx"], { ignore: ["node_modules", "dist", "build"] })).length,
        sql: (await fg(["**/*.sql"], { ignore: ["node_modules", "dist", "build"] })).length
      }
    },
    description: `This project contains a Node.js + TypeScript backend and a React/React Native frontend. 
  The tools were auto-extracted from exported functions in .ts and .tsx files, including APIs, utilities, and business logic. 
  Resources were parsed from .sql files and represent real database tables. 
  Function names follow conventions like get, create, update, and delete. 
Use these tools to build features, compose workflows, or query structured project data.`
  };

  return mcp;
}

// --- 🚀 MAIN FUNCTION ---
async function main() {
  try {
    console.log("🎯 MCP Generator CLI Starting...");
    
    const mcp = await generateMCPManifest();
    
    // Write the main manifest
    const outputFile = "mcp.generated.json";
    fs.writeFileSync(outputFile, JSON.stringify(mcp, null, 2));
    
    // Write a human-readable summary
    const summary = `# MCP Manifest Summary

Generated: ${new Date().toISOString()}
Project: ${mcp.info.name} v${mcp.info.version}

## Statistics
- **Tools**: ${mcp.statistics.totalTools}
- **Resources**: ${mcp.statistics.totalResources}
- **Categories**: ${Object.keys(mcp.statistics.toolsByCategory).length}

## Tools by Category
${Object.entries(mcp.statistics.toolsByCategory)
  .map(([category, count]) => `- **${category}**: ${count} tools`)
  .join('\n')}

## Resources
${mcp.resources.map((r: any) => `- **${r.name}** (${Object.keys(r.metadata.columns).length} columns)`).join('\n')}

## Files Processed
- TypeScript files: ${mcp.statistics.filesProcessed.typescript}
- SQL files: ${mcp.statistics.filesProcessed.sql}
`;

    fs.writeFileSync("mcp.summary.md", summary);
    
  console.log("✅ MCP manifest written to mcp.generated.json");
    console.log("📊 Summary written to mcp.summary.md");
    console.log(`📈 Extracted ${mcp.statistics.totalTools} tools and ${mcp.statistics.totalResources} resources`);
    
    // Show summary in console
    console.log("\n" + "=".repeat(50));
    console.log("📋 GENERATION SUMMARY");
    console.log("=".repeat(50));
    console.log(`Project: ${mcp.info.name}`);
    console.log(`Tools: ${mcp.statistics.totalTools}`);
    console.log(`Resources: ${mcp.statistics.totalResources}`);
    console.log(`Frameworks: ${mcp.info.frameworks.join(', ') || 'None detected'}`);
    console.log("=".repeat(50));
    
    return mcp;
  } catch (error) {
    console.error('❌ Error generating MCP manifest:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : String(error));
    process.exit(1);
  }
}

// Handle errors gracefully
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Default export for programmatic usage
export default generateMCPManifest;

// CLI execution check - Fixed for ES modules
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  console.log("🚀 Running MCP Generator CLI...");
  main().catch((error) => {
    console.error('❌ CLI execution failed:', error);
    process.exit(1);
  });
}