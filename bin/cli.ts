#!/usr/bin/env node

import { Command } from 'commander';
import generateMCPManifest from '../index.js';
import fs from 'fs';
import path from 'path';

const program = new Command();

program
  .name('mcp-generator')
  .description('Generate MCP manifests from your TypeScript/JavaScript codebase')
  .version('1.0.6');

program
  .command('generate')
  .description('Generate MCP manifest for the current project')
  .option('-o, --output <file>', 'Output file name', 'mcp.generated.json')
  .option('--no-summary', 'Skip generating summary file')
  .action(async (options) => {
    try {
      console.log('🚀 Starting MCP manifest generation...');
      
      const mcp = await generateMCPManifest();
      
      // Write the main manifest
      fs.writeFileSync(options.output, JSON.stringify(mcp, null, 2));
      console.log(`✅ MCP manifest written to ${options.output}`);
      
      // Write summary if requested
      if (options.summary !== false) {
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

        fs.writeFileSync('mcp.summary.md', summary);
        console.log('📊 Summary written to mcp.summary.md');
      }
      
      console.log(`📈 Extracted ${mcp.statistics.totalTools} tools and ${mcp.statistics.totalResources} resources`);
      
      // Show summary in console
      console.log('\n' + '='.repeat(50));
      console.log('📋 GENERATION SUMMARY');
      console.log('='.repeat(50));
      console.log(`Project: ${mcp.info.name}`);
      console.log(`Tools: ${mcp.statistics.totalTools}`);
      console.log(`Resources: ${mcp.statistics.totalResources}`);
      console.log(`Frameworks: ${mcp.info.frameworks.join(', ') || 'None detected'}`);
      console.log('='.repeat(50));
      
    } catch (error) {
      console.error('❌ Error generating MCP manifest:', error);
      process.exit(1);
    }
  });

program
  .command('info')
  .description('Show project information without generating files')
  .action(async () => {
    try {
      console.log('🔍 Analyzing project...');
      
      const mcp = await generateMCPManifest();
      
      console.log('\n' + '='.repeat(50));
      console.log('📋 PROJECT ANALYSIS');
      console.log('='.repeat(50));
      console.log(`Project: ${mcp.info.name}`);
      console.log(`Version: ${mcp.info.version}`);
      console.log(`Description: ${mcp.info.description}`);
      console.log(`Frameworks: ${mcp.info.frameworks.join(', ') || 'None detected'}`);
      console.log(`Tools Found: ${mcp.statistics.totalTools}`);
      console.log(`Resources Found: ${mcp.statistics.totalResources}`);
      console.log(`Files Processed: ${mcp.statistics.filesProcessed.typescript} TS, ${mcp.statistics.filesProcessed.sql} SQL`);
      console.log('='.repeat(50));
      
    } catch (error) {
      console.error('❌ Error analyzing project:', error);
      process.exit(1);
    }
  });

// Default command (when no subcommand is provided)
program
  .action(async () => {
    // Run the generate command by default
    console.log('🚀 Starting MCP manifest generation...');
    
    try {
      const mcp = await generateMCPManifest();
      
      // Write the main manifest
      fs.writeFileSync('mcp.generated.json', JSON.stringify(mcp, null, 2));
      console.log('✅ MCP manifest written to mcp.generated.json');
      
      // Write summary
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

      fs.writeFileSync('mcp.summary.md', summary);
      console.log('📊 Summary written to mcp.summary.md');
      
      console.log(`📈 Extracted ${mcp.statistics.totalTools} tools and ${mcp.statistics.totalResources} resources`);
      
      // Show summary in console
      console.log('\n' + '='.repeat(50));
      console.log('📋 GENERATION SUMMARY');
      console.log('='.repeat(50));
      console.log(`Project: ${mcp.info.name}`);
      console.log(`Tools: ${mcp.statistics.totalTools}`);
      console.log(`Resources: ${mcp.statistics.totalResources}`);
      console.log(`Frameworks: ${mcp.info.frameworks.join(', ') || 'None detected'}`);
      console.log('='.repeat(50));
      
    } catch (error) {
      console.error('❌ Error generating MCP manifest:', error);
      process.exit(1);
    }
  });

program.parse(process.argv);
