import { PoolClient } from 'pg';
import { PostgreSQLConnection, DatabaseConnectionError } from '../database-connection';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

export interface Migration {
  id: string;
  name: string;
  version: string;
  up: string;
  down: string;
  checksum: string;
  appliedAt?: Date;
}

export interface MigrationResult {
  success: boolean;
  migrationsApplied: number;
  errors: string[];
  appliedMigrations: string[];
}

export class MigrationManager {
  private static instance: MigrationManager;
  private postgres: PostgreSQLConnection;
  private migrationsPath: string;

  private constructor(migrationsPath: string = join(__dirname, 'sql')) {
    this.postgres = PostgreSQLConnection.getInstance();
    this.migrationsPath = migrationsPath;
  }

  static getInstance(migrationsPath?: string): MigrationManager {
    if (!MigrationManager.instance) {
      MigrationManager.instance = new MigrationManager(migrationsPath);
    }
    return MigrationManager.instance;
  }

  async initializeMigrationTable(): Promise<void> {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_id VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        version VARCHAR(50) NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        execution_time INTEGER NOT NULL DEFAULT 0
      );
      
      CREATE INDEX IF NOT EXISTS idx_schema_migrations_version ON schema_migrations(version);
      CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at ON schema_migrations(applied_at);
    `;

    try {
      await this.postgres.query(createTableSQL);
    } catch (error) {
      throw new DatabaseConnectionError(
        `Failed to initialize migration table: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'MIGRATION_TABLE_INIT_ERROR'
      );
    }
  }

  async loadMigrations(): Promise<Migration[]> {
    try {
      const files = await readdir(this.migrationsPath);
      const migrationFiles = files
        .filter(file => file.endsWith('.sql'))
        .sort(); // Ensure consistent ordering

      const migrations: Migration[] = [];

      for (const file of migrationFiles) {
        const filePath = join(this.migrationsPath, file);
        const content = await readFile(filePath, 'utf-8');
        
        const migration = this.parseMigrationFile(file, content);
        migrations.push(migration);
      }

      return migrations;
    } catch (error) {
      throw new DatabaseConnectionError(
        `Failed to load migrations: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'MIGRATION_LOAD_ERROR'
      );
    }
  }

  private parseMigrationFile(filename: string, content: string): Migration {
    // Extract migration metadata from filename (e.g., "001_create_users_table.sql")
    const match = filename.match(/^(\d+)_(.+)\.sql$/);
    if (!match) {
      throw new Error(`Invalid migration filename format: ${filename}`);
    }

    const [, version, name] = match;
    const id = `${version}_${name}`;

    // Split content into up and down migrations
    const sections = content.split(/-- DOWN|-- down/i);
    const up = sections[0].replace(/-- UP|-- up/i, '').trim();
    const down = sections[1] ? sections[1].trim() : '';

    // Generate checksum for migration integrity
    const checksum = this.generateChecksum(up + down);

    return {
      id,
      name: name.replace(/_/g, ' '),
      version,
      up,
      down,
      checksum
    };
  }

  private generateChecksum(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async getAppliedMigrations(): Promise<Migration[]> {
    try {
      const rows = await this.postgres.query<{
        migration_id: string;
        name: string;
        version: string;
        checksum: string;
        applied_at: Date;
      }>(`
        SELECT migration_id, name, version, checksum, applied_at
        FROM schema_migrations
        ORDER BY version ASC
      `);

      return rows.map(row => ({
        id: row.migration_id,
        name: row.name,
        version: row.version,
        up: '',
        down: '',
        checksum: row.checksum,
        appliedAt: row.applied_at
      }));
    } catch (error) {
      throw new DatabaseConnectionError(
        `Failed to get applied migrations: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'MIGRATION_QUERY_ERROR'
      );
    }
  }

  async getPendingMigrations(): Promise<Migration[]> {
    const [allMigrations, appliedMigrations] = await Promise.all([
      this.loadMigrations(),
      this.getAppliedMigrations()
    ]);

    const appliedIds = new Set(appliedMigrations.map(m => m.id));
    return allMigrations.filter(migration => !appliedIds.has(migration.id));
  }

  async validateMigrationIntegrity(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    try {
      const [allMigrations, appliedMigrations] = await Promise.all([
        this.loadMigrations(),
        this.getAppliedMigrations()
      ]);

      const migrationMap = new Map(allMigrations.map(m => [m.id, m]));

      for (const applied of appliedMigrations) {
        const current = migrationMap.get(applied.id);
        
        if (!current) {
          errors.push(`Applied migration ${applied.id} not found in migration files`);
          continue;
        }

        if (current.checksum !== applied.checksum) {
          errors.push(`Migration ${applied.id} has been modified after being applied`);
        }
      }

      return {
        valid: errors.length === 0,
        errors
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Failed to validate migration integrity: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  async migrate(): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      migrationsApplied: 0,
      errors: [],
      appliedMigrations: []
    };

    try {
      // Initialize migration table
      await this.initializeMigrationTable();

      // Validate existing migrations
      const validation = await this.validateMigrationIntegrity();
      if (!validation.valid) {
        result.errors = validation.errors;
        return result;
      }

      // Get pending migrations
      const pendingMigrations = await this.getPendingMigrations();
      
      if (pendingMigrations.length === 0) {
        result.success = true;
        return result;
      }

      // Apply migrations in transaction
      await this.postgres.transaction(async (client) => {
        for (const migration of pendingMigrations) {
          const startTime = Date.now();
          
          try {
            // Execute migration
            await client.query(migration.up);
            
            const executionTime = Date.now() - startTime;
            
            // Record migration
            await client.query(`
              INSERT INTO schema_migrations (migration_id, name, version, checksum, execution_time)
              VALUES ($1, $2, $3, $4, $5)
            `, [migration.id, migration.name, migration.version, migration.checksum, executionTime]);

            result.migrationsApplied++;
            result.appliedMigrations.push(migration.id);
            
            console.log(`Applied migration: ${migration.id} (${executionTime}ms)`);
          } catch (error) {
            const errorMessage = `Failed to apply migration ${migration.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            result.errors.push(errorMessage);
            throw new Error(errorMessage);
          }
        }
      });

      result.success = true;
    } catch (error) {
      result.success = false;
      if (!result.errors.length) {
        result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      }
    }

    return result;
  }

  async rollback(targetVersion?: string): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      migrationsApplied: 0,
      errors: [],
      appliedMigrations: []
    };

    try {
      const appliedMigrations = await this.getAppliedMigrations();
      const allMigrations = await this.loadMigrations();
      const migrationMap = new Map(allMigrations.map(m => [m.id, m]));

      // Determine which migrations to rollback
      let migrationsToRollback: Migration[];
      
      if (targetVersion) {
        const targetIndex = appliedMigrations.findIndex(m => m.version === targetVersion);
        if (targetIndex === -1) {
          result.errors.push(`Target version ${targetVersion} not found in applied migrations`);
          return result;
        }
        migrationsToRollback = appliedMigrations.slice(targetIndex + 1).reverse();
      } else {
        // Rollback only the last migration
        migrationsToRollback = appliedMigrations.slice(-1);
      }

      if (migrationsToRollback.length === 0) {
        result.success = true;
        return result;
      }

      // Apply rollbacks in transaction
      await this.postgres.transaction(async (client) => {
        for (const appliedMigration of migrationsToRollback) {
          const migration = migrationMap.get(appliedMigration.id);
          
          if (!migration) {
            throw new Error(`Migration ${appliedMigration.id} not found in migration files`);
          }

          if (!migration.down) {
            throw new Error(`Migration ${appliedMigration.id} has no down migration`);
          }

          const startTime = Date.now();
          
          try {
            // Execute rollback
            await client.query(migration.down);
            
            // Remove migration record
            await client.query(`
              DELETE FROM schema_migrations WHERE migration_id = $1
            `, [migration.id]);

            const executionTime = Date.now() - startTime;
            result.migrationsApplied++;
            result.appliedMigrations.push(migration.id);
            
            console.log(`Rolled back migration: ${migration.id} (${executionTime}ms)`);
          } catch (error) {
            const errorMessage = `Failed to rollback migration ${migration.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            result.errors.push(errorMessage);
            throw new Error(errorMessage);
          }
        }
      });

      result.success = true;
    } catch (error) {
      result.success = false;
      if (!result.errors.length) {
        result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      }
    }

    return result;
  }

  async getMigrationStatus(): Promise<{
    appliedCount: number;
    pendingCount: number;
    lastApplied?: Migration;
    nextPending?: Migration;
  }> {
    const [appliedMigrations, pendingMigrations] = await Promise.all([
      this.getAppliedMigrations(),
      this.getPendingMigrations()
    ]);

    return {
      appliedCount: appliedMigrations.length,
      pendingCount: pendingMigrations.length,
      lastApplied: appliedMigrations[appliedMigrations.length - 1],
      nextPending: pendingMigrations[0]
    };
  }
}