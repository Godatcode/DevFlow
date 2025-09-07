import { Pool } from 'pg';
import { UUID, TechnicalDebtAnalysis } from '@devflow/shared-types';
import { DatabaseConnection } from '@devflow/shared-config';
import { logger } from '@devflow/shared-utils';
import { DebtTrend, DebtItem } from './technical-debt-analyzer';

export interface TechnicalDebtRecord {
  id: UUID;
  project_id: UUID;
  analysis_date: Date;
  total_debt_hours: number;
  debt_ratio: number;
  critical_issues: number;
  recommendations: string; // JSON string
  trends: string; // JSON string
  created_at: Date;
  updated_at: Date;
}

export interface DebtItemRecord {
  id: UUID;
  project_id: UUID;
  analysis_id: UUID;
  type: string;
  severity: string;
  file_path: string;
  line_number: number;
  description: string;
  estimated_effort: number;
  tags: string; // JSON array as string
  created_at: Date;
}

export class TechnicalDebtRepository {
  private db: Pool;

  constructor() {
    this.db = DatabaseConnection.getPool();
  }

  async saveTechnicalDebtAnalysis(
    projectId: UUID, 
    analysis: TechnicalDebtAnalysis,
    debtItems: DebtItem[]
  ): Promise<UUID> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');

      // Insert main analysis record
      const analysisQuery = `
        INSERT INTO technical_debt_analyses (
          id, project_id, analysis_date, total_debt_hours, debt_ratio, 
          critical_issues, recommendations, trends, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `;

      const analysisId = crypto.randomUUID();
      const now = new Date();

      await client.query(analysisQuery, [
        analysisId,
        projectId,
        now,
        analysis.totalDebtHours,
        analysis.debtRatio,
        analysis.criticalIssues,
        JSON.stringify(analysis.recommendations),
        JSON.stringify(analysis.trends),
        now,
        now
      ]);

      // Insert debt items
      if (debtItems.length > 0) {
        const itemsQuery = `
          INSERT INTO technical_debt_items (
            id, project_id, analysis_id, type, severity, file_path, 
            line_number, description, estimated_effort, tags, created_at
          ) VALUES ${debtItems.map((_, i) => 
            `($${i * 10 + 1}, $${i * 10 + 2}, $${i * 10 + 3}, $${i * 10 + 4}, $${i * 10 + 5}, $${i * 10 + 6}, $${i * 10 + 7}, $${i * 10 + 8}, $${i * 10 + 9}, $${i * 10 + 10})`
          ).join(', ')}
        `;

        const itemsParams = debtItems.flatMap(item => [
          crypto.randomUUID(),
          projectId,
          analysisId,
          item.type,
          item.severity,
          item.file,
          item.line,
          item.description,
          item.estimatedEffort,
          JSON.stringify(item.tags),
          now
        ]);

        await client.query(itemsQuery, itemsParams);
      }

      await client.query('COMMIT');
      
      logger.info('Technical debt analysis saved', { projectId, analysisId });
      return analysisId;

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to save technical debt analysis', { projectId, error });
      throw error;
    } finally {
      client.release();
    }
  }

  async getTechnicalDebtAnalysis(projectId: UUID, analysisId?: UUID): Promise<TechnicalDebtAnalysis | null> {
    try {
      let query: string;
      let params: any[];

      if (analysisId) {
        query = `
          SELECT * FROM technical_debt_analyses 
          WHERE project_id = $1 AND id = $2
          ORDER BY analysis_date DESC
          LIMIT 1
        `;
        params = [projectId, analysisId];
      } else {
        query = `
          SELECT * FROM technical_debt_analyses 
          WHERE project_id = $1
          ORDER BY analysis_date DESC
          LIMIT 1
        `;
        params = [projectId];
      }

      const result = await this.db.query(query, params);
      
      if (result.rows.length === 0) {
        return null;
      }

      const record = result.rows[0] as TechnicalDebtRecord;
      
      return {
        totalDebtHours: record.total_debt_hours,
        debtRatio: record.debt_ratio,
        criticalIssues: record.critical_issues,
        recommendations: JSON.parse(record.recommendations),
        trends: JSON.parse(record.trends)
      };

    } catch (error) {
      logger.error('Failed to get technical debt analysis', { projectId, analysisId, error });
      throw error;
    }
  }

  async getDebtTrends(projectId: UUID, days: number): Promise<DebtTrend[]> {
    try {
      const query = `
        SELECT analysis_date, total_debt_hours, debt_ratio
        FROM technical_debt_analyses
        WHERE project_id = $1 
          AND analysis_date >= $2
        ORDER BY analysis_date ASC
      `;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const result = await this.db.query(query, [projectId, startDate]);
      
      return result.rows.map(row => ({
        date: row.analysis_date,
        totalDebt: row.total_debt_hours,
        newDebt: 0, // Would need additional tracking
        resolvedDebt: 0, // Would need additional tracking
        debtRatio: row.debt_ratio
      }));

    } catch (error) {
      logger.error('Failed to get debt trends', { projectId, days, error });
      throw error;
    }
  }

  async getDebtItems(projectId: UUID, analysisId?: UUID): Promise<DebtItem[]> {
    try {
      let query: string;
      let params: any[];

      if (analysisId) {
        query = `
          SELECT * FROM technical_debt_items 
          WHERE project_id = $1 AND analysis_id = $2
          ORDER BY severity DESC, estimated_effort DESC
        `;
        params = [projectId, analysisId];
      } else {
        query = `
          SELECT tdi.* FROM technical_debt_items tdi
          JOIN technical_debt_analyses tda ON tdi.analysis_id = tda.id
          WHERE tdi.project_id = $1
            AND tda.analysis_date = (
              SELECT MAX(analysis_date) 
              FROM technical_debt_analyses 
              WHERE project_id = $1
            )
          ORDER BY tdi.severity DESC, tdi.estimated_effort DESC
        `;
        params = [projectId];
      }

      const result = await this.db.query(query, params);
      
      return result.rows.map(row => ({
        type: row.type as DebtItem['type'],
        severity: row.severity as DebtItem['severity'],
        file: row.file_path,
        line: row.line_number,
        description: row.description,
        estimatedEffort: row.estimated_effort,
        tags: JSON.parse(row.tags)
      }));

    } catch (error) {
      logger.error('Failed to get debt items', { projectId, analysisId, error });
      throw error;
    }
  }

  async getProjectDebtSummary(projectIds: UUID[]): Promise<Map<UUID, { totalDebt: number; criticalIssues: number }>> {
    try {
      const query = `
        SELECT DISTINCT ON (project_id) 
          project_id, total_debt_hours, critical_issues
        FROM technical_debt_analyses
        WHERE project_id = ANY($1)
        ORDER BY project_id, analysis_date DESC
      `;

      const result = await this.db.query(query, [projectIds]);
      
      const summary = new Map<UUID, { totalDebt: number; criticalIssues: number }>();
      
      result.rows.forEach(row => {
        summary.set(row.project_id, {
          totalDebt: row.total_debt_hours,
          criticalIssues: row.critical_issues
        });
      });

      return summary;

    } catch (error) {
      logger.error('Failed to get project debt summary', { projectIds, error });
      throw error;
    }
  }
}