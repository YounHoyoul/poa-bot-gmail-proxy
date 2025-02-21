import 'dotenv/config';
import axios from 'axios';
import { gmail_v1 } from 'googleapis';
import { PubSub, Subscription } from '@google-cloud/pubsub';
import { LoggingService } from './LoggingService.js';
import { GmailMessageService } from './GmailMessageService.js';
import { StorageService } from './StorageService.js';

interface StorageData {
  historyId: string;
}

interface EnvironmentVariables {
  PROJECT_ID: string;
  SUBSCRIPTION_CREDENTIALS_PATH: string;
  SUBSCRIPTION_NAME: string;
  STORAGE_PATH: string; // Fixed typo
  WEBHOOK_URL: string;
}

export class PubSubSubscriber {
  private messageService: GmailMessageService;
  private storageService: StorageService;

  constructor(messageService: GmailMessageService, storageService: StorageService) {
    this.validateEnvironmentVars();
    this.messageService = messageService;
    this.storageService = storageService;
  }

  private validateEnvironmentVars(): void {
    const env: EnvironmentVariables = process.env as unknown as EnvironmentVariables;
    if (
      !env.PROJECT_ID ||
      !env.SUBSCRIPTION_CREDENTIALS_PATH ||
      !env.SUBSCRIPTION_NAME ||
      !env.STORAGE_PATH ||
      !env.WEBHOOK_URL
    ) {
      LoggingService.logToFile('Error: Missing required environment variables.', true);
      process.exit(1);
    }
  }

  public async initialize(): Promise<void> {
    try {
      const env: EnvironmentVariables = process.env as unknown as EnvironmentVariables;

      const pubSubClient = new PubSub({
        projectId: env.PROJECT_ID,
        keyFilename: env.SUBSCRIPTION_CREDENTIALS_PATH,
      });

      const subscription: Subscription = pubSubClient.subscription(env.SUBSCRIPTION_NAME);

      const messageHandler = async (message: { id: string; data: Buffer; ack: () => void }) => {
        // Type the message
        try {
          LoggingService.logToFile(`Received message: ${message.id}`);
          const messageData = message.data.toString(); // Extract data once
          LoggingService.logToFile(`Data: ${messageData}`);

          try {
            const lastHistory: StorageData = JSON.parse(
              (await this.storageService.readHistory()) || '{}'
            );
            await this.storageService.storeHistory(messageData);
            await this.getAndProcessEmails(lastHistory, env);
          } catch (storageError) {
            LoggingService.logToFile(`Storage Error: ${(storageError as Error).message}`);
          }
        } catch (error) {
          LoggingService.logToFile(`Error in message handler: ${(error as Error).message}`, true);
        } finally {
          message.ack(); // Acknowledge the message regardless of errors
        }
      };

      subscription.on('message', messageHandler); // Use named function

      subscription.on('error', (error: Error) => {
        LoggingService.logToFile(`Subscription Error: ${error.message}`);
      });

      console.log(`Listening for messages on ${env.SUBSCRIPTION_NAME}...`);
    } catch (error) {
      if (error instanceof Error) {
        LoggingService.logToFile(`Error initializing PubSub client: ${error.message}`);
      }
      process.exit(1);
    }
  }

  private async processEmail(
    email: gmail_v1.Schema$Message,
    env: EnvironmentVariables
  ): Promise<void> {
    try {
      const internalDate = parseInt(email.internalDate || '0', 10);

      // Early exit if the email is older than 5 minutes
      if (internalDate < Date.now() - 300000) {
        // 300000 milliseconds = 5 minutes
        return;
      }

      const emailContent = await this.messageService.getEmailContent(email.id!);
      if (!emailContent) {
        // Check for null or undefined
        return;
      }

      const { date, plainText, sender } = emailContent;

      // Early exit if sender is not from TradingView
      if (!sender.includes('noreply@tradingview.com')) {
        return;
      }

      const emailDate = new Date(date); // Create Date object once
      LoggingService.logToFile(`Email Datetime: ${emailDate.toLocaleString()}`);

      try {
        const parsedData = JSON.parse(plainText);
        LoggingService.logToFile(`Calling Webhook with ${JSON.stringify(parsedData)}`);

        const response = await axios.post(env.WEBHOOK_URL, parsedData);
        LoggingService.logToFile(`Webhook response: ${response.status}`);
      } catch (parseError) {
        LoggingService.logToFile(`Error parsing email content: ${(parseError as Error).message}`);
        // Consider other error handling here, like retrying or skipping
      }
    } catch (error) {
      LoggingService.logToFile(`Error processing email: ${(error as Error).message}`); // More specific message
    }
  }

  private async getAndProcessEmails(
    lastHistory: StorageData,
    env: EnvironmentVariables
  ): Promise<void> {
    try {
      const emails: gmail_v1.Schema$Message[] = await this.messageService.getEmailsByHistoryId(
        lastHistory.historyId,
        'me'
      );

      if (emails.length === 0) return;

      emails.sort((a, b) => {
        const aDate = parseInt(a.internalDate || '0', 10);
        const bDate = parseInt(b.internalDate || '0', 10);
        return aDate - bDate;
      });

      // Process each email
      for (const email of emails) {
        try {
          await this.processEmail(email, env);
        } catch (processError) {
          // Log the error for the specific email, but continue processing others
          LoggingService.logToFile(
            `Error processing email ${email.id}: ${(processError as Error).message}`
          );
        }
      }
    } catch (error) {
      LoggingService.logToFile(`Error getting or processing emails: ${(error as Error).message}`);
    }
  }
}
