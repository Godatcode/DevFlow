import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  MultiChannelReportDeliveryService,
  EmailService,
  SlackService,
  TeamsService,
  WebhookService
} from '../report-delivery-service';
import { GeneratedReport, DeliveryMethod } from '../interfaces';
import { UUID } from '@devflow/shared-types';

// Mock logger
vi.mock('@devflow/shared-utils', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

describe('MultiChannelReportDeliveryService', () => {
  let deliveryService: MultiChannelReportDeliveryService;
  let mockEmailService: EmailService;
  let mockSlackService: SlackService;
  let mockTeamsService: TeamsService;
  let mockWebhookService: WebhookService;

  const mockReport: GeneratedReport = {
    id: 'report-1' as UUID,
    templateId: 'template-1' as UUID,
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
        keyInsights: ['System performing well', 'Consider optimizing failed workflows']
      }
    },
    metadata: {
      generationTime: 1000,
      dataPoints: 10,
      filters: {},
      version: '1.0.0'
    },
    generatedAt: new Date('2024-01-15T10:00:00Z')
  };

  beforeEach(() => {
    mockEmailService = {
      sendEmail: vi.fn().mockResolvedValue(undefined)
    };

    mockSlackService = {
      sendMessage: vi.fn().mockResolvedValue(undefined)
    };

    mockTeamsService = {
      sendMessage: vi.fn().mockResolvedValue(undefined)
    };

    mockWebhookService = {
      sendWebhook: vi.fn().mockResolvedValue(undefined)
    };

    deliveryService = new MultiChannelReportDeliveryService(
      mockEmailService,
      mockSlackService,
      mockTeamsService,
      mockWebhookService
    );
  });

  describe('deliverReport', () => {
    it('should deliver report via email', async () => {
      const deliveryConfig = {
        method: DeliveryMethod.EMAIL,
        config: {}
      };
      const recipients = ['test@example.com', 'admin@example.com'];

      await deliveryService.deliverReport(mockReport, deliveryConfig, recipients);

      expect(mockEmailService.sendEmail).toHaveBeenCalledWith({
        to: recipients,
        subject: 'DevFlow.ai Report: Test Report',
        html: expect.stringContaining('Test Report'),
        text: expect.stringContaining('Test Report'),
        attachments: undefined
      });
    });

    it('should deliver report via Slack', async () => {
      const deliveryConfig = {
        method: DeliveryMethod.SLACK,
        config: { channel: '#reports' }
      };
      const recipients = ['#reports', '@user'];

      await deliveryService.deliverReport(mockReport, deliveryConfig, recipients);

      expect(mockSlackService.sendMessage).toHaveBeenCalledTimes(2);
      expect(mockSlackService.sendMessage).toHaveBeenCalledWith({
        channel: '#reports',
        text: 'DevFlow.ai Report: Test Report',
        blocks: expect.arrayContaining([
          expect.objectContaining({
            type: 'header',
            text: { type: 'plain_text', text: 'Test Report' }
          })
        ])
      });
    });

    it('should deliver report via Teams', async () => {
      const deliveryConfig = {
        method: DeliveryMethod.TEAMS,
        config: {}
      };
      const recipients = ['https://webhook.url'];

      await deliveryService.deliverReport(mockReport, deliveryConfig, recipients);

      expect(mockTeamsService.sendMessage).toHaveBeenCalledWith({
        webhook: 'https://webhook.url',
        '@type': 'MessageCard',
        '@context': 'https://schema.org/extensions',
        summary: 'DevFlow.ai Report: Test Report',
        themeColor: '3498db',
        sections: expect.arrayContaining([
          expect.objectContaining({
            activityTitle: 'Test Report'
          })
        ])
      });
    });

    it('should deliver report via webhook', async () => {
      const deliveryConfig = {
        method: DeliveryMethod.WEBHOOK,
        config: {
          url: 'https://api.example.com/webhook',
          method: 'POST',
          headers: { 'Authorization': 'Bearer token' }
        }
      };
      const recipients = [];

      await deliveryService.deliverReport(mockReport, deliveryConfig, recipients);

      expect(mockWebhookService.sendWebhook).toHaveBeenCalledWith({
        url: 'https://api.example.com/webhook',
        method: 'POST',
        headers: { 'Authorization': 'Bearer token' },
        payload: {
          report: {
            id: mockReport.id,
            title: mockReport.title,
            generatedAt: mockReport.generatedAt,
            summary: mockReport.content.summary,
            metadata: mockReport.metadata
          },
          config: deliveryConfig.config
        }
      });
    });

    it('should handle dashboard delivery', async () => {
      const deliveryConfig = {
        method: DeliveryMethod.DASHBOARD,
        config: {}
      };
      const recipients = [];

      // Should not throw and should complete successfully
      await expect(deliveryService.deliverReport(mockReport, deliveryConfig, recipients))
        .resolves.toBeUndefined();
    });

    it('should throw error for unsupported delivery method', async () => {
      const deliveryConfig = {
        method: 'unsupported' as DeliveryMethod,
        config: {}
      };
      const recipients = [];

      await expect(deliveryService.deliverReport(mockReport, deliveryConfig, recipients))
        .rejects.toThrow('Unsupported delivery method: unsupported');
    });

    it('should throw error when required service is not configured', async () => {
      const deliveryServiceWithoutEmail = new MultiChannelReportDeliveryService();
      
      const deliveryConfig = {
        method: DeliveryMethod.EMAIL,
        config: {}
      };
      const recipients = ['test@example.com'];

      await expect(deliveryServiceWithoutEmail.deliverReport(mockReport, deliveryConfig, recipients))
        .rejects.toThrow('Email service not configured');
    });
  });

  describe('email formatting', () => {
    it('should format email content with HTML and text versions', async () => {
      const recipients = ['test@example.com'];

      await deliveryService.sendEmail(mockReport, recipients);

      const emailCall = vi.mocked(mockEmailService.sendEmail).mock.calls[0][0];
      
      expect(emailCall.html).toContain('Test Report');
      expect(emailCall.html).toContain('10'); // Total workflows
      expect(emailCall.html).toContain('70.0%'); // Success rate
      expect(emailCall.html).toContain('System performing well'); // Key insight
      
      expect(emailCall.text).toContain('Test Report');
      expect(emailCall.text).toContain('Total Workflows: 10');
      expect(emailCall.text).toContain('Success Rate: 70.0%');
      expect(emailCall.text).toContain('• System performing well');
    });
  });

  describe('Slack formatting', () => {
    it('should format Slack message with blocks', async () => {
      const config = {};
      const recipients = ['#reports'];

      await deliveryService.sendSlackMessage(mockReport, config, recipients);

      const slackCall = vi.mocked(mockSlackService.sendMessage).mock.calls[0][0];
      
      expect(slackCall.text).toBe('DevFlow.ai Report: Test Report');
      expect(slackCall.blocks).toBeDefined();
      
      const headerBlock = slackCall.blocks.find((block: any) => block.type === 'header');
      expect(headerBlock.text.text).toBe('Test Report');
      
      const sectionBlock = slackCall.blocks.find((block: any) => block.type === 'section' && block.fields);
      expect(sectionBlock.fields).toHaveLength(4);
    });
  });

  describe('Teams formatting', () => {
    it('should format Teams message as MessageCard', async () => {
      const config = {};
      const recipients = ['https://webhook.url'];

      await deliveryService.sendTeamsMessage(mockReport, config, recipients);

      const teamsCall = vi.mocked(mockTeamsService.sendMessage).mock.calls[0][0];
      
      expect(teamsCall['@type']).toBe('MessageCard');
      expect(teamsCall.summary).toBe('DevFlow.ai Report: Test Report');
      expect(teamsCall.themeColor).toBe('3498db');
      expect(teamsCall.sections).toHaveLength(2);
      
      const factsSection = teamsCall.sections[0];
      expect(factsSection.facts).toHaveLength(4);
      expect(factsSection.facts[0].name).toBe('Total Workflows');
      expect(factsSection.facts[0].value).toBe('10');
    });
  });

  describe('error handling', () => {
    it('should handle email service errors', async () => {
      vi.mocked(mockEmailService.sendEmail).mockRejectedValue(new Error('Email failed'));
      
      const recipients = ['test@example.com'];

      await expect(deliveryService.sendEmail(mockReport, recipients))
        .rejects.toThrow('Email failed');
    });

    it('should handle Slack service errors', async () => {
      vi.mocked(mockSlackService.sendMessage).mockRejectedValue(new Error('Slack failed'));
      
      const config = {};
      const recipients = ['#reports'];

      await expect(deliveryService.sendSlackMessage(mockReport, config, recipients))
        .rejects.toThrow('Slack failed');
    });
  });
});