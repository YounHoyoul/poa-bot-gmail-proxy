import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { LoggingService } from './LoggingService.js';
import 'dotenv/config';
import path from 'path';

interface EnvironmentVariables {
  TOPIC_NAME: string;
  STORAGE_PATH: string;
}

export class GmailWatchService {
  private gmail: gmail_v1.Gmail;

  constructor(auth: OAuth2Client) {
    this.gmail = google.gmail({ version: 'v1', auth });
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

      if (!env.STORAGE_PATH) {
        throw new Error('STORAGE_PATH is not set in environment variables.');
      }

      try {
        const storageDir = path.dirname(env.STORAGE_PATH);
        if (!existsSync(storageDir)) {
          mkdirSync(storageDir, { recursive: true });
          LoggingService.logToFile(`Storage directory created: ${storageDir}`);
        }
        writeFileSync(env.STORAGE_PATH, JSON.stringify(res), 'utf8'); // Add 'utf8' encoding
      } catch (writeError) {
        LoggingService.logToFile(
          `Error writing to storage file: ${(writeError as Error).message}`,
          true
        );
      }
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
