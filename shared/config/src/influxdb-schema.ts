import { InfluxDBConnection } from './database-connection';

export interface InfluxDBSchemaManager {
  setupBuckets(): Promise<void>;
  setupRetentionPolicies(): Promise<void>;
  setupContinuousQueries(): Promise<void>;
  validateSchema(): Promise<boolean>;
}

export class InfluxDBSchemaSetup implements InfluxDBSchemaManager {
  private influx: InfluxDBConnection;

  constructor() {
    this.influx = InfluxDBConnection.getInstance();
  }

  async setupBuckets(): Promise<void> {
    const buckets = [
      {
        name: 'metrics',
        description: 'Core application metrics',
        retentionPeriod: '90d' // 90 days
      },
      {
        name: 'dora_metrics',
        description: 'DORA metrics for deployment tracking',
        retentionPeriod: '2y' // 2 years
      },
      {
        name: 'performance_metrics',
        description: 'System and application performance data',
        retentionPeriod: '30d' // 30 days
      },
      {
        name: 'agent_metrics',
        description: 'AI agent execution metrics',
        retentionPeriod: '180d' // 6 months
      },
      {
        name: 'user_activity',
        description: 'User interaction and engagement metrics',
        retentionPeriod: '1y' // 1 year
      },
      {
        name: 'workflow_metrics',
        description: 'Workflow execution and performance metrics',
        retentionPeriod: '1y' // 1 year
      },
      {
        name: 'integration_metrics',
        description: 'Third-party integration performance metrics',
        retentionPeriod: '90d' // 90 days
      }
    ];

    for (const bucket of buckets) {
      try {
        // Check if bucket exists
        const existingBuckets = await this.influx.query(`
          buckets()
          |> filter(fn: (r) => r.name == "${bucket.name}")
          |> limit(n: 1)
        `);

        if (existingBuckets.length === 0) {
          console.log(`Creating InfluxDB bucket: ${bucket.name}`);
          // Note: Bucket creation typically requires admin API access
          // This would normally be done through the InfluxDB management API
          console.log(`Bucket ${bucket.name} should be created with retention period ${bucket.retentionPeriod}`);
        } else {
          console.log(`InfluxDB bucket ${bucket.name} already exists`);
        }
      } catch (error) {
        console.error(`Error setting up bucket ${bucket.name}:`, error);
        throw error;
      }
    }
  }

  async setupRetentionPolicies(): Promise<void> {
    // InfluxDB 2.x uses bucket retention policies instead of separate retention policies
    // This is handled during bucket creation
    console.log('Retention policies are configured per bucket in InfluxDB 2.x');
  }

  async setupContinuousQueries(): Promise<void> {
    // InfluxDB 2.x uses tasks instead of continuous queries
    const tasks = [
      {
        name: 'aggregate_dora_metrics_hourly',
        flux: `
          option task = {name: "aggregate_dora_metrics_hourly", every: 1h}
          
          from(bucket: "metrics")
            |> range(start: -1h)
            |> filter(fn: (r) => r._measurement == "deployment_event" or r._measurement == "incident_event")
            |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
            |> to(bucket: "dora_metrics")
        `
      },
      {
        name: 'aggregate_performance_metrics_daily',
        flux: `
          option task = {name: "aggregate_performance_metrics_daily", every: 1d}
          
          from(bucket: "performance_metrics")
            |> range(start: -1d)
            |> aggregateWindow(every: 1d, fn: mean, createEmpty: false)
            |> to(bucket: "metrics")
        `
      },
      {
        name: 'cleanup_old_agent_metrics',
        flux: `
          option task = {name: "cleanup_old_agent_metrics", every: 1d}
          
          from(bucket: "agent_metrics")
            |> range(start: -181d, stop: -180d)
            |> drop()
        `
      }
    ];

    for (const task of tasks) {
      try {
        console.log(`Setting up InfluxDB task: ${task.name}`);
        // Note: Task creation typically requires admin API access
        // This would normally be done through the InfluxDB management API
        console.log(`Task ${task.name} should be created with Flux query`);
      } catch (error) {
        console.error(`Error setting up task ${task.name}:`, error);
        throw error;
      }
    }
  }

  async validateSchema(): Promise<boolean> {
    try {
      // Validate that we can query the main buckets
      const requiredBuckets = ['metrics', 'dora_metrics', 'performance_metrics', 'agent_metrics'];
      
      for (const bucketName of requiredBuckets) {
        try {
          await this.influx.query(`
            from(bucket: "${bucketName}")
            |> range(start: -1m)
            |> limit(n: 1)
          `);
        } catch (error) {
          console.error(`Bucket ${bucketName} is not accessible:`, error);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('InfluxDB schema validation failed:', error);
      return false;
    }
  }

  // Measurement schemas for documentation and validation
  getMeasurementSchemas() {
    return {
      // DORA Metrics
      deployment_event: {
        tags: ['project_id', 'team_id', 'environment', 'service'],
        fields: ['duration', 'success', 'rollback_required'],
        description: 'Deployment events for DORA metrics calculation'
      },
      
      incident_event: {
        tags: ['project_id', 'team_id', 'severity', 'service'],
        fields: ['resolution_time', 'detection_time', 'impact_score'],
        description: 'Incident events for DORA metrics calculation'
      },

      // Performance Metrics
      api_response_time: {
        tags: ['service', 'endpoint', 'method', 'status_code'],
        fields: ['response_time', 'request_size', 'response_size'],
        description: 'API endpoint performance metrics'
      },

      database_performance: {
        tags: ['database', 'operation', 'table'],
        fields: ['query_time', 'rows_affected', 'connection_count'],
        description: 'Database performance metrics'
      },

      // Agent Metrics
      agent_execution: {
        tags: ['agent_id', 'agent_type', 'project_id', 'workflow_id'],
        fields: ['execution_time', 'success', 'cpu_usage', 'memory_usage'],
        description: 'AI agent execution metrics'
      },

      agent_performance: {
        tags: ['agent_id', 'agent_type'],
        fields: ['success_rate', 'average_execution_time', 'error_rate'],
        description: 'Aggregated agent performance metrics'
      },

      // User Activity
      user_action: {
        tags: ['user_id', 'action_type', 'resource_type', 'project_id'],
        fields: ['duration', 'success'],
        description: 'User interaction tracking'
      },

      user_session: {
        tags: ['user_id', 'device_type', 'browser'],
        fields: ['session_duration', 'page_views', 'actions_count'],
        description: 'User session metrics'
      },

      // Workflow Metrics
      workflow_execution: {
        tags: ['workflow_id', 'project_id', 'team_id', 'status'],
        fields: ['execution_time', 'step_count', 'success'],
        description: 'Workflow execution metrics'
      },

      workflow_step: {
        tags: ['workflow_id', 'step_id', 'step_type', 'agent_id'],
        fields: ['execution_time', 'success', 'retry_count'],
        description: 'Individual workflow step metrics'
      },

      // Integration Metrics
      integration_sync: {
        tags: ['integration_id', 'provider', 'sync_type'],
        fields: ['sync_duration', 'records_processed', 'success', 'error_count'],
        description: 'Integration synchronization metrics'
      },

      webhook_event: {
        tags: ['integration_id', 'event_type', 'provider'],
        fields: ['processing_time', 'success', 'payload_size'],
        description: 'Webhook event processing metrics'
      },

      // System Metrics
      system_health: {
        tags: ['service', 'instance', 'environment'],
        fields: ['cpu_usage', 'memory_usage', 'disk_usage', 'network_io'],
        description: 'System health and resource usage metrics'
      },

      error_rate: {
        tags: ['service', 'error_type', 'severity'],
        fields: ['count', 'rate'],
        description: 'Error tracking and rates'
      }
    };
  }

  // Helper method to write sample data for testing
  async writeSampleData(): Promise<void> {
    const samplePoints = [
      {
        measurement: 'deployment_event',
        fields: {
          duration: 120000, // 2 minutes in milliseconds
          success: true,
          rollback_required: false
        },
        tags: {
          project_id: 'sample-project-1',
          team_id: 'sample-team-1',
          environment: 'production',
          service: 'api-gateway'
        }
      },
      {
        measurement: 'api_response_time',
        fields: {
          response_time: 150, // milliseconds
          request_size: 1024,
          response_size: 2048
        },
        tags: {
          service: 'api-gateway',
          endpoint: '/api/v1/workflows',
          method: 'GET',
          status_code: '200'
        }
      },
      {
        measurement: 'agent_execution',
        fields: {
          execution_time: 5000, // 5 seconds
          success: true,
          cpu_usage: 25.5,
          memory_usage: 128
        },
        tags: {
          agent_id: 'security-guardian-1',
          agent_type: 'security_guardian',
          project_id: 'sample-project-1',
          workflow_id: 'sample-workflow-1'
        }
      }
    ];

    await this.influx.writePoints(samplePoints);
    await this.influx.flush();
    
    console.log('Sample data written to InfluxDB');
  }
}