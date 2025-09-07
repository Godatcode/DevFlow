import { UUID, MetricType } from '@devflow/shared-types';

export interface AnalyticsConfiguration {
  dataRetentionDays: number;
  aggregationIntervals: AggregationInterval[];
  alertThresholds: AlertThreshold[];
  reportingSchedule: ReportingSchedule[];
}

export interface AggregationInterval {
  name: string;
  duration: string; // ISO 8601 duration
  metrics: MetricType[];
}

export interface AlertThreshold {
  metricType: MetricType;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  value: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

export interface ReportingSchedule {
  name: string;
  frequency: string; // cron expression
  recipients: string[];
  reportTypes: string[];
}

export interface MetricAggregation {
  metricType: MetricType;
  period: string;
  value: number;
  count: number;
  min: number;
  max: number;
  avg: number;
  timestamp: Date;
}

export interface AnalyticsQuery {
  select: string[];
  from: string;
  where?: QueryCondition[];
  groupBy?: string[];
  orderBy?: OrderByClause[];
  limit?: number;
  offset?: number;
}

export interface QueryCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'like';
  value: any;
}

export interface OrderByClause {
  field: string;
  direction: 'asc' | 'desc';
}