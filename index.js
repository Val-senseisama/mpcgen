#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ts_morph_1 = require("ts-morph");
const fast_glob_1 = __importDefault(require("fast-glob"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sql_ddl_to_json_schema_1 = require("sql-ddl-to-json-schema");
// --- 🔍 ENHANCED UTILS ---
function guessDescription(name, params = {}) {
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
function parseTypeScriptType(typeText) {
    // Clean up the type text
    const cleanType = typeText.replace(/import\([^)]+\)\./g, '').trim();
    // Handle union types with string literals (enums)
    const enumMatch = cleanType.match(/^"([^"]+)"(\s*\|\s*"([^"]+)")*$/);
    if (enumMatch) {
        const enumValues = cleanType.match(/"([^"]+)"/g)?.map(s => s.slice(1, -1)) || [];
        return { type: "string", enum: enumValues, description: `One of: ${enumValues.join(', ')}` };
    }
    // Map TypeScript types to JSON Schema types
    const typeMap = {
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
function isValidToolFunction(name, node) {
    // Skip private functions
    if (name.startsWith('_') || name.startsWith('#'))
        return false;
    // Skip test functions
    if (name.match(/^(test|spec|mock|stub)/i))
        return false;
    // Skip internal utility functions (common patterns)
    if (name.match(/^(helper|util|internal|private)/i))
        return false;
    // Skip constructor-like functions
    if (name.match(/^(constructor|init)/i))
        return false;
    // Skip React component functions (unless they're utility functions)
    if (name.match(/^[A-Z]/) && node.getSourceFile().getFilePath().includes('component'))
        return false;
    return true;
}
// --- 🔧 ENHANCED TOOLS EXTRACTION ---
async function extractTools() {
    const project = new ts_morph_1.Project({
        tsConfigFilePath: "tsconfig.json",
        skipAddingFilesFromTsConfig: true // Prevent auto-loading all files
    });
    const tsFiles = await (0, fast_glob_1.default)(["**/*.ts", "**/*.tsx"], {
        ignore: ["node_modules", "dist", "build", "**/*.test.*", "**/*.spec.*", "**/*.d.ts"]
    });
    const tools = [];
    const processedFunctions = new Set(); // Prevent duplicates
    for (const filePath of tsFiles) {
        try {
            const sourceFile = project.addSourceFileAtPath(filePath);
            // Extract regular function declarations
            const functions = sourceFile.getFunctions();
            // Extract exported variable declarations that are functions
            const variableDeclarations = sourceFile.getVariableDeclarations().filter(v => {
                const initializer = v.getInitializer();
                return initializer && (ts_morph_1.Node.isArrowFunction(initializer) ||
                    ts_morph_1.Node.isFunctionExpression(initializer));
            });
            // Extract class methods that are exported
            const classes = sourceFile.getClasses();
            const classMethods = [];
            for (const cls of classes) {
                if (cls.isExported()) {
                    classMethods.push(...cls.getMethods().filter(m => m.hasModifier(ts_morph_1.SyntaxKind.PublicKeyword) || !m.hasModifier(ts_morph_1.SyntaxKind.PrivateKeyword)));
                }
            }
            // Process all function types
            const allFunctions = [
                ...functions,
                ...variableDeclarations,
                ...classMethods
            ];
            for (const fn of allFunctions) {
                const name = fn.getName() ?? "[anonymous]";
                if (!isValidToolFunction(name, fn))
                    continue;
                // Check if function is exported
                let isExported = false;
                if ('isExported' in fn && typeof fn.isExported === 'function') {
                    isExported = fn.isExported();
                }
                else if ('hasModifier' in fn && typeof fn.hasModifier === 'function') {
                    isExported = fn.hasModifier(ts_morph_1.SyntaxKind.ExportKeyword);
                }
                else {
                    // Check parent for export
                    const parent = fn.getParent();
                    if (ts_morph_1.Node.isVariableStatement(parent)) {
                        isExported = parent.hasModifier(ts_morph_1.SyntaxKind.ExportKeyword);
                    }
                }
                if (!isExported)
                    continue;
                // Prevent duplicate functions
                const functionKey = `${filePath}:${name}`;
                if (processedFunctions.has(functionKey))
                    continue;
                processedFunctions.add(functionKey);
                // Extract parameters with enhanced type information
                const parameters = {};
                let paramList = [];
                if ('getParameters' in fn && typeof fn.getParameters === 'function') {
                    paramList = fn.getParameters();
                }
                for (const param of paramList) {
                    const paramName = param.getName();
                    const paramType = param.getType().getText();
                    const isOptional = param.hasQuestionToken();
                    const typeInfo = parseTypeScriptType(paramType);
                    parameters[paramName] = {
                        type: typeInfo.type,
                        required: !isOptional,
                        description: typeInfo.description,
                        ...(typeInfo.enum && { enum: typeInfo.enum })
                    };
                }
                // Extract JSDoc comments if available
                const jsDocs = 'getJsDocs' in fn ? fn.getJsDocs() : [];
                let description = guessDescription(name, parameters);
                let examples = [];
                if (jsDocs.length > 0) {
                    const jsDoc = jsDocs[0];
                    const comment = jsDoc.getComment();
                    if (comment) {
                        description = typeof comment === 'string' ? comment : comment.map(c => c?.getText()).join('');
                    }
                    // Extract @example tags
                    const tags = jsDoc.getTags();
                    examples = tags
                        .filter(tag => 'getTagName' in tag && tag.getTagName() === 'example')
                        .map(tag => 'getComment' in tag ? (tag.getComment() || '').toString() : '');
                }
                // Determine return type
                let returnType = 'any';
                if ('getReturnType' in fn) {
                    returnType = parseTypeScriptType(fn.getReturnType().getText()).type;
                }
                tools.push({
                    name,
                    description,
                    parameters,
                    returnType,
                    file: path_1.default.relative(process.cwd(), filePath),
                    ...(examples.length > 0 && { examples }),
                    category: categorizeFunction(name, filePath)
                });
            }
        }
        catch (error) {
            console.warn(`⚠️  Failed to process ${filePath}: ${error}`);
        }
    }
    return tools;
}
function categorizeFunction(name, filePath) {
    // Categorize by file path
    if (filePath.includes('/api/') || filePath.includes('/routes/'))
        return 'api';
    if (filePath.includes('/utils/') || filePath.includes('/helpers/'))
        return 'utility';
    if (filePath.includes('/services/'))
        return 'service';
    if (filePath.includes('/models/'))
        return 'model';
    if (filePath.includes('/controllers/'))
        return 'controller';
    if (filePath.includes('/middleware/'))
        return 'middleware';
    // Categorize by function name
    if (name.match(/^(get|fetch|find|retrieve|load|query)/i))
        return 'data-access';
    if (name.match(/^(create|add|insert|post)/i))
        return 'data-creation';
    if (name.match(/^(update|edit|modify|patch|put)/i))
        return 'data-modification';
    if (name.match(/^(delete|remove|destroy)/i))
        return 'data-deletion';
    if (name.match(/^(validate|check|verify)/i))
        return 'validation';
    if (name.match(/^(auth|login|logout|register)/i))
        return 'authentication';
    return 'general';
}
// --- 📊 ENHANCED RESOURCES EXTRACTION ---
async function extractResources() {
    const sqlFiles = await (0, fast_glob_1.default)(["**/*.sql"], {
        ignore: ["node_modules", "dist", "build", "**/migrations/**"]
    });
    const resources = [];
    for (const file of sqlFiles) {
        try {
            const raw = fs_1.default.readFileSync(file, "utf8");
            // Handle multiple SQL dialects
            const dialects = ['mysql', 'postgresql', 'sqlite', 'mssql'];
            let parsed = false;
            for (const dialect of dialects) {
                try {
                    const parser = new sql_ddl_to_json_schema_1.Parser(dialect);
                    parser.feed(raw);
                    const results = Array.isArray(parser.results) ? parser.results : [parser.results];
                    const tables = results.flatMap((res) => res?.tables ?? []);
                    for (const table of tables) {
                        if (!table || !table.name)
                            continue;
                        const columns = {};
                        const indexes = [];
                        const foreignKeys = [];
                        // Process columns with enhanced metadata
                        if (table.columns) {
                            for (const col of table.columns) {
                                columns[col.name] = {
                                    type: col.type.datatype,
                                    nullable: !col.options?.notNull,
                                    primaryKey: col.options?.primaryKey || false,
                                    autoIncrement: col.options?.autoIncrement || false,
                                    defaultValue: col.options?.defaultValue,
                                    ...(col.type.length && { length: col.type.length })
                                };
                            }
                        }
                        // Extract indexes
                        if (table.indexes) {
                            table.indexes.forEach((idx) => {
                                indexes.push(idx.name || `${table.name}_${idx.columns?.join('_')}_idx`);
                            });
                        }
                        // Extract foreign keys
                        if (table.foreignKeys) {
                            table.foreignKeys.forEach((fk) => {
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
                            file: path_1.default.relative(process.cwd(), file),
                            dialect,
                            metadata: {
                                estimatedRows: 'unknown',
                                lastModified: fs_1.default.statSync(file).mtime.toISOString()
                            }
                        });
                    }
                    parsed = true;
                    break; // Successfully parsed with this dialect
                }
                catch (dialectError) {
                    // Try next dialect
                    continue;
                }
            }
            if (!parsed) {
                console.warn(`⚠️  Could not parse SQL file ${file} with any supported dialect`);
            }
        }
        catch (error) {
            console.warn(`⚠️  Failed to process SQL file ${file}: ${error}`);
        }
    }
    return resources;
}
// --- 📄 CONFIGURATION EXTRACTION ---
async function extractProjectMetadata() {
    const metadata = {
        name: path_1.default.basename(process.cwd()),
        version: "unknown",
        description: "",
        dependencies: {},
        scripts: {}
    };
    // Read package.json if it exists
    try {
        const packageJson = JSON.parse(fs_1.default.readFileSync("package.json", "utf8"));
        metadata.name = packageJson.name || metadata.name;
        metadata.version = packageJson.version || metadata.version;
        metadata.description = packageJson.description || metadata.description;
        metadata.dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
        metadata.scripts = packageJson.scripts || {};
    }
    catch (error) {
        console.warn("⚠️  Could not read package.json");
    }
    // Detect framework/stack
    const frameworks = [];
    if (metadata.dependencies.react)
        frameworks.push("React");
    if (metadata.dependencies.vue)
        frameworks.push("Vue");
    if (metadata.dependencies.angular)
        frameworks.push("Angular");
    if (metadata.dependencies.express)
        frameworks.push("Express");
    if (metadata.dependencies.nestjs)
        frameworks.push("NestJS");
    if (metadata.dependencies.next)
        frameworks.push("Next.js");
    metadata.frameworks = frameworks;
    return metadata;
}
// --- 📝 ENHANCED OUTPUT WRITER ---
async function generateMCPManifest() {
    console.log("🔍 Extracting tools and resources...");
    const [tools, resources, projectMetadata] = await Promise.all([
        extractTools(),
        extractResources(),
        extractProjectMetadata()
    ]);
    // Group tools by category for better organization
    const toolsByCategory = tools.reduce((acc, tool) => {
        const category = tool.category || 'general';
        if (!acc[category])
            acc[category] = [];
        acc[category].push(tool);
        return acc;
    }, {});
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
                    .filter(([_, param]) => param.required)
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
            toolsByCategory: Object.fromEntries(Object.entries(toolsByCategory).map(([cat, items]) => [cat, items.length])),
            filesProcessed: {
                typescript: (await (0, fast_glob_1.default)(["**/*.ts", "**/*.tsx"], { ignore: ["node_modules", "dist", "build"] })).length,
                sql: (await (0, fast_glob_1.default)(["**/*.sql"], { ignore: ["node_modules", "dist", "build"] })).length
            }
        }
    };
    mcp.description = `This project contains a Node.js + TypeScript backend and a React/React Native frontend. 
  The tools were auto-extracted from exported functions in .ts and .tsx files, including APIs, utilities, and business logic. 
  Resources were parsed from .sql files and represent real database tables. 
  Function names follow conventions like get, create, update, and delete. 
  Use these tools to build features, compose workflows, or query structured project data.`;
    return mcp;
}
// --- 🚀 MAIN FUNCTION ---
async function main() {
    try {
        const mcp = await generateMCPManifest();
        // Write the main manifest
        fs_1.default.writeFileSync("mcp.generated.json", JSON.stringify(mcp, null, 2));
        console.log("✅ MCP manifest written to mcp.generated.json");
        console.log(`📈 Extracted ${mcp.tools.length} tools and ${mcp.resources.length} resources`);
        return mcp;
    }
    catch (error) {
        console.error('❌ Error generating MCP manifest:', error);
        throw error;
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
exports.default = generateMCPManifest;
// Run main function if this file is executed directly
if (require.main === module) {
    main().catch(console.error);
}
