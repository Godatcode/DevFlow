#!/usr/bin/env ts-node

import { MigrationManager } from '../shared/config/src/migrations/migration-manager';
import { InfluxDBSchemaSetup } from '../shared/config/src/influxdb-schema';
import { DatabaseManager } from '../shared/config/src/database-connection';

interface MigrateOptions {
  command: 'up' | 'down' | 'status' | 'validate' | 'setup-influx';
  target?: string;
  dryRun?: boolean;
}

class MigrationCLI {
  private migrationManager: MigrationManager;
  private influxSetup: InfluxDBSchemaSetup;
  private dbManager: DatabaseManager;

  constructor() {
    this.migrationManager = MigrationManager.getInstance();
    this.influxSetup = new InfluxDBSchemaSetup();
    this.dbManager = DatabaseManager.getInstance();
  }

  async run(options: MigrateOptions): Promise<void> {
    try {
      console.log(`🚀 DevFlow.ai Database Migration Tool`);
      console.log(`Command: ${options.command}`);
      console.log('');

      // Check database connectivity
      const health = await this.dbManager.healthCheck();
      if (!health.postgres) {
        throw new Error('PostgreSQL is not accessible. Please check your connection settings.');
      }

      switch (options.command) {
        case 'up':
          await this.runMigrations(options.dryRun);
          break;
        case 'down':
          await this.rollbackMigrations(options.target, options.dryRun);
          break;
        case 'status':
          await this.showMigrationStatus();
          break;
        case 'validate':
          await this.validateMigrations();
          break;
        case 'setup-influx':
          await this.setupInfluxDB();
          break;
        default:
          this.showHelp();
      }
    } catch (error) {
      console.error('❌ Migration failed:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  }

  private async runMigrations(dryRun: boolean = false): Promise<void> {
    console.log('📊 Running database migrations...');
    
    if (dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be applied');
      const pending = await this.migrationManager.getPendingMigrations();
      console.log(`Found ${pending.length} pending migrations:`);
      pending.forEach(migration => {
        console.log(`  - ${migration.id}: ${migration.name}`);
      });
      return;
    }

    const result = await this.migrationManager.migrate();
    
    if (result.success) {
      console.log(`✅ Successfully applied ${result.migrationsApplied} migrations`);
      if (result.appliedMigrations.length > 0) {
        console.log('Applied migrations:');
        result.appliedMigrations.forEach(id => {
          console.log(`  - ${id}`);
        });
      }
    } else {
      console.log('❌ Migration failed');
      result.errors.forEach(error => {
        console.log(`  - ${error}`);
      });
      throw new Error('Migration failed');
    }
  }

  private async rollbackMigrations(target?: string, dryRun: boolean = false): Promise<void> {
    console.log('⏪ Rolling back database migrations...');
    
    if (dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be applied');
      const applied = await this.migrationManager.getAppliedMigrations();
      if (target) {
        const targetIndex = applied.findIndex(m => m.version === target);
        if (targetIndex === -1) {
          console.log(`Target version ${target} not found`);
          return;
        }
        const toRollback = applied.slice(targetIndex + 1).reverse();
        console.log(`Would rollback ${toRollback.length} migrations to version ${target}:`);
        toRollback.forEach(migration => {
          console.log(`  - ${migration.id}: ${migration.name}`);
        });
      } else {
        const lastMigration = applied[applied.length - 1];
        if (lastMigration) {
          console.log(`Would rollback last migration: ${lastMigration.id}`);
        } else {
          console.log('No migrations to rollback');
        }
      }
      return;
    }

    const result = await this.migrationManager.rollback(target);
    
    if (result.success) {
      console.log(`✅ Successfully rolled back ${result.migrationsApplied} migrations`);
      if (result.appliedMigrations.length > 0) {
        console.log('Rolled back migrations:');
        result.appliedMigrations.forEach(id => {
          console.log(`  - ${id}`);
        });
      }
    } else {
      console.log('❌ Rollback failed');
      result.errors.forEach(error => {
        console.log(`  - ${error}`);
      });
      throw new Error('Rollback failed');
    }
  }

  private async showMigrationStatus(): Promise<void> {
    console.log('📋 Migration Status');
    console.log('');

    const status = await this.migrationManager.getMigrationStatus();
    
    console.log(`Applied migrations: ${status.appliedCount}`);
    console.log(`Pending migrations: ${status.pendingCount}`);
    
    if (status.lastApplied) {
      console.log(`Last applied: ${status.lastApplied.id} (${status.lastApplied.appliedAt?.toISOString()})`);
    }
    
    if (status.nextPending) {
      console.log(`Next pending: ${status.nextPending.id}`);
    }

    console.log('');

    // Show detailed migration list
    const [applied, pending] = await Promise.all([
      this.migrationManager.getAppliedMigrations(),
      this.migrationManager.getPendingMigrations()
    ]);

    if (applied.length > 0) {
      console.log('✅ Applied Migrations:');
      applied.forEach(migration => {
        console.log(`  ${migration.version.padEnd(3)} ${migration.id.padEnd(30)} ${migration.appliedAt?.toISOString()}`);
      });
      console.log('');
    }

    if (pending.length > 0) {
      console.log('⏳ Pending Migrations:');
      pending.forEach(migration => {
        console.log(`  ${migration.version.padEnd(3)} ${migration.id.padEnd(30)} ${migration.name}`);
      });
    }
  }

  private async validateMigrations(): Promise<void> {
    console.log('🔍 Validating migration integrity...');
    
    const validation = await this.migrationManager.validateMigrationIntegrity();
    
    if (validation.valid) {
      console.log('✅ All migrations are valid');
    } else {
      console.log('❌ Migration validation failed:');
      validation.errors.forEach(error => {
        console.log(`  - ${error}`);
      });
      throw new Error('Migration validation failed');
    }
  }

  private async setupInfluxDB(): Promise<void> {
    console.log('🔧 Setting up InfluxDB schema...');
    
    // Check InfluxDB connectivity
    const health = await this.dbManager.healthCheck();
    if (!health.influx) {
      throw new Error('InfluxDB is not accessible. Please check your connection settings.');
    }

    try {
      await this.influxSetup.setupBuckets();
      console.log('✅ InfluxDB buckets configured');

      await this.influxSetup.setupRetentionPolicies();
      console.log('✅ InfluxDB retention policies configured');

      await this.influxSetup.setupContinuousQueries();
      console.log('✅ InfluxDB tasks configured');

      const isValid = await this.influxSetup.validateSchema();
      if (isValid) {
        console.log('✅ InfluxDB schema validation passed');
      } else {
        console.log('⚠️  InfluxDB schema validation failed');
      }

      console.log('');
      console.log('📊 InfluxDB Measurement Schemas:');
      const schemas = this.influxSetup.getMeasurementSchemas();
      Object.entries(schemas).forEach(([measurement, schema]) => {
        console.log(`  ${measurement}:`);
        console.log(`    Tags: ${schema.tags.join(', ')}`);
        console.log(`    Fields: ${schema.fields.join(', ')}`);
        console.log(`    Description: ${schema.description}`);
        console.log('');
      });

    } catch (error) {
      console.error('❌ InfluxDB setup failed:', error);
      throw error;
    }
  }

  private showHelp(): void {
    console.log('Usage: npm run migrate <command> [options]');
    console.log('');
    console.log('Commands:');
    console.log('  up              Run pending migrations');
    console.log('  down [version]  Rollback migrations (to specific version or last one)');
    console.log('  status          Show migration status');
    console.log('  validate        Validate migration integrity');
    console.log('  setup-influx    Setup InfluxDB schema');
    console.log('');
    console.log('Options:');
    console.log('  --dry-run       Show what would be done without applying changes');
    console.log('');
    console.log('Examples:');
    console.log('  npm run migrate up');
    console.log('  npm run migrate down 001');
    console.log('  npm run migrate status');
    console.log('  npm run migrate up -- --dry-run');
  }
}

// Parse command line arguments
function parseArgs(): MigrateOptions {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    return { command: 'status' };
  }

  const command = args[0] as MigrateOptions['command'];
  const target = args[1] && !args[1].startsWith('--') ? args[1] : undefined;
  const dryRun = args.includes('--dry-run');

  return { command, target, dryRun };
}

// Main execution
async function main() {
  const options = parseArgs();
  const cli = new MigrationCLI();
  await cli.run(options);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { MigrationCLI };