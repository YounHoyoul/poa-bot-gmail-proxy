import { google, gmail_v1 } from 'googleapis';
import { LoggingService } from './LoggingService.js';
import { OAuth2Client } from 'google-auth-library';

export interface EmailContent {
  sender: string;
  date: string;
  subject: string;
  plainText: string;
  htmlContent: string;
}

export class GmailMessageService {
  private gmail: gmail_v1.Gmail;

  constructor(auth: OAuth2Client) {
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  async getEmailsByHistoryId(
    historyId: string,
    userId: string = 'me'
  ): Promise<gmail_v1.Schema$Message[]> {
    try {
      const historyResponse = await this.gmail.users.history.list({
        userId,
        startHistoryId: historyId,
      });

      if (!historyResponse.data.history) {
        LoggingService.logToFile('No new emails found for the given historyId.');
        return [];
      }

      const messageIds: string[] = historyResponse.data.history
        .flatMap((h) => h.messages || [])
        .map((m) => m.id as string);

      if (messageIds.length === 0) {
        LoggingService.logToFile('No new emails found.');
        return [];
      }

      return await Promise.all(
        messageIds.map(async (messageId: string) => {
          const message = await this.gmail.users.messages.get({ userId, id: messageId });
          return message.data;
        })
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      LoggingService.logToFile(`Error fetching emails: ${errorMessage}`, true);
      return [];
    }
  }
  async getEmailContent(messageId: string): Promise<EmailContent | null> {
    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
      });

      const message = response.data;

      if (!message.payload || !message.payload.headers) {
        throw new Error('Invalid email format.');
      }

      const headers = message.payload.headers;
      const subject = headers.find((header) => header.name === 'Subject')?.value || 'No Subject';
      const sender = headers.find((header) => header.name === 'From')?.value || 'Unknown Sender';
      const date = headers.find((header) => header.name === 'Date')?.value || 'Unknown Date';

      let plainText = '';
      let htmlContent = '';

      if (message.payload.parts) {
        for (const part of message.payload.parts) {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            plainText = Buffer.from(part.body.data, 'base64').toString('utf-8');
          } else if (part.mimeType === 'text/html' && part.body?.data) {
            htmlContent = Buffer.from(part.body.data, 'base64').toString('utf-8');
          }
        }
      } else if (message.payload.body?.data) {
        plainText = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
      }

      return { sender, date, subject, plainText, htmlContent };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      LoggingService.logToFile(`Error fetching email content: ${errorMessage}`, true);
      return null;
    }
  }
}
