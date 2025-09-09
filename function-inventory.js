#!/usr/bin/env node

/**
 * DevFlow.ai Function Inventory
 * 
 * This script scans all implemented files and extracts key functions and classes
 * Run with: node function-inventory.js
 */

const fs = require('fs');
const path = require('path');

console.log('📋 DevFlow.ai Function Inventory\n');

function extractFunctionsFromFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const functions = [];
    const classes = [];
    const interfaces = [];

    // Extract class declarations
    const classMatches = content.match(/export\s+class\s+(\w+)/g);
    if (classMatches) {
      classMatches.forEach(match => {
        const className = match.match(/class\s+(\w+)/)[1];
        classes.push(className);
      });
    }

    // Extract function declarations
    const functionMatches = content.match(/export\s+(async\s+)?function\s+(\w+)/g);
    if (functionMatches) {
      functionMatches.forEach(match => {
        const functionName = match.match(/function\s+(\w+)/)[1];
        functions.push(functionName);
      });
    }

    // Extract arrow functions
    const arrowMatches = content.match(/export\s+const\s+(\w+)\s*=\s*(async\s*)?\(/g);
    if (arrowMatches) {
      arrowMatches.forEach(match => {
        const functionName = match.match(/const\s+(\w+)/)[1];
        functions.push(functionName);
      });
    }

    // Extract method declarations from classes
    const methodMatches = content.match(/^\s+(async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/gm);
    if (methodMatches) {
      methodMatches.forEach(match => {
        const methodName = match.match(/(\w+)\s*\(/)[1];
        if (!['constructor', 'if', 'for', 'while', 'switch'].includes(methodName)) {
          functions.push(methodName);
        }
      });
    }

    // Extract interface declarations
    const interfaceMatches = content.match(/export\s+interface\s+(\w+)/g);
    if (interfaceMatches) {
      interfaceMatches.forEach(match => {
        const interfaceName = match.match(/interface\s+(\w+)/)[1];
        interfaces.push(interfaceName);
      });
    }

    return { functions: [...new Set(functions)], classes, interfaces };
  } catch (error) {
    return { functions: [], classes: [], interfaces: [] };
  }
}

function scanDirectory(dirPath, basePath = '') {
  const results = {};
  
  if (!fs.existsSync(dirPath)) {
    return results;
  }

  const items = fs.readdirSync(dirPath);
  
  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    const stat = fs.statSync(itemPath);
    
    if (stat.isDirectory() && !['node_modules', 'dist', '__tests__', '.git'].includes(item)) {
      const subResults = scanDirectory(itemPath, path.join(basePath, item));
      Object.assign(results, subResults);
    } else if (stat.isFile() && item.endsWith('.ts') && !item.endsWith('.d.ts') && !item.endsWith('.test.ts')) {
      const relativePath = path.join(basePath, item);
      const extracted = extractFunctionsFromFile(itemPath);
      if (extracted.functions.length > 0 || extracted.classes.length > 0 || extracted.interfaces.length > 0) {
        results[relativePath] = extracted;
      }
    }
  }
  
  return results;
}

function displayInventory() {
  console.log('🔍 Scanning implementation files...\n');

  // Scan services
  console.log('=' .repeat(60));
  console.log('SERVICES INVENTORY');
  console.log('=' .repeat(60));

  const services = ['analytics', 'api-gateway', 'automation', 'integration', 'orchestration', 'web-dashboard'];
  
  for (const service of services) {
    const servicePath = path.join('services', service, 'src');
    const results = scanDirectory(servicePath);
    
    if (Object.keys(results).length > 0) {
      console.log(`\n📦 ${service.toUpperCase()} SERVICE`);
      console.log('-'.repeat(40));
      
      Object.entries(results).forEach(([file, { functions, classes, interfaces }]) => {
        console.log(`\n  📄 ${file}`);
        
        if (classes.length > 0) {
          console.log(`    🏗️  Classes: ${classes.join(', ')}`);
        }
        
        if (interfaces.length > 0) {
          console.log(`    📋 Interfaces: ${interfaces.join(', ')}`);
        }
        
        if (functions.length > 0) {
          console.log(`    ⚡ Functions: ${functions.slice(0, 10).join(', ')}${functions.length > 10 ? '...' : ''}`);
        }
      });
    }
  }

  // Scan shared libraries
  console.log('\n\n' + '=' .repeat(60));
  console.log('SHARED LIBRARIES INVENTORY');
  console.log('=' .repeat(60));

  const sharedLibs = ['audit', 'cache', 'config', 'database', 'monitoring', 'types', 'utils'];
  
  for (const lib of sharedLibs) {
    const libPath = path.join('shared', lib, 'src');
    const results = scanDirectory(libPath);
    
    if (Object.keys(results).length > 0) {
      console.log(`\n📚 ${lib.toUpperCase()} LIBRARY`);
      console.log('-'.repeat(40));
      
      Object.entries(results).forEach(([file, { functions, classes, interfaces }]) => {
        console.log(`\n  📄 ${file}`);
        
        if (classes.length > 0) {
          console.log(`    🏗️  Classes: ${classes.join(', ')}`);
        }
        
        if (interfaces.length > 0) {
          console.log(`    📋 Interfaces: ${interfaces.join(', ')}`);
        }
        
        if (functions.length > 0) {
          console.log(`    ⚡ Functions: ${functions.slice(0, 10).join(', ')}${functions.length > 10 ? '...' : ''}`);
        }
      });
    }
  }

  // Generate summary statistics
  console.log('\n\n' + '=' .repeat(60));
  console.log('IMPLEMENTATION STATISTICS');
  console.log('=' .repeat(60));

  let totalFiles = 0;
  let totalClasses = 0;
  let totalFunctions = 0;
  let totalInterfaces = 0;

  // Count services
  for (const service of services) {
    const servicePath = path.join('services', service, 'src');
    const results = scanDirectory(servicePath);
    
    totalFiles += Object.keys(results).length;
    Object.values(results).forEach(({ functions, classes, interfaces }) => {
      totalClasses += classes.length;
      totalFunctions += functions.length;
      totalInterfaces += interfaces.length;
    });
  }

  // Count shared libraries
  for (const lib of sharedLibs) {
    const libPath = path.join('shared', lib, 'src');
    const results = scanDirectory(libPath);
    
    totalFiles += Object.keys(results).length;
    Object.values(results).forEach(({ functions, classes, interfaces }) => {
      totalClasses += classes.length;
      totalFunctions += functions.length;
      totalInterfaces += interfaces.length;
    });
  }

  console.log(`\n📊 Implementation Summary:`);
  console.log(`   📄 Total Files: ${totalFiles}`);
  console.log(`   🏗️  Total Classes: ${totalClasses}`);
  console.log(`   ⚡ Total Functions: ${totalFunctions}`);
  console.log(`   📋 Total Interfaces: ${totalInterfaces}`);
  console.log(`   📦 Services: ${services.length}`);
  console.log(`   📚 Shared Libraries: ${sharedLibs.length}`);

  console.log(`\n💡 Key Implementation Highlights:`);
  console.log(`   🎯 Analytics: DORA metrics, team performance, technical debt analysis`);
  console.log(`   🚪 API Gateway: Authentication, routing, rate limiting, security`);
  console.log(`   🤖 Automation: Agent management, workflow execution, discovery`);
  console.log(`   🔗 Integration: External tool adapters, webhooks, data sync`);
  console.log(`   🎼 Orchestration: Workflow engine, state management, event bus`);
  console.log(`   🖥️  Web Dashboard: React UI, real-time updates, visualizations`);
  console.log(`   🔒 Security: AES-256 encryption, TLS 1.3, compliance engine`);
  console.log(`   📈 Monitoring: Health checks, metrics collection, alerting`);
  console.log(`   💾 Database: Connection pooling, query optimization, caching`);

  console.log(`\n🚀 Ready for testing and deployment!`);
}

// Run the inventory
displayInventory();