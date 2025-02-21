import { writeFileSync } from 'fs';
import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { LoggingService } from './LoggingService.js';
import 'dotenv/config';

export class GmailWatchService {
  private gmail: gmail_v1.Gmail;

  constructor(auth: OAuth2Client) {
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  async watchGmail(): Promise<void> {
    try {
      if (!process.env.TOPIC_NAME)
        throw new Error('TOPIC_NAME is not set in environment variables.');

      const res: gmail_v1.Schema$WatchResponse = (
        await this.gmail.users.watch({
          userId: 'me',
          requestBody: {
            topicName: process.env.TOPIC_NAME,
            labelIds: ['INBOX'],
          },
        })
      ).data;

      LoggingService.logToFile(`Watch response: ${JSON.stringify(res)}`);

      if (!process.env.STOAGE_PATH)
        throw new Error('STOAGE_PATH is not set in environment variables.');

      writeFileSync(process.env.STOAGE_PATH, JSON.stringify(res));
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
