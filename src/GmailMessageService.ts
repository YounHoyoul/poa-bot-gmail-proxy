import { google, gmail_v1 } from 'googleapis';
import { LoggingService } from './LoggingService.js'; // Updated import
import { OAuth2Client } from 'google-auth-library';

export interface EmailContent {
  sender: string;
  date: string;
  subject: string;
  plainText: string;
  htmlContent: string;
}

export class GmailMessageService {
  private readonly gmail: gmail_v1.Gmail;

  constructor(auth: OAuth2Client) {
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  async getEmailsByHistoryId(historyId: string, userId = 'me'): Promise<gmail_v1.Schema$Message[]> {
    try {
      const historyResponse = await this.gmail.users.history.list({
        userId,
        startHistoryId: historyId,
      });

      const messages =
        historyResponse.data.history
          ?.flatMap((h) => h.messages ?? [])
          .map((m) => m.id)
          .filter((id): id is string => !!id) ?? [];

      if (!messages.length) {
        LoggingService.info('No new emails found', {
          component: 'GmailMessageService',
          historyId,
          userId,
        });
        return [];
      }

      const fetchedMessages = await Promise.all(
        messages.map((id) => this.gmail.users.messages.get({ userId, id }).then((res) => res.data))
      );

      LoggingService.info(`Fetched ${fetchedMessages.length} emails by history ID`, {
        component: 'GmailMessageService',
        historyId,
        userId,
        messageCount: fetchedMessages.length,
      });

      return fetchedMessages;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(`Failed to fetch emails: ${errorMessage}`, errorStack, {
        component: 'GmailMessageService',
        historyId,
        userId,
      });
      throw error; // Propagate error for proper handling
    }
  }

  async getEmailContent(messageId: string): Promise<EmailContent> {
    try {
      const { data: message } = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
      });

      if (!message.payload?.headers) {
        const errorMessage = `Invalid email format for message ${messageId}`;
        LoggingService.error(errorMessage, undefined, {
          component: 'GmailMessageService',
          messageId,
        });
        throw new Error(errorMessage);
      }

      const headers = message.payload.headers;
      const getHeader = (name: string) => headers.find((h) => h.name === name)?.value ?? '';
      const decodeBody = (data?: string | null | undefined) =>
        data ? Buffer.from(data, 'base64').toString('utf8') : '';

      let plainText = '';
      const processPart = (part?: gmail_v1.Schema$MessagePart): string => {
        if (!part) return '';
        if (part.mimeType === 'text/plain') return decodeBody(part.body?.data);
        if (part.mimeType === 'text/html') return decodeBody(part.body?.data);
        return part.parts?.map(processPart).join('') ?? '';
      };

      plainText =
        message.payload.parts?.map(processPart).join('') ?? decodeBody(message.payload.body?.data);

      const emailContent: EmailContent = {
        sender: getHeader('From'),
        date: getHeader('Date'),
        subject: getHeader('Subject'),
        plainText,
        htmlContent: '',
      };

      LoggingService.info(`Fetched email content for message ${messageId}`, {
        component: 'GmailMessageService',
        messageId,
        sender: emailContent.sender,
        subject: emailContent.subject,
      });

      return emailContent;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(
        `Failed to fetch email content for ${messageId}: ${errorMessage}`,
        errorStack,
        {
          component: 'GmailMessageService',
          messageId,
        }
      );
      throw error;
    }
  }
}
