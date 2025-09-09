import { PoolClient } from 'pg';
import { DatabaseOptimizer, QueryPlan, SlowQuery, DatabaseMetrics } from './interfaces';
import { PostgresConnectionPool } from './connection-pool';
import { Logger } from './mocks/shared-utils';

export class PostgresDatabaseOptimizer implements DatabaseOptimizer {
  private logger: Logger;
  private slowQueries: SlowQuery[] = [];
  private queryMetrics: Map<string, {
    count: number;
    totalTime: number;
    averageTime: number;
  }> = new Map();

  constructor(private connectionPool: PostgresConnectionPool) {
    this.logger = new Logger('PostgresDatabaseOptimizer');
  }

  async analyzeQuery(query: string, parameters?: any[]): Promise<QueryPlan> {
    const client = await this.connectionPool.acquire();
    
    try {
      const startTime = Date.now();
      
      // Get query execution plan
      const explainQuery = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`;
      const result = await client.query(explainQuery, parameters);
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      const plan = result.rows[0]['QUERY PLAN'][0];
      
      const queryPlan: QueryPlan = {
        query,
        executionTime,
        planningTime: plan['Planning Time'] || 0,
        totalCost: plan['Plan']['Total Cost'] || 0,
        actualRows: plan['Plan']['Actual Rows'] || 0,
        plan: plan['Plan']
      };

      this.recordQueryMetrics(query, executionTime);
      
      return queryPlan;
    } catch (error) {
      this.logger.error('Failed to analyze query', { error, query });
      throw error;
    } finally {
      await this.connectionPool.release(client);
    }
  }

  async suggestIndexes(tableName: string): Promise<string[]> {
    const client = await this.connectionPool.acquire();
    
    try {
      const suggestions: string[] = [];
      
      // Get table statistics
      const statsQuery = `
        SELECT 
          schemaname,
          tablename,
          attname,
          n_distinct,
          correlation
        FROM pg_stats 
        WHERE tablename = $1
        ORDER BY n_distinct DESC
      `;
      
      const statsResult = await client.query(statsQuery, [tableName]);
      
      // Get missing indexes from pg_stat_user_tables
      const missingIndexQuery = `
        SELECT 
          schemaname,
          tablename,
          seq_scan,
          seq_tup_read,
          idx_scan,
          idx_tup_fetch
        FROM pg_stat_user_tables 
        WHERE tablename = $1
      `;
      
      const missingIndexResult = await client.query(missingIndexQuery, [tableName]);
      
      if (missingIndexResult.rows.length > 0) {
        const stats = missingIndexResult.rows[0];
        
        // High sequential scans suggest missing indexes
        if (stats.seq_scan > stats.idx_scan * 2) {
          suggestions.push(`Consider adding indexes to table '${tableName}' - high sequential scan ratio`);
        }
      }

      // Analyze column statistics for index suggestions
      for (const stat of statsResult.rows) {
        if (stat.n_distinct > 100 && stat.correlation < 0.1) {
          suggestions.push(`CREATE INDEX idx_${tableName}_${stat.attname} ON ${tableName} (${stat.attname});`);
        }
      }

      // Get slow queries involving this table
      const slowQueriesForTable = this.slowQueries.filter(sq => 
        sq.query.toLowerCase().includes(tableName.toLowerCase())
      );

      if (slowQueriesForTable.length > 0) {
        suggestions.push(`Table '${tableName}' appears in ${slowQueriesForTable.length} slow queries - consider optimization`);
      }

      return suggestions;
    } catch (error) {
      this.logger.error('Failed to suggest indexes', { error, tableName });
      throw error;
    } finally {
      await this.connectionPool.release(client);
    }
  }

  async optimizeQuery(query: string): Promise<string> {
    let optimizedQuery = query;
    
    // Basic query optimizations
    optimizedQuery = this.removeUnnecessaryColumns(optimizedQuery);
    optimizedQuery = this.optimizeJoins(optimizedQuery);
    optimizedQuery = this.addLimitClauses(optimizedQuery);
    optimizedQuery = this.optimizeWhereClause(optimizedQuery);
    
    this.logger.debug('Query optimized', {
      original: query.substring(0, 100) + '...',
      optimized: optimizedQuery.substring(0, 100) + '...'
    });
    
    return optimizedQuery;
  }

  async getSlowQueries(limit: number = 10): Promise<SlowQuery[]> {
    return this.slowQueries
      .sort((a, b) => b.executionTime - a.executionTime)
      .slice(0, limit);
  }

  async getMetrics(): Promise<DatabaseMetrics> {
    const poolMetrics = await this.connectionPool.getMetrics();
    const poolStats = this.connectionPool.getPoolStats();
    
    let totalQueries = 0;
    let totalTime = 0;
    
    for (const metrics of this.queryMetrics.values()) {
      totalQueries += metrics.count;
      totalTime += metrics.totalTime;
    }
    
    const averageQueryTime = totalQueries > 0 ? totalTime / totalQueries : 0;
    const slowQueryCount = this.slowQueries.length;
    
    return {
      activeConnections: poolStats.activeConnections,
      idleConnections: poolStats.idleConnections,
      totalConnections: poolStats.totalConnections,
      queriesExecuted: totalQueries,
      slowQueries: slowQueryCount,
      averageQueryTime,
      connectionPoolUtilization: poolStats.totalConnections > 0 
        ? poolStats.activeConnections / poolStats.totalConnections 
        : 0,
      cacheHitRate: 0 // Would be calculated by query cache
    };
  }

  // Record a slow query
  recordSlowQuery(query: string, executionTime: number, parameters?: any[]): void {
    if (this.slowQueries.length >= 100) {
      // Remove oldest slow query
      this.slowQueries.shift();
    }

    const slowQuery: SlowQuery = {
      query,
      executionTime,
      timestamp: new Date(),
      parameters,
      stackTrace: new Error().stack
    };

    this.slowQueries.push(slowQuery);
    
    this.logger.warn('Slow query detected', {
      executionTime,
      query: query.substring(0, 200) + '...'
    });
  }

  private recordQueryMetrics(query: string, executionTime: number): void {
    const normalizedQuery = this.normalizeQuery(query);
    const existing = this.queryMetrics.get(normalizedQuery);
    
    if (existing) {
      existing.count++;
      existing.totalTime += executionTime;
      existing.averageTime = existing.totalTime / existing.count;
    } else {
      this.queryMetrics.set(normalizedQuery, {
        count: 1,
        totalTime: executionTime,
        averageTime: executionTime
      });
    }
  }

  private normalizeQuery(query: string): string {
    return query
      .replace(/\$\d+/g, '?') // Replace parameter placeholders
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private removeUnnecessaryColumns(query: string): string {
    // Replace SELECT * with specific columns where possible
    // This is a simplified implementation
    if (query.toLowerCase().includes('select *') && 
        !query.toLowerCase().includes('count(*)')) {
      this.logger.debug('Query uses SELECT * - consider specifying columns');
    }
    return query;
  }

  private optimizeJoins(query: string): string {
    // Suggest INNER JOIN instead of WHERE clause joins
    const lowerQuery = query.toLowerCase();
    if (lowerQuery.includes('where') && 
        lowerQuery.includes('=') && 
        !lowerQuery.includes('join')) {
      this.logger.debug('Query might benefit from explicit JOIN syntax');
    }
    return query;
  }

  private addLimitClauses(query: string): string {
    // Suggest adding LIMIT for potentially large result sets
    const lowerQuery = query.toLowerCase();
    if (lowerQuery.startsWith('select') && 
        !lowerQuery.includes('limit') && 
        !lowerQuery.includes('count(')) {
      this.logger.debug('Query might benefit from LIMIT clause');
    }
    return query;
  }

  private optimizeWhereClause(query: string): string {
    // Suggest moving most selective conditions first
    const lowerQuery = query.toLowerCase();
    if (lowerQuery.includes('where') && lowerQuery.includes('or')) {
      this.logger.debug('Query with OR conditions might benefit from restructuring');
    }
    return query;
  }

  // Get query statistics
  getQueryStatistics(): Array<{
    query: string;
    count: number;
    totalTime: number;
    averageTime: number;
  }> {
    return Array.from(this.queryMetrics.entries()).map(([query, metrics]) => ({
      query,
      ...metrics
    }));
  }

  // Clear metrics
  clearMetrics(): void {
    this.queryMetrics.clear();
    this.slowQueries = [];
  }
}