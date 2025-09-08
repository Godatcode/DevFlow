import { UUID } from '@devflow/shared-types';
import { Logger } from '@devflow/shared-utils';

const logger = new Logger('report-scheduler');
import { v4 as uuidv4 } from 'uuid';
import {
  ReportScheduler,
  ReportSchedule,
  ReportFrequency,
  GeneratedReport,
  ReportGenerator,
  ReportDeliveryService
} from './interfaces';

export class AutomatedReportScheduler implements ReportScheduler {
  private schedules = new Map<UUID, ReportSchedule>();
  private timers = new Map<UUID, NodeJS.Timeout>();

  constructor(
    private reportGenerator: ReportGenerator,
    private deliveryService: ReportDeliveryService
  ) {}

  async createSchedule(
    scheduleData: Omit<ReportSchedule, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ReportSchedule> {
    const schedule: ReportSchedule = {
      ...scheduleData,
      id: uuidv4() as UUID,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.schedules.set(schedule.id, schedule);

    if (schedule.isActive) {
      this.scheduleNextRun(schedule);
    }

    logger.info('Report schedule created', { 
      scheduleId: schedule.id, 
      templateId: schedule.templateId,
      frequency: schedule.frequency 
    });

    return schedule;
  }

  async updateSchedule(scheduleId: UUID, updates: Partial<ReportSchedule>): Promise<ReportSchedule> {
    const existingSchedule = this.schedules.get(scheduleId);
    if (!existingSchedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    const updatedSchedule: ReportSchedule = {
      ...existingSchedule,
      ...updates,
      updatedAt: new Date()
    };

    this.schedules.set(scheduleId, updatedSchedule);

    // Clear existing timer
    const existingTimer = this.timers.get(scheduleId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.timers.delete(scheduleId);
    }

    // Schedule next run if active
    if (updatedSchedule.isActive) {
      this.scheduleNextRun(updatedSchedule);
    }

    logger.info('Report schedule updated', { scheduleId, updates });

    return updatedSchedule;
  }

  async deleteSchedule(scheduleId: UUID): Promise<void> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    // Clear timer
    const timer = this.timers.get(scheduleId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(scheduleId);
    }

    this.schedules.delete(scheduleId);

    logger.info('Report schedule deleted', { scheduleId });
  }

  async getSchedule(scheduleId: UUID): Promise<ReportSchedule | null> {
    return this.schedules.get(scheduleId) || null;
  }

  async getActiveSchedules(): Promise<ReportSchedule[]> {
    return Array.from(this.schedules.values()).filter(schedule => schedule.isActive);
  }

  async executeSchedule(scheduleId: UUID): Promise<GeneratedReport> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    try {
      logger.info('Executing scheduled report', { 
        scheduleId, 
        templateId: schedule.templateId 
      });

      // Generate report
      const report = await this.reportGenerator.generateReport(schedule.templateId);

      // Deliver report
      await this.deliverReport(report, schedule);

      // Update last run time
      schedule.lastRunAt = new Date();
      schedule.nextRunAt = this.calculateNextRunTime(schedule.frequency, new Date());
      this.schedules.set(scheduleId, schedule);

      // Schedule next run
      this.scheduleNextRun(schedule);

      logger.info('Scheduled report executed successfully', { 
        scheduleId, 
        reportId: report.id 
      });

      return report;
    } catch (error) {
      logger.error('Failed to execute scheduled report', { 
        scheduleId, 
        error: (error as Error).message 
      });
      throw error;
    }
  }

  private async deliverReport(report: GeneratedReport, schedule: ReportSchedule): Promise<void> {
    const deliveryPromises = schedule.deliveryMethods.map(async (deliveryConfig) => {
      try {
        await this.deliveryService.deliverReport(report, deliveryConfig, schedule.recipients);
        logger.info('Report delivered successfully', { 
          reportId: report.id, 
          method: deliveryConfig.method 
        });
      } catch (error) {
        logger.error('Failed to deliver report', { 
          reportId: report.id, 
          method: deliveryConfig.method, 
          error: (error as Error).message 
        });
      }
    });

    await Promise.allSettled(deliveryPromises);
  }

  private scheduleNextRun(schedule: ReportSchedule): void {
    if (!schedule.isActive) {
      return;
    }

    const now = new Date();
    const nextRun = schedule.nextRunAt > now ? schedule.nextRunAt : this.calculateNextRunTime(schedule.frequency, now);
    const delay = nextRun.getTime() - now.getTime();

    const timer = setTimeout(async () => {
      try {
        await this.executeSchedule(schedule.id);
      } catch (error) {
        logger.error('Scheduled report execution failed', { 
          scheduleId: schedule.id, 
          error: (error as Error).message 
        });
      }
    }, delay);

    this.timers.set(schedule.id, timer);

    logger.info('Next report run scheduled', { 
      scheduleId: schedule.id, 
      nextRun: nextRun.toISOString() 
    });
  }

  private calculateNextRunTime(frequency: ReportFrequency, from: Date): Date {
    const next = new Date(from);

    switch (frequency) {
      case ReportFrequency.REAL_TIME:
        // For real-time, schedule every minute
        next.setMinutes(next.getMinutes() + 1);
        break;
      case ReportFrequency.HOURLY:
        next.setHours(next.getHours() + 1);
        next.setMinutes(0);
        next.setSeconds(0);
        break;
      case ReportFrequency.DAILY:
        next.setDate(next.getDate() + 1);
        next.setHours(9); // 9 AM
        next.setMinutes(0);
        next.setSeconds(0);
        break;
      case ReportFrequency.WEEKLY:
        next.setDate(next.getDate() + (7 - next.getDay() + 1)); // Next Monday
        next.setHours(9);
        next.setMinutes(0);
        next.setSeconds(0);
        break;
      case ReportFrequency.MONTHLY:
        next.setMonth(next.getMonth() + 1);
        next.setDate(1); // First day of month
        next.setHours(9);
        next.setMinutes(0);
        next.setSeconds(0);
        break;
      default:
        next.setHours(next.getHours() + 1);
    }

    return next;
  }

  // Cleanup method to clear all timers
  public cleanup(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    logger.info('Report scheduler cleanup completed');
  }
}