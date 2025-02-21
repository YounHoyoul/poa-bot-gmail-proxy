import 'dotenv/config';
import axios from 'axios';
import { gmail_v1 } from 'googleapis';
import { PubSub, Subscription } from '@google-cloud/pubsub';
import { LoggingService } from './LoggingService.js';
import { GmailMessageService } from './GmailMessageService.js';
import { writeFileSync, readFileSync, existsSync } from 'fs';

interface PubSubConfig {
  projectId: string;
  keyFilename: string;
}

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

  constructor(messageService: GmailMessageService) {
    this.validateEnvironmentVars();
    this.messageService = messageService;
  }

  private validateEnvironmentVars(): void {
    const env: EnvironmentVariables = process.env as unknown as EnvironmentVariables;
    if (
      !env.PROJECT_ID ||
      !env.SUBSCRIPTION_CREDENTIALS_PATH ||
      !env.SUBSCRIPTION_NAME ||
      !env.STORAGE_PATH || // Validate STORAGE_PATH
      !env.WEBHOOK_URL
    ) {
      LoggingService.logToFile('Error: Missing required environment variables.', true);
      process.exit(1);
    }
  }

  public async initialize(): Promise<void> {
    try {
      const env: EnvironmentVariables = process.env as unknown as EnvironmentVariables;

      const pubSubConfig: PubSubConfig = {
        projectId: env.PROJECT_ID,
        keyFilename: env.SUBSCRIPTION_CREDENTIALS_PATH,
      };

      const pubSubClient = new PubSub(pubSubConfig);
      const subscription: Subscription = pubSubClient.subscription(env.SUBSCRIPTION_NAME);

      subscription.on('message', async (message) => {
        try {
          LoggingService.logToFile(`Received message: ${message.id}`);
          LoggingService.logToFile(`Data: ${message.data.toString()}`);

          // Storage Handling with Error Handling
          try {
            if (!existsSync(env.STORAGE_PATH)) {
              console.warn('Storage file does not exist, creating a new one.');
              writeFileSync(env.STORAGE_PATH, JSON.stringify({ historyId: '0' }));
            }

            const lastHistory: StorageData = JSON.parse(readFileSync(env.STORAGE_PATH, 'utf8'));
            writeFileSync(env.STORAGE_PATH, message.data.toString()); // Consider atomicity here

            const emails: gmail_v1.Schema$Message[] =
              await this.messageService.getEmailsByHistoryId(lastHistory.historyId, 'me');

            if (emails.length > 0) {
              const emailContent = await this.messageService.getEmailContent(emails[0].id!);

              if (emailContent != null) {
                const { date, plainText } = emailContent;

                LoggingService.logToFile(`Email Datetime: ${new Date(date).toLocaleString()}`);

                const parsedData = JSON.parse(plainText); // Parse only once
                LoggingService.logToFile(`Calling Webhook with ${JSON.stringify(parsedData)}`);

                try {
                  const response = await axios.post(env.WEBHOOK_URL, parsedData);
                  // Handle successful webhook response (e.g., log the status)
                  LoggingService.logToFile(`Webhook response: ${response.status}`);
                } catch (webhookError) {
                  if (axios.isAxiosError(webhookError)) {
                    LoggingService.logToFile(
                      `Webhook Error: ${webhookError.message}, ${webhookError.response?.status}`
                    );
                    // Handle webhook error (retry, store message, etc.)
                  } else {
                    LoggingService.logToFile(`Webhook Error: ${webhookError as Error}`);
                  }
                }
              }
            }
          } catch (storageError) {
            LoggingService.logToFile(`Storage Error: ${(storageError as Error).message}`);
          }
        } catch (error) {
          LoggingService.logToFile(`Error in message handler: ${(error as Error).message}`, true);
        } finally {
          message.ack();
        }
      });

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
}
