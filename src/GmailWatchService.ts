import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { LoggingService } from './LoggingService.js';
import 'dotenv/config';
import { StorageService } from './StorageService.js';

interface EnvironmentVariables {
  TOPIC_NAME: string;
  STORAGE_PATH: string;
}

export class GmailWatchService {
  private gmail: gmail_v1.Gmail;
  private storageService: StorageService;

  constructor(auth: OAuth2Client, storageService: StorageService) {
    this.gmail = google.gmail({ version: 'v1', auth });
    this.storageService = storageService;
  }

  async watchGmail(): Promise<void> {
    const env: EnvironmentVariables = process.env as unknown as EnvironmentVariables;

    try {
      if (!env.TOPIC_NAME) {
        throw new Error('TOPIC_NAME is not set in environment variables.');
      }

      const res: gmail_v1.Schema$WatchResponse = (
        await this.gmail.users.watch({
          userId: 'me',
          requestBody: {
            topicName: env.TOPIC_NAME,
            labelIds: ['INBOX'],
          },
        })
      ).data;

      LoggingService.logToFile(`Watch response: ${JSON.stringify(res)}`);

      this.storageService.storeHistory(JSON.stringify(res));
    } catch (error) {
      LoggingService.logToFile(`Error setting up Gmail watch: ${(error as Error).message}`, true);
    }
  }

  async stopWatch(): Promise<void> {
    try {
      const res = await this.gmail.users.stop({ userId: 'me' });
      LoggingService.logToFile(`Stopped Gmail watch: ${JSON.stringify(res.data)}`);
    } catch (error) {
      LoggingService.logToFile(`Error stopping Gmail watch: ${(error as Error).message}`, true);
    }
  }
}
