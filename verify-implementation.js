#!/usr/bin/env node

/**
 * DevFlow.ai Implementation Verification Script
 * 
 * This script performs quick verification of all implemented components
 * Run with: node verify-implementation.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 DevFlow.ai Implementation Verification\n');

const services = [
  'analytics',
  'api-gateway', 
  'automation',
  'integration',
  'orchestration',
  'web-dashboard'
];

const sharedLibs = [
  'audit',
  'cache', 
  'config',
  'database',
  'monitoring',
  'types',
  'utils'
];

let results = {
  services: {},
  shared: {},
  summary: { passed: 0, failed: 0, total: 0 }
};

function runCommand(command, cwd = process.cwd()) {
  try {
    execSync(command, { cwd, stdio: 'pipe' });
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function checkDirectory(dirPath) {
  return fs.existsSync(dirPath);
}

function checkPackageJson(dirPath) {
  const packagePath = path.join(dirPath, 'package.json');
  return fs.existsSync(packagePath);
}

function checkDistDirectory(dirPath) {
  const distPath = path.join(dirPath, 'dist');
  return fs.existsSync(distPath);
}

function verifyComponent(name, basePath, type) {
  console.log(`\n📦 Verifying ${type}: ${name}`);
  
  const componentPath = path.join(basePath, name);
  const result = {
    exists: false,
    hasPackageJson: false,
    hasSource: false,
    builds: false,
    hasTests: false,
    testsPass: false
  };

  // Check if directory exists
  result.exists = checkDirectory(componentPath);
  if (!result.exists) {
    console.log(`   ❌ Directory not found: ${componentPath}`);
    return result;
  }
  console.log(`   ✅ Directory exists`);

  // Check package.json
  result.hasPackageJson = checkPackageJson(componentPath);
  if (result.hasPackageJson) {
    console.log(`   ✅ package.json found`);
  } else {
    console.log(`   ❌ package.json missing`);
  }

  // Check source directory
  const srcPath = path.join(componentPath, 'src');
  result.hasSource = checkDirectory(srcPath);
  if (result.hasSource) {
    console.log(`   ✅ Source directory exists`);
  } else {
    console.log(`   ❌ Source directory missing`);
  }

  // Check if it builds
  if (result.hasPackageJson) {
    console.log(`   🔨 Testing build...`);
    const buildResult = runCommand('npm run build', componentPath);
    result.builds = buildResult.success;
    if (result.builds) {
      console.log(`   ✅ Builds successfully`);
    } else {
      console.log(`   ❌ Build failed: ${buildResult.error?.substring(0, 100)}...`);
    }
  }

  // Check for tests
  const testPath = path.join(srcPath, '__tests__');
  result.hasTests = checkDirectory(testPath) || fs.existsSync(path.join(componentPath, 'vitest.config.ts'));
  if (result.hasTests) {
    console.log(`   ✅ Tests found`);
    
    // Try to run tests
    console.log(`   🧪 Running tests...`);
    const testResult = runCommand('npm test', componentPath);
    result.testsPass = testResult.success;
    if (result.testsPass) {
      console.log(`   ✅ Tests pass`);
    } else {
      console.log(`   ⚠️  Tests failed or no test command`);
    }
  } else {
    console.log(`   ⚠️  No tests found`);
  }

  return result;
}

function calculateScore(result) {
  let score = 0;
  let total = 5;
  
  if (result.exists) score++;
  if (result.hasPackageJson) score++;
  if (result.hasSource) score++;
  if (result.builds) score++;
  if (result.testsPass) score++;
  
  return { score, total };
}

async function main() {
  console.log('🔍 Starting verification process...\n');

  // Verify services
  console.log('=' .repeat(50));
  console.log('SERVICES VERIFICATION');
  console.log('=' .repeat(50));
  
  for (const service of services) {
    const result = verifyComponent(service, 'services', 'Service');
    results.services[service] = result;
    
    const { score, total } = calculateScore(result);
    results.summary.total += total;
    results.summary.passed += score;
    if (score < total) results.summary.failed += (total - score);
  }

  // Verify shared libraries
  console.log('\n' + '=' .repeat(50));
  console.log('SHARED LIBRARIES VERIFICATION');
  console.log('=' .repeat(50));
  
  for (const lib of sharedLibs) {
    const result = verifyComponent(lib, 'shared', 'Shared Library');
    results.shared[lib] = result;
    
    const { score, total } = calculateScore(result);
    results.summary.total += total;
    results.summary.passed += score;
    if (score < total) results.summary.failed += (total - score);
  }

  // Generate summary report
  console.log('\n' + '=' .repeat(50));
  console.log('VERIFICATION SUMMARY');
  console.log('=' .repeat(50));
  
  console.log(`\n📊 Overall Results:`);
  console.log(`   ✅ Passed: ${results.summary.passed}/${results.summary.total}`);
  console.log(`   ❌ Failed: ${results.summary.failed}/${results.summary.total}`);
  console.log(`   📈 Success Rate: ${Math.round((results.summary.passed / results.summary.total) * 100)}%`);

  // Detailed breakdown
  console.log(`\n📋 Services Status:`);
  for (const [name, result] of Object.entries(results.services)) {
    const { score, total } = calculateScore(result);
    const status = score === total ? '✅' : score > total/2 ? '⚠️' : '❌';
    console.log(`   ${status} ${name}: ${score}/${total}`);
  }

  console.log(`\n📚 Shared Libraries Status:`);
  for (const [name, result] of Object.entries(results.shared)) {
    const { score, total } = calculateScore(result);
    const status = score === total ? '✅' : score > total/2 ? '⚠️' : '❌';
    console.log(`   ${status} ${name}: ${score}/${total}`);
  }

  // Recommendations
  console.log(`\n💡 Recommendations:`);
  
  const failedComponents = [];
  Object.entries({...results.services, ...results.shared}).forEach(([name, result]) => {
    const { score, total } = calculateScore(result);
    if (score < total) {
      failedComponents.push({ name, score, total, result });
    }
  });

  if (failedComponents.length === 0) {
    console.log(`   🎉 All components are working perfectly!`);
  } else {
    console.log(`   🔧 ${failedComponents.length} components need attention:`);
    failedComponents.forEach(({ name, score, total, result }) => {
      console.log(`      - ${name} (${score}/${total})`);
      if (!result.builds) console.log(`        • Fix build issues`);
      if (!result.testsPass && result.hasTests) console.log(`        • Fix failing tests`);
      if (!result.hasTests) console.log(`        • Add test coverage`);
    });
  }

  console.log(`\n📖 For detailed verification steps, see: IMPLEMENTATION_VERIFICATION_GUIDE.md`);
  console.log(`\n🏁 Verification complete!`);
}

// Run the verification
main().catch(console.error);