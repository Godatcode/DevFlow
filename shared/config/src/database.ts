import { ValidationUtils } from '@devflow/shared-utils';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  maxConnections: number;
  connectionTimeout: number;
  idleTimeout: number;
}

export interface InfluxDBConfig {
  url: string;
  token: string;
  org: string;
  bucket: string;
  timeout: number;
}

export class DatabaseConfigManager {
  private static instance: DatabaseConfigManager;
  private postgresConfig: DatabaseConfig;
  private influxConfig: InfluxDBConfig;

  private constructor() {
    this.postgresConfig = this.loadPostgresConfig();
    this.influxConfig = this.loadInfluxConfig();
    this.validateConfigs();
  }

  static getInstance(): DatabaseConfigManager {
    if (!DatabaseConfigManager.instance) {
      DatabaseConfigManager.instance = new DatabaseConfigManager();
    }
    return DatabaseConfigManager.instance;
  }

  private loadPostgresConfig(): DatabaseConfig {
    return {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database: process.env.POSTGRES_DB || 'devflow',
      username: process.env.POSTGRES_USER || 'devflow',
      password: process.env.POSTGRES_PASSWORD || 'password',
      ssl: process.env.POSTGRES_SSL === 'true',
      maxConnections: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || '20', 10),
      connectionTimeout: parseInt(process.env.POSTGRES_CONNECTION_TIMEOUT || '30000', 10),
      idleTimeout: parseInt(process.env.POSTGRES_IDLE_TIMEOUT || '10000', 10)
    };
  }

  private loadInfluxConfig(): InfluxDBConfig {
    return {
      url: process.env.INFLUXDB_URL || 'http://localhost:8086',
      token: process.env.INFLUXDB_TOKEN || 'dev-token',
      org: process.env.INFLUXDB_ORG || 'devflow',
      bucket: process.env.INFLUXDB_BUCKET || 'metrics',
      timeout: parseInt(process.env.INFLUXDB_TIMEOUT || '10000', 10)
    };
  }

  private validateConfigs(): void {
    // Validate PostgreSQL config
    ValidationUtils.validateRequired(this.postgresConfig.host, 'POSTGRES_HOST');
    ValidationUtils.validateRequired(this.postgresConfig.database, 'POSTGRES_DB');
    ValidationUtils.validateRequired(this.postgresConfig.username, 'POSTGRES_USER');
    ValidationUtils.validateRequired(this.postgresConfig.password, 'POSTGRES_PASSWORD');
    ValidationUtils.validateRange(this.postgresConfig.port, 'POSTGRES_PORT', 1, 65535);
    ValidationUtils.validateRange(this.postgresConfig.maxConnections, 'POSTGRES_MAX_CONNECTIONS', 1, 100);

    // Validate InfluxDB config
    ValidationUtils.validateRequired(this.influxConfig.url, 'INFLUXDB_URL');
    ValidationUtils.validateRequired(this.influxConfig.token, 'INFLUXDB_TOKEN');
    ValidationUtils.validateRequired(this.influxConfig.org, 'INFLUXDB_ORG');
    ValidationUtils.validateRequired(this.influxConfig.bucket, 'INFLUXDB_BUCKET');
    ValidationUtils.isValidUrl(this.influxConfig.url);
  }

  getPostgresConfig(): DatabaseConfig {
    return { ...this.postgresConfig };
  }

  getInfluxConfig(): InfluxDBConfig {
    return { ...this.influxConfig };
  }

  getPostgresConnectionString(): string {
    const config = this.postgresConfig;
    const sslParam = config.ssl ? '?sslmode=require' : '';
    return `postgresql://${config.username}:${config.password}@${config.host}:${config.port}/${config.database}${sslParam}`;
  }
}