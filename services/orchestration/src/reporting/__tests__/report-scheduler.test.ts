import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AutomatedReportScheduler } from '../report-scheduler';
import { 
  ReportGenerator, 
  ReportDeliveryService, 
  ReportFrequency, 
  DeliveryMethod,
  GeneratedReport 
} from '../interfaces';
import { UUID } from '@devflow/shared-types';

// Mock logger
vi.mock('@devflow/shared-utils', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

// Mock timers
vi.useFakeTimers();

describe('AutomatedReportScheduler', () => {
  let scheduler: AutomatedReportScheduler;
  let mockReportGenerator: ReportGenerator;
  let mockDeliveryService: ReportDeliveryService;

  const templateId = 'template-1' as UUID;
  const mockReport: GeneratedReport = {
    id: 'report-1' as UUID,
    templateId,
    title: 'Test Report',
    content: {
      sections: [],
      summary: {
        totalWorkflows: 10,
        activeWorkflows: 2,
        completedWorkflows: 7,
        failedWorkflows: 1,
        averageExecutionTime: 1500,
        successRate: 70,
        keyInsights: ['Test insight']
      }
    },
    metadata: {
      generationTime: 1000,
      dataPoints: 10,
      filters: {},
      version: '1.0.0'
    },
    generatedAt: new Date()
  };

  beforeEach(() => {
    mockReportGenerator = {
      generateReport: vi.fn().mockResolvedValue(mockReport),
      generateFromTemplate: vi.fn(),
      getReportData: vi.fn()
    };

    mockDeliveryService = {
      deliverReport: vi.fn().mockResolvedValue(undefined),
      sendEmail: vi.fn(),
      sendSlackMessage: vi.fn(),
      sendTeamsMessage: vi.fn(),
      sendWebhook: vi.fn()
    };

    scheduler = new AutomatedReportScheduler(mockReportGenerator, mockDeliveryService);
  });

  afterEach(() => {
    scheduler.cleanup();
    vi.clearAllTimers();
  });

  describe('createSchedule', () => {
    it('should create and store schedule', async () => {
      const scheduleData = {
        templateId,
        name: 'Daily Report',
        frequency: ReportFrequency.DAILY,
        deliveryMethods: [{
          method: DeliveryMethod.EMAIL,
          config: {}
        }],
        recipients: ['test@example.com'],
        isActive: true,
        nextRunAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      };

      const schedule = await scheduler.createSchedule(scheduleData);

      expect(schedule.id).toBeDefined();
      expect(schedule.name).toBe(scheduleData.name);
      expect(schedule.frequency).toBe(scheduleData.frequency);
      expect(schedule.isActive).toBe(true);
      expect(schedule.createdAt).toBeDefined();
      expect(schedule.updatedAt).toBeDefined();
    });

    it('should schedule next run for active schedules', async () => {
      const scheduleData = {
        templateId,
        name: 'Hourly Report',
        frequency: ReportFrequency.HOURLY,
        deliveryMethods: [{
          method: DeliveryMethod.EMAIL,
          config: {}
        }],
        recipients: ['test@example.com'],
        isActive: true,
        nextRunAt: new Date(Date.now() + 60 * 60 * 1000)
      };

      await scheduler.createSchedule(scheduleData);

      // Verify timer was set (we can't directly test setTimeout, but we can verify the schedule exists)
      const activeSchedules = await scheduler.getActiveSchedules();
      expect(activeSchedules).toHaveLength(1);
    });
  });

  describe('updateSchedule', () => {
    it('should update existing schedule', async () => {
      const schedule = await scheduler.createSchedule({
        templateId,
        name: 'Test Schedule',
        frequency: ReportFrequency.DAILY,
        deliveryMethods: [{ method: DeliveryMethod.EMAIL, config: {} }],
        recipients: ['test@example.com'],
        isActive: true,
        nextRunAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      // Use fake timers to control time
      vi.advanceTimersByTime(1);

      const updates = {
        name: 'Updated Schedule',
        frequency: ReportFrequency.WEEKLY
      };

      const updatedSchedule = await scheduler.updateSchedule(schedule.id, updates);

      expect(updatedSchedule.name).toBe(updates.name);
      expect(updatedSchedule.frequency).toBe(updates.frequency);
      expect(updatedSchedule.updatedAt.getTime()).toBeGreaterThanOrEqual(schedule.updatedAt.getTime());
    });

    it('should throw error for non-existent schedule', async () => {
      await expect(scheduler.updateSchedule('non-existent' as UUID, {}))
        .rejects.toThrow('Schedule not found');
    });
  });

  describe('deleteSchedule', () => {
    it('should delete existing schedule', async () => {
      const schedule = await scheduler.createSchedule({
        templateId,
        name: 'Test Schedule',
        frequency: ReportFrequency.DAILY,
        deliveryMethods: [{ method: DeliveryMethod.EMAIL, config: {} }],
        recipients: ['test@example.com'],
        isActive: true,
        nextRunAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      await scheduler.deleteSchedule(schedule.id);

      const deletedSchedule = await scheduler.getSchedule(schedule.id);
      expect(deletedSchedule).toBeNull();
    });

    it('should throw error for non-existent schedule', async () => {
      await expect(scheduler.deleteSchedule('non-existent' as UUID))
        .rejects.toThrow('Schedule not found');
    });
  });

  describe('executeSchedule', () => {
    it('should execute schedule and deliver report', async () => {
      const schedule = await scheduler.createSchedule({
        templateId,
        name: 'Test Schedule',
        frequency: ReportFrequency.DAILY,
        deliveryMethods: [{ method: DeliveryMethod.EMAIL, config: {} }],
        recipients: ['test@example.com'],
        isActive: true,
        nextRunAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      const report = await scheduler.executeSchedule(schedule.id);

      expect(mockReportGenerator.generateReport).toHaveBeenCalledWith(templateId);
      expect(mockDeliveryService.deliverReport).toHaveBeenCalledWith(
        mockReport,
        schedule.deliveryMethods[0],
        schedule.recipients
      );
      expect(report).toEqual(mockReport);
    });

    it('should update last run time after execution', async () => {
      const schedule = await scheduler.createSchedule({
        templateId,
        name: 'Test Schedule',
        frequency: ReportFrequency.DAILY,
        deliveryMethods: [{ method: DeliveryMethod.EMAIL, config: {} }],
        recipients: ['test@example.com'],
        isActive: true,
        nextRunAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      const beforeExecution = new Date();
      await scheduler.executeSchedule(schedule.id);

      const updatedSchedule = await scheduler.getSchedule(schedule.id);
      expect(updatedSchedule?.lastRunAt).toBeDefined();
      expect(updatedSchedule?.lastRunAt!.getTime()).toBeGreaterThanOrEqual(beforeExecution.getTime());
    });

    it('should handle delivery failures gracefully', async () => {
      vi.mocked(mockDeliveryService.deliverReport).mockRejectedValue(new Error('Delivery failed'));

      const schedule = await scheduler.createSchedule({
        templateId,
        name: 'Test Schedule',
        frequency: ReportFrequency.DAILY,
        deliveryMethods: [{ method: DeliveryMethod.EMAIL, config: {} }],
        recipients: ['test@example.com'],
        isActive: true,
        nextRunAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      // Should still return the report even if delivery fails
      const report = await scheduler.executeSchedule(schedule.id);
      expect(report).toEqual(mockReport);
    });
  });

  describe('getActiveSchedules', () => {
    it('should return only active schedules', async () => {
      await scheduler.createSchedule({
        templateId,
        name: 'Active Schedule',
        frequency: ReportFrequency.DAILY,
        deliveryMethods: [{ method: DeliveryMethod.EMAIL, config: {} }],
        recipients: ['test@example.com'],
        isActive: true,
        nextRunAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      await scheduler.createSchedule({
        templateId,
        name: 'Inactive Schedule',
        frequency: ReportFrequency.DAILY,
        deliveryMethods: [{ method: DeliveryMethod.EMAIL, config: {} }],
        recipients: ['test@example.com'],
        isActive: false,
        nextRunAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      const activeSchedules = await scheduler.getActiveSchedules();
      expect(activeSchedules).toHaveLength(1);
      expect(activeSchedules[0].name).toBe('Active Schedule');
    });
  });

  describe('frequency calculations', () => {
    it('should calculate next run time for different frequencies', async () => {
      const now = new Date('2024-01-15T10:00:00Z');
      vi.setSystemTime(now);

      // Test daily frequency
      const dailySchedule = await scheduler.createSchedule({
        templateId,
        name: 'Daily Schedule',
        frequency: ReportFrequency.DAILY,
        deliveryMethods: [{ method: DeliveryMethod.EMAIL, config: {} }],
        recipients: ['test@example.com'],
        isActive: false, // Don't auto-schedule
        nextRunAt: now
      });

      // Execute to trigger next run calculation
      await scheduler.executeSchedule(dailySchedule.id);
      
      const updatedSchedule = await scheduler.getSchedule(dailySchedule.id);
      
      // Check that next run is scheduled for the next day
      expect(updatedSchedule?.nextRunAt.getDate()).toBe(16); // Next day
      expect(updatedSchedule?.nextRunAt.getHours()).toBe(9); // 9 AM
    });
  });
});