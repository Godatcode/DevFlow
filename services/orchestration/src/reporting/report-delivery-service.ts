import { Logger } from '@devflow/shared-utils';

const logger = new Logger('report-delivery-service');
import {
  ReportDeliveryService,
  GeneratedReport,
  DeliveryConfig,
  DeliveryMethod
} from './interfaces';

export class MultiChannelReportDeliveryService implements ReportDeliveryService {
  constructor(
    private emailService?: EmailService,
    private slackService?: SlackService,
    private teamsService?: TeamsService,
    private webhookService?: WebhookService
  ) {}

  async deliverReport(
    report: GeneratedReport, 
    deliveryConfig: DeliveryConfig, 
    recipients: string[]
  ): Promise<void> {
    try {
      switch (deliveryConfig.method) {
        case DeliveryMethod.EMAIL:
          await this.sendEmail(report, recipients);
          break;
        case DeliveryMethod.SLACK:
          await this.sendSlackMessage(report, deliveryConfig.config, recipients);
          break;
        case DeliveryMethod.TEAMS:
          await this.sendTeamsMessage(report, deliveryConfig.config, recipients);
          break;
        case DeliveryMethod.WEBHOOK:
          await this.sendWebhook(report, deliveryConfig.config);
          break;
        case DeliveryMethod.DASHBOARD:
          // Dashboard delivery is handled by storing the report
          logger.info('Report available on dashboard', { reportId: report.id });
          break;
        default:
          throw new Error(`Unsupported delivery method: ${deliveryConfig.method}`);
      }

      logger.info('Report delivered successfully', { 
        reportId: report.id, 
        method: deliveryConfig.method,
        recipientCount: recipients.length 
      });
    } catch (error) {
      logger.error('Failed to deliver report', { 
        reportId: report.id, 
        method: deliveryConfig.method, 
        error: (error as Error).message 
      });
      throw error;
    }
  }

  async sendEmail(report: GeneratedReport, recipients: string[]): Promise<void> {
    if (!this.emailService) {
      throw new Error('Email service not configured');
    }

    const emailContent = this.formatEmailContent(report);
    
    await this.emailService.sendEmail({
      to: recipients,
      subject: `DevFlow.ai Report: ${report.title}`,
      html: emailContent.html,
      text: emailContent.text,
      attachments: emailContent.attachments
    });

    logger.info('Report sent via email', { 
      reportId: report.id, 
      recipientCount: recipients.length 
    });
  }

  async sendSlackMessage(
    report: GeneratedReport, 
    config: any, 
    recipients: string[]
  ): Promise<void> {
    if (!this.slackService) {
      throw new Error('Slack service not configured');
    }

    const slackMessage = this.formatSlackMessage(report, config);
    
    for (const recipient of recipients) {
      await this.slackService.sendMessage({
        channel: recipient,
        ...slackMessage
      });
    }

    logger.info('Report sent via Slack', { 
      reportId: report.id, 
      recipientCount: recipients.length 
    });
  }

  async sendTeamsMessage(
    report: GeneratedReport, 
    config: any, 
    recipients: string[]
  ): Promise<void> {
    if (!this.teamsService) {
      throw new Error('Teams service not configured');
    }

    const teamsMessage = this.formatTeamsMessage(report, config);
    
    for (const recipient of recipients) {
      await this.teamsService.sendMessage({
        webhook: recipient,
        ...teamsMessage
      });
    }

    logger.info('Report sent via Teams', { 
      reportId: report.id, 
      recipientCount: recipients.length 
    });
  }

  async sendWebhook(report: GeneratedReport, config: any): Promise<void> {
    if (!this.webhookService) {
      throw new Error('Webhook service not configured');
    }

    const payload = {
      report: {
        id: report.id,
        title: report.title,
        generatedAt: report.generatedAt,
        summary: report.content.summary,
        metadata: report.metadata
      },
      config
    };

    await this.webhookService.sendWebhook({
      url: config.url,
      method: config.method || 'POST',
      headers: config.headers || {},
      payload
    });

    logger.info('Report sent via webhook', { 
      reportId: report.id, 
      url: config.url 
    });
  }

  private formatEmailContent(report: GeneratedReport): {
    html: string;
    text: string;
    attachments?: any[];
  } {
    const summary = report.content.summary;
    
    const html = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 800px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">
              ${report.title}
            </h1>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h2 style="color: #2c3e50; margin-top: 0;">Executive Summary</h2>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                <div style="text-align: center; padding: 15px; background: white; border-radius: 6px;">
                  <h3 style="margin: 0; color: #3498db; font-size: 2em;">${summary.totalWorkflows}</h3>
                  <p style="margin: 5px 0 0 0; color: #7f8c8d;">Total Workflows</p>
                </div>
                <div style="text-align: center; padding: 15px; background: white; border-radius: 6px;">
                  <h3 style="margin: 0; color: #27ae60; font-size: 2em;">${summary.completedWorkflows}</h3>
                  <p style="margin: 5px 0 0 0; color: #7f8c8d;">Completed</p>
                </div>
                <div style="text-align: center; padding: 15px; background: white; border-radius: 6px;">
                  <h3 style="margin: 0; color: #e74c3c; font-size: 2em;">${summary.failedWorkflows}</h3>
                  <p style="margin: 5px 0 0 0; color: #7f8c8d;">Failed</p>
                </div>
                <div style="text-align: center; padding: 15px; background: white; border-radius: 6px;">
                  <h3 style="margin: 0; color: #f39c12; font-size: 2em;">${summary.successRate.toFixed(1)}%</h3>
                  <p style="margin: 5px 0 0 0; color: #7f8c8d;">Success Rate</p>
                </div>
              </div>
            </div>

            <div style="margin: 20px 0;">
              <h2 style="color: #2c3e50;">Key Insights</h2>
              <ul style="padding-left: 20px;">
                ${summary.keyInsights.map(insight => `<li style="margin: 10px 0;">${insight}</li>`).join('')}
              </ul>
            </div>

            <div style="margin: 30px 0; padding: 15px; background: #ecf0f1; border-radius: 6px; font-size: 0.9em; color: #7f8c8d;">
              <p style="margin: 0;">
                Generated on ${report.generatedAt.toLocaleString()} | 
                Processing time: ${report.metadata.generationTime}ms | 
                Data points: ${report.metadata.dataPoints}
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
DevFlow.ai Report: ${report.title}

Executive Summary:
- Total Workflows: ${summary.totalWorkflows}
- Completed: ${summary.completedWorkflows}
- Failed: ${summary.failedWorkflows}
- Success Rate: ${summary.successRate.toFixed(1)}%

Key Insights:
${summary.keyInsights.map(insight => `• ${insight}`).join('\n')}

Generated on ${report.generatedAt.toLocaleString()}
Processing time: ${report.metadata.generationTime}ms
Data points: ${report.metadata.dataPoints}
    `;

    return { html, text };
  }

  private formatSlackMessage(report: GeneratedReport, config: any): any {
    const summary = report.content.summary;
    
    return {
      text: `DevFlow.ai Report: ${report.title}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: report.title
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Total Workflows:*\n${summary.totalWorkflows}`
            },
            {
              type: 'mrkdwn',
              text: `*Completed:*\n${summary.completedWorkflows}`
            },
            {
              type: 'mrkdwn',
              text: `*Failed:*\n${summary.failedWorkflows}`
            },
            {
              type: 'mrkdwn',
              text: `*Success Rate:*\n${summary.successRate.toFixed(1)}%`
            }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Key Insights:*\n${summary.keyInsights.map(insight => `• ${insight}`).join('\n')}`
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Generated on ${report.generatedAt.toLocaleString()} | Processing time: ${report.metadata.generationTime}ms`
            }
          ]
        }
      ]
    };
  }

  private formatTeamsMessage(report: GeneratedReport, config: any): any {
    const summary = report.content.summary;
    
    return {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: `DevFlow.ai Report: ${report.title}`,
      themeColor: '3498db',
      sections: [
        {
          activityTitle: report.title,
          activitySubtitle: `Generated on ${report.generatedAt.toLocaleString()}`,
          facts: [
            { name: 'Total Workflows', value: summary.totalWorkflows.toString() },
            { name: 'Completed', value: summary.completedWorkflows.toString() },
            { name: 'Failed', value: summary.failedWorkflows.toString() },
            { name: 'Success Rate', value: `${summary.successRate.toFixed(1)}%` }
          ]
        },
        {
          title: 'Key Insights',
          text: summary.keyInsights.map(insight => `• ${insight}`).join('\n\n')
        }
      ]
    };
  }
}

// Service interfaces for dependency injection
export interface EmailService {
  sendEmail(options: {
    to: string[];
    subject: string;
    html: string;
    text: string;
    attachments?: any[];
  }): Promise<void>;
}

export interface SlackService {
  sendMessage(options: {
    channel: string;
    text: string;
    blocks?: any[];
  }): Promise<void>;
}

export interface TeamsService {
  sendMessage(options: {
    webhook: string;
    [key: string]: any;
  }): Promise<void>;
}

export interface WebhookService {
  sendWebhook(options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    payload: any;
  }): Promise<void>;
}