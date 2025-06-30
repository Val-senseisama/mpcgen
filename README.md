# MCP Generator

A powerful Node.js tool that automatically generates comprehensive Model Context Protocol (MCP) manifests by extracting tools and resources from your codebase with advanced analysis capabilities.

## 🎯 Purpose

This tool intelligently scans your TypeScript/JavaScript project and SQL files to automatically create detailed MCP manifests for AI assistants and development tools. It extracts:

- **Tools**: Exported functions from `.ts` and `.tsx` files with enhanced metadata
- **Resources**: Database tables from `.sql` files with schema details
- **Project Metadata**: Framework detection and package information
- **Statistics**: Comprehensive analysis of your codebase

## ✨ Enhanced Features

- **Advanced Function Detection**: Sophisticated pattern matching for function categorization
- **Multi-Dialect SQL Support**: Parses MySQL, PostgreSQL, SQLite, and MSSQL
- **Smart Type Analysis**: Converts TypeScript types to JSON Schema with enum support
- **JSDoc Integration**: Extracts documentation and examples from comments
- **Function Categorization**: Auto-categorizes functions by purpose and location
- **Duplicate Prevention**: Prevents duplicate function extraction
- **Framework Detection**: Automatically detects React, Vue, Angular, Express, NestJS, Next.js
- **Programmatic API**: Can be used as a library or CLI tool

## 🚀 Installation

```bash
npm install mcp-generator
```

## 📦 Dependencies

- `ts-morph`: Advanced TypeScript AST manipulation
- `fast-glob`: Fast file globbing with ignore patterns
- `sql-ddl-to-json-schema`: Multi-dialect SQL DDL parsing

## 🛠️ Usage

### CLI Usage

```bash
# Install globally
npm install -g mcp-generator

# Run in any project directory
mcp-generator
```

### Programmatic Usage

```javascript
import generateMCPManifest from 'mcp-generator';

// Generate MCP manifest programmatically
const mcp = await generateMCPManifest();
console.log(`Found ${mcp.tools.length} tools and ${mcp.resources.length} resources`);

// The function returns the MCP manifest object
// You can customize the output or integrate it into your build process
```

### What it does

1. **Scans your codebase** for `.ts`, `.tsx`, and `.sql` files (excluding tests and build files)
2. **Extracts exported functions** with parameters, types, and documentation
3. **Parses SQL files** across multiple dialects to identify database schema
4. **Analyzes project metadata** from package.json and framework detection
5. **Generates comprehensive MCP manifest** as `mcp.generated.json`

### Output

The tool generates a single `mcp.generated.json` file with the following structure:

```json
{
  "mcpVersion": "0.1.0",
  "info": {
    "name": "project-name",
    "version": "1.0.0",
    "description": "Project description",
    "frameworks": ["React", "Express"],
    "generatedAt": "2024-01-01T00:00:00.000Z"
  },
  "tools": [
    {
      "name": "getUserById",
      "description": "Fetch a specific user by ID",
      "inputSchema": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "required": true,
            "description": "User ID"
          }
        },
        "required": ["id"]
      },
      "returnType": "object",
      "category": "data-access",
      "file": "src/services/userService.ts",
      "examples": ["getUserById('123')"]
    }
  ],
  "resources": [
    {
      "uri": "sql://users",
      "name": "users",
      "description": "Database table: users",
      "mimeType": "application/json",
      "metadata": {
        "type": "sql_table",
        "columns": {
          "id": {
            "type": "INT",
            "nullable": false,
            "primaryKey": true,
            "autoIncrement": true
          }
        },
        "indexes": ["users_id_idx"],
        "foreignKeys": [],
        "dialect": "mysql"
      }
    }
  ],
  "statistics": {
    "totalTools": 25,
    "totalResources": 8,
    "toolsByCategory": {
      "data-access": 10,
      "api": 5,
      "utility": 8
    },
    "filesProcessed": {
      "typescript": 45,
      "sql": 3
    }
  }
}
```

## 🔧 Advanced Function Detection

The tool uses sophisticated pattern matching to categorize and describe functions:

### Function Categories
- **`get*`, `fetch*`, `find*`, `retrieve*`, `load*`, `query*`**: Data access functions
- **`create*`, `add*`, `insert*`, `post*`**: Data creation functions
- **`update*`, `edit*`, `modify*`, `patch*`, `put*`**: Data modification functions
- **`delete*`, `remove*`, `destroy*`**: Data deletion functions
- **`list*`, `getAll*`**: List/collection functions
- **`search*`, `filter*`**: Search and filter functions
- **`validate*`, `check*`, `verify*`**: Validation functions
- **`auth*`, `login*`, `logout*`, `register*`**: Authentication functions

### Smart Filtering
- Skips private functions (starting with `_` or `#`)
- Excludes test files (`*.test.*`, `*.spec.*`)
- Filters out internal utilities and constructors
- Prevents React component extraction (unless utility functions)

### Type Analysis
- Converts TypeScript types to JSON Schema
- Handles union types and enums
- Processes Promise types and arrays
- Extracts optional parameter information

## 📊 Enhanced SQL Processing

### Multi-Dialect Support
- **MySQL**: Full support with indexes and foreign keys
- **PostgreSQL**: Compatible parsing
- **SQLite**: Basic schema extraction
- **MSSQL**: Microsoft SQL Server support

### Schema Details
- Column types, nullability, and constraints
- Primary keys and auto-increment fields
- Default values and length specifications
- Index definitions
- Foreign key relationships
- File metadata and modification dates

## 🎯 Use Cases

- **AI Assistant Integration**: Provide rich context about your codebase to AI tools
- **API Documentation**: Auto-generate comprehensive API documentation
- **Code Analysis**: Understand your project's structure and capabilities
- **Development Workflows**: Enable AI-powered development assistance
- **Database Schema Analysis**: Document and analyze database structure
- **Team Onboarding**: Help new developers understand the codebase
- **Build Process Integration**: Generate manifests as part of CI/CD pipelines

## 🔍 How it Works

### Enhanced Tool Extraction Process

1. **File Discovery**: Uses fast-glob to find TypeScript files with smart exclusions
2. **AST Parsing**: Leverages ts-morph for robust TypeScript parsing
3. **Function Detection**: Identifies functions, arrow functions, and class methods
4. **Export Analysis**: Checks for exported functions with multiple strategies
5. **Parameter Extraction**: Extracts parameters with type information and optionality
6. **Documentation Parsing**: Reads JSDoc comments for descriptions and examples
7. **Categorization**: Assigns categories based on function names and file paths
8. **Duplicate Prevention**: Ensures each function is only extracted once

### Advanced Resource Extraction Process

1. **SQL File Discovery**: Finds SQL files across the project
2. **Multi-Dialect Parsing**: Attempts parsing with different SQL dialects
3. **Schema Analysis**: Extracts tables, columns, and relationships
4. **Metadata Enhancement**: Adds indexes, foreign keys, and constraints
5. **File Information**: Includes file paths and modification dates

### Project Metadata Extraction

1. **Package.json Analysis**: Reads project name, version, and dependencies
2. **Framework Detection**: Identifies React, Vue, Angular, Express, NestJS, Next.js
3. **Dependency Analysis**: Maps development and production dependencies
4. **Script Discovery**: Extracts available npm scripts

## 🚧 Limitations

- Only processes exported functions (not internal/private functions)
- Skips functions starting with underscore (`_`) or hash (`#`)
- Excludes test files and build artifacts
- Requires TypeScript configuration (`tsconfig.json`)
- SQL parsing may not handle complex stored procedures
- JSDoc parsing is limited to basic comment extraction

## 📁 File Structure

```
mpcgen/
├── index.ts              # Main generator script
├── tsconfig.json         # TypeScript configuration
├── package.json          # Dependencies and scripts
├── mcp.generated.json    # Generated MCP manifest (created after running)
└── README.md            # This file
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with your codebase
5. Submit a pull request

## 📄 License

This project is open source and available under the MIT License.

## 🔗 Related

- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- [ts-morph](https://ts-morph.com/)
- [sql-ddl-to-json-schema](https://github.com/duartealexf/sql-ddl-to-json-schema)

---

**Note**: This tool is designed to work with Node.js + TypeScript backends and modern frontend frameworks, providing comprehensive codebase analysis for AI-assisted development workflows. 