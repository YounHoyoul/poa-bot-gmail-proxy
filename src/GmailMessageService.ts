import { google, gmail_v1 } from 'googleapis';
import { LoggingService } from './LoggingService.js'; // Updated import
import { OAuth2Client } from 'google-auth-library';
import {StorageService} from "./StorageService.js";
export interface EmailContent {
  sender: string;
  date: string;
  subject: string;
  plainText: string;
  htmlContent: string;
}

export class GmailMessageService {
  private readonly gmail: gmail_v1.Gmail;
  private readonly storageService: StorageService;

  constructor(auth: OAuth2Client, storageService: StorageService) {
    this.gmail = google.gmail({ version: 'v1', auth });
    this.storageService = storageService;
  }

  async getEmailsByHistoryId(historyId: string, userId = 'me'): Promise<gmail_v1.Schema$Message[]> {
    try {
      this.storageService.increaseRunningCount();

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
      this.storageService.increaseRunningCount();

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

  /**
 * Gets the label ID for a given label name.
 * @param labelName - The name of the label.
 * @returns The label ID, or null if not found.
 */
  public async getLabelIdByName(labelName: string): Promise<string | null | undefined> {
    try {
      this.storageService.increaseRunningCount();

      const res = await this.gmail.users.labels.list({ userId: 'me' });
      const labels = res.data.labels || [];
      const label = labels.find(l => l.name === labelName);
      return label ? label.id : null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(`Failed to get label ID for ${labelName}: ${errorMessage}`, errorStack, {
        component: 'GmailMessageService'
      });
      throw error;
    }
  }

  /**
   * Modifies the labels of a message.
   * @param messageId - The ID of the message.
   * @param modification - Labels to add and remove.
   */
  public async modifyLabels(
    messageId: string,
    modification: { addLabelIds?: string[], removeLabelIds?: string[] }
  ): Promise<void> {
    try {
      this.storageService.increaseRunningCount();

      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: modification
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(`Failed to modify labels for message ${messageId}: ${errorMessage}`, errorStack, {
        component: 'GmailMessageService',
        messageId
      });
      throw error;
    }
  }

  /**
   * Moves a message to the trash.
   * @param messageId - The ID of the message.
   */
  public async trashEmail(messageId: string): Promise<void> {
    try {
      this.storageService.increaseRunningCount();
      
      await this.gmail.users.messages.trash({
        userId: 'me',
        id: messageId
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(`Failed to trash message ${messageId}: ${errorMessage}`, errorStack, {
        component: 'GmailMessageService',
        messageId
      });
      throw error;
    }
  }
}
