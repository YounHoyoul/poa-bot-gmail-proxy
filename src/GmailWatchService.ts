import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { LoggingService } from './LoggingService.js'; // Updated import
import { StorageService } from './StorageService.js';

export class GmailWatchService {
  private readonly gmail: gmail_v1.Gmail;
  private readonly storageService: StorageService;
  private readonly topicName: string;

  constructor(
    auth: OAuth2Client,
    storageService: StorageService,
    topicName: string = process.env.TOPIC_NAME ?? ''
  ) {
    this.gmail = google.gmail({ version: 'v1', auth });
    this.storageService = storageService;
    this.topicName = topicName;
    if (!this.topicName) {
      const errorMessage = 'TOPIC_NAME is not configured';
      LoggingService.error(errorMessage, undefined, { component: 'GmailWatchService' });
      throw new Error(errorMessage);
    }
  }

  async watchGmail(): Promise<gmail_v1.Schema$WatchResponse> {
    try {
      const res = await this.gmail.users.watch({
        userId: 'me',
        requestBody: {
          topicName: this.topicName,
          labelIds: ['INBOX'],
        },
      });

      const watchResponse = res.data;
      LoggingService.info(`Watch response received`, {
        component: 'GmailWatchService',
        topicName: this.topicName,
        response: JSON.stringify(watchResponse),
      });
      await this.storageService.storeHistory(JSON.stringify(watchResponse));
      return watchResponse;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(`Failed to set up Gmail watch: ${errorMessage}`, errorStack, {
        component: 'GmailWatchService',
        topicName: this.topicName,
      });
      throw error;
    }
  }

  async stopWatch(): Promise<void> {
    try {
      const res = await this.gmail.users.stop({ userId: 'me' });
      LoggingService.info(`Stopped Gmail watch`, {
        component: 'GmailWatchService',
        response: JSON.stringify(res.data),
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(`Failed to stop Gmail watch: ${errorMessage}`, errorStack, {
        component: 'GmailWatchService',
      });
      throw error;
    }
  }
}
