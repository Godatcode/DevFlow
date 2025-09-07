import {
  Workflow,
  WorkflowStatus,
  UUID
} from '@devflow/shared-types';
import { WorkflowExecutionContext } from '../types';
import { WorkflowStateRepository } from '../workflow-state-manager';
import { DatabaseConnection } from '@devflow/shared-config';
import { Logger } from '@devflow/shared-utils';

export class PostgresWorkflowRepository implements WorkflowStateRepository {
  private db: DatabaseConnection;
  private logger: Logger;

  constructor(db: DatabaseConnection, logger: Logger) {
    this.db = db;
    this.logger = logger;
  }

  async saveWorkflow(workflow: Workflow): Promise<void> {
    const query = `
      INSERT INTO workflows (
        id, definition_id, status, context, execution_id, 
        started_at, completed_at, error, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        context = EXCLUDED.context,
        started_at = EXCLUDED.started_at,
        completed_at = EXCLUDED.completed_at,
        error = EXCLUDED.error,
        updated_at = EXCLUDED.updated_at
    `;

    const values = [
      workflow.id,
      workflow.definitionId,
      workflow.status,
      JSON.stringify(workflow.context),
      workflow.executionId,
      workflow.startedAt,
      workflow.completedAt,
      workflow.error,
      workflow.createdAt,
      workflow.updatedAt
    ];

    try {
      await this.db.query(query, values);
      this.logger.debug('Workflow saved to database', { workflowId: workflow.id });
    } catch (error) {
      this.logger.error('Failed to save workflow to database', { workflowId: workflow.id, error });
      throw error;
    }
  }

  async getWorkflow(workflowId: UUID): Promise<Workflow | null> {
    const query = `
      SELECT id, definition_id, status, context, execution_id,
             started_at, completed_at, error, created_at, updated_at
      FROM workflows 
      WHERE id = $1
    `;

    try {
      const result = await this.db.query(query, [workflowId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        definitionId: row.definition_id,
        status: row.status as WorkflowStatus,
        context: JSON.parse(row.context),
        executionId: row.execution_id,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        error: row.error,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      this.logger.error('Failed to get workflow from database', { workflowId, error });
      throw error;
    }
  }

  async updateWorkflowStatus(workflowId: UUID, status: WorkflowStatus): Promise<void> {
    const query = `
      UPDATE workflows 
      SET status = $1, updated_at = $2
      WHERE id = $3
    `;

    try {
      const result = await this.db.query(query, [status, new Date(), workflowId]);
      
      if (result.rowCount === 0) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      this.logger.debug('Workflow status updated in database', { workflowId, status });
    } catch (error) {
      this.logger.error('Failed to update workflow status in database', { workflowId, status, error });
      throw error;
    }
  }

  async getWorkflowsByStatus(status: WorkflowStatus): Promise<Workflow[]> {
    const query = `
      SELECT id, definition_id, status, context, execution_id,
             started_at, completed_at, error, created_at, updated_at
      FROM workflows 
      WHERE status = $1
      ORDER BY created_at DESC
    `;

    try {
      const result = await this.db.query(query, [status]);
      
      return result.rows.map(row => ({
        id: row.id,
        definitionId: row.definition_id,
        status: row.status as WorkflowStatus,
        context: JSON.parse(row.context),
        executionId: row.execution_id,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        error: row.error,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      this.logger.error('Failed to get workflows by status from database', { status, error });
      throw error;
    }
  }

  async saveExecutionContext(context: WorkflowExecutionContext): Promise<void> {
    const query = `
      INSERT INTO workflow_execution_contexts (
        workflow_id, execution_id, current_step, variables, 
        metadata, start_time, last_update_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (workflow_id) DO UPDATE SET
        current_step = EXCLUDED.current_step,
        variables = EXCLUDED.variables,
        metadata = EXCLUDED.metadata,
        last_update_time = EXCLUDED.last_update_time
    `;

    const values = [
      context.workflowId,
      context.executionId,
      context.currentStep,
      JSON.stringify(context.variables),
      JSON.stringify(context.metadata),
      context.startTime,
      context.lastUpdateTime
    ];

    try {
      await this.db.query(query, values);
      this.logger.debug('Execution context saved to database', { workflowId: context.workflowId });
    } catch (error) {
      this.logger.error('Failed to save execution context to database', { 
        workflowId: context.workflowId, 
        error 
      });
      throw error;
    }
  }

  async getExecutionContext(workflowId: UUID): Promise<WorkflowExecutionContext | null> {
    const query = `
      SELECT workflow_id, execution_id, current_step, variables,
             metadata, start_time, last_update_time
      FROM workflow_execution_contexts 
      WHERE workflow_id = $1
    `;

    try {
      const result = await this.db.query(query, [workflowId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        workflowId: row.workflow_id,
        executionId: row.execution_id,
        currentStep: row.current_step,
        variables: JSON.parse(row.variables),
        metadata: JSON.parse(row.metadata),
        startTime: row.start_time,
        lastUpdateTime: row.last_update_time
      };
    } catch (error) {
      this.logger.error('Failed to get execution context from database', { workflowId, error });
      throw error;
    }
  }

  async updateExecutionContext(context: WorkflowExecutionContext): Promise<void> {
    const query = `
      UPDATE workflow_execution_contexts 
      SET current_step = $1, variables = $2, metadata = $3, last_update_time = $4
      WHERE workflow_id = $5
    `;

    const values = [
      context.currentStep,
      JSON.stringify(context.variables),
      JSON.stringify(context.metadata),
      context.lastUpdateTime,
      context.workflowId
    ];

    try {
      const result = await this.db.query(query, values);
      
      if (result.rowCount === 0) {
        throw new Error(`Execution context not found: ${context.workflowId}`);
      }

      this.logger.debug('Execution context updated in database', { workflowId: context.workflowId });
    } catch (error) {
      this.logger.error('Failed to update execution context in database', { 
        workflowId: context.workflowId, 
        error 
      });
      throw error;
    }
  }

  async deleteExecutionContext(workflowId: UUID): Promise<void> {
    const query = `DELETE FROM workflow_execution_contexts WHERE workflow_id = $1`;

    try {
      await this.db.query(query, [workflowId]);
      this.logger.debug('Execution context deleted from database', { workflowId });
    } catch (error) {
      this.logger.error('Failed to delete execution context from database', { workflowId, error });
      throw error;
    }
  }
}