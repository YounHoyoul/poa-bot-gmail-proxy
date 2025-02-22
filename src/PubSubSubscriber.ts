import 'dotenv/config';
import axios from 'axios';
import { gmail_v1 } from 'googleapis';
import { PubSub, Subscription } from '@google-cloud/pubsub';
import { LoggingService } from './LoggingService.js';
import { GmailMessageService } from './GmailMessageService.js';
import { StorageService } from './StorageService.js';

interface Config {
  projectId: string;
  credentialsPath: string;
  subscriptionName: string;
  storagePath: string;
  webhookUrl: string;
  action: 'move' | 'delete';
  targetLabel?: string;
  unprocessedLabel?: string;
}

type LogLevel = 'debug' | 'info' | 'error';

// Define a type for logging context
interface LogContext {
  [key: string]: unknown;
  component?: string;
  messageId?: string;
  emailId?: string;
  internalDate?: number;
  sender?: string;
  webhookUrl?: string;
  targetLabel?: string;
  historyId?: string;
  emails?: gmail_v1.Schema$Message[];
  subscriptionName?: string;
  config?: Config;
}

export class PubSubSubscriber {
  private readonly messageService: GmailMessageService;
  private readonly storageService: StorageService;
  private readonly config: Config;
  private subscription?: Subscription;
  private targetLabelId: string | null | undefined = null;
  private unprocessedLabelId: string | null | undefined = null;

  constructor(messageService: GmailMessageService, storageService: StorageService) {
    this.config = this.validateConfig();
    this.messageService = messageService;
    this.storageService = storageService;
  }

  private validateConfig(): Config {
    const env = process.env;
    const required = [
      'GOOGLE_CLOUD_PROJECT', 'GOOGLE_APPLICATION_CREDENTIALS', 'SUBSCRIPTION_NAME',
      'STORAGE_PATH', 'WEBHOOK_URL', 'ACTION', 'UNPROCESSED_LABEL'
    ];
    const missing = required.filter(key => !env[key]);
    if (missing.length) {
      throw this.logAndThrow(`Missing required environment variables: ${missing.join(', ')}`);
    }

    const action = env.ACTION as 'move' | 'delete';
    if (action !== 'move' && action !== 'delete') {
      throw this.logAndThrow('ACTION must be "move" or "delete"');
    }
    if (action === 'move' && !env.TARGET_LABEL) {
      throw this.logAndThrow('TARGET_LABEL is required when ACTION is "move"');
    }

    return {
      projectId: env.GOOGLE_CLOUD_PROJECT!,
      credentialsPath: env.GOOGLE_APPLICATION_CREDENTIALS!,
      subscriptionName: env.SUBSCRIPTION_NAME!,
      storagePath: env.STORAGE_PATH!,
      webhookUrl: env.WEBHOOK_URL!,
      action,
      targetLabel: env.TARGET_LABEL,
      unprocessedLabel: env.UNPROCESSED_LABEL,
    };
  }

  public async initialize(): Promise<void> {
    try {
      const pubSubClient = new PubSub({
        projectId: this.config.projectId,
        keyFilename: this.config.credentialsPath,
      });

      this.subscription = pubSubClient.subscription(this.config.subscriptionName);
      this.subscription.on('message', this.handleMessage.bind(this));
      this.subscription.on('error', error => this.logError('Subscription error', error));

      await this.initializeLabelIds();
      this.logInfo(`Listening for messages on ${this.config.subscriptionName}`);
    } catch (error: unknown) {
      throw this.logAndThrow('Failed to initialize PubSub', error);
    }
  }

  private async initializeLabelIds(): Promise<void> {
    if (this.config.action === 'move') {
      this.targetLabelId = await this.getOrFetchLabelId(
        this.storageService.getTargetLabelId.bind(this.storageService),
        this.storageService.storeTargetLabelId.bind(this.storageService),
        this.config.targetLabel!,
        'targetLabel'
      );
    }

    this.unprocessedLabelId = await this.getOrFetchLabelId(
      this.storageService.getUnprocessedLabelId.bind(this.storageService),
      this.storageService.storeUnprocessedLabelId.bind(this.storageService),
      this.config.unprocessedLabel!,
      'unprocessedLabel'
    );
  }

  private async getOrFetchLabelId(
    getFn: () => Promise<string>,
    storeFn: (id: string) => Promise<void>,
    labelName: string,
    configField: keyof Config
  ): Promise<string> {
    let labelId = await getFn();
    if (!labelId) {
      labelId = await this.messageService.getLabelIdByName(labelName) ?? '';
      if (!labelId) throw this.logAndThrow(`Label "${this.config[configField]}" not found`);
      await storeFn(labelId);
    }
    return labelId;
  }

  public async close(): Promise<void> {
    if (this.subscription) {
      this.subscription.removeAllListeners();
      await this.subscription.close();
      this.logInfo(`Closed subscription ${this.config.subscriptionName}`);
    }
  }

  private async handleMessage(message: { id: string; data: Buffer; ack: () => void }): Promise<void> {
    try {
      this.storageService.resetRunningCount();
      this.logInfo(`Received message: ${message.id}`, { messageId: message.id });

      const { historyId } = JSON.parse(message.data.toString());
      if (!historyId) throw this.logAndThrow('historyId must not be empty');

      const lastHistoryId = await this.storageService.getHistoryId();
      await this.storageService.storeHistoryId(historyId);
      await this.getAndProcessEmails(lastHistoryId);
    } catch (error: unknown) {
      this.logError('Message handling error', error, { messageId: message.id });
    } finally {
      message.ack();
    }
  }

  private async processEmail(email: gmail_v1.Schema$Message): Promise<void> {
    const emailId = email.id!;
    const internalDate = parseInt(email.internalDate || '0', 10);

    if (internalDate < Date.now() - 300000) {
      this.logDebug(`Skipping old email ${emailId}`, { internalDate });
      return;
    }

    const { sender, plainText } = await this.messageService.getEmailContent(email);
    if (!sender.includes('noreply@tradingview.com')) {
      this.logDebug(`Skipping non-TradingView email ${emailId}`, { sender });
      return;
    }

    try {
      await this.processValidEmail(emailId, plainText);
    } catch (error: unknown) {
      await this.handleProcessingError(emailId, error);
    }
  }

  private async processValidEmail(emailId: string, plainText: string): Promise<void> {
    const parsedData = JSON.parse(plainText);
    const response = await axios.post(this.config.webhookUrl, parsedData);
    this.logInfo(`Webhook response: ${response.status}`, { webhookUrl: this.config.webhookUrl });
    await this.handleEmailAction(emailId);
  }

  private async handleEmailAction(emailId: string): Promise<void> {
    if (this.config.action === 'delete' || !this.targetLabelId) {
      await this.trashEmail(emailId);
    } else if (this.config.action === 'move') {
      await this.moveEmail(emailId, this.targetLabelId!, this.config.targetLabel!);
    }
  }

  private async handleProcessingError(emailId: string, error: unknown): Promise<void> {
    this.logError(`Failed to process email ${emailId}`, error, { emailId });
    if (this.unprocessedLabelId) {
      await this.moveEmail(emailId, this.unprocessedLabelId, this.config.unprocessedLabel!);
    } else {
      await this.trashEmail(emailId);
    }
  }

  private async moveEmail(emailId: string, labelId: string, labelName: string): Promise<void> {
    await this.messageService.modifyLabels(emailId, {
      addLabelIds: [labelId],
      removeLabelIds: ['INBOX'],
    });
    this.logInfo(`Moved email ${emailId} to label "${labelName}"`, { targetLabel: labelName });
  }

  private async trashEmail(emailId: string): Promise<void> {
    await this.messageService.trashEmail(emailId);
    this.logInfo(`Trashed email ${emailId}`, { emailId });
  }

  private async getAndProcessEmails(lastHistoryId: string): Promise<void> {
    const emails = await this.messageService.getEmailsByHistoryId(lastHistoryId);
    this.logDebug('Fetched emails:', { emails });

    if (!emails.length) {
      this.logInfo('No emails to process', { historyId: lastHistoryId });
      return;
    }

    emails.sort((a, b) => parseInt(a.internalDate || '0', 10) - parseInt(b.internalDate || '0', 10));

    for (const email of emails) {
      const emailId = email.id!;
      if (await this.isEmailProcessed(emailId)) {
        this.logInfo(`Skipping processed email ${emailId} because it has already been processed`, { emailId });
        continue;
      }

      await this.processEmail(email);
      await this.storageService.storeLastProcessedEmailId(emailId);
      await this.storageService.addProcessedEmailIds(emailId);
    }
  }

  private async isEmailProcessed(emailId: string): Promise<boolean> {
    return (await this.storageService.getLastProcessedEmailId()) === emailId || 
           await this.storageService.isEmailProcessed(emailId);
  }

  // Logging helpers
  private log(level: LogLevel, message: string, extra: LogContext = {}, error?: unknown) {
    const errorStack = error instanceof Error ? error : undefined;
    LoggingService[level](message, errorStack, { component: 'PubSubSubscriber', ...extra });
  }

  private logDebug(message: string, extra?: LogContext) {
    this.log('debug', message, extra);
  }

  private logInfo(message: string, extra?: LogContext) {
    this.log('info', message, extra);
  }

  private logError(message: string, error: unknown, extra: LogContext = {}) {
    this.log('error', `${message}: ${error instanceof Error ? error.message : String(error)}`, extra, error);
  }

  private logAndThrow(message: string, error?: unknown): Error {
    this.logError(message, error);
    throw error instanceof Error ? error : new Error(message);
  }
}