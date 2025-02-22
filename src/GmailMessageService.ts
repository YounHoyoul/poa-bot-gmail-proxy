import { google, gmail_v1 } from 'googleapis';
import { LoggingService } from './LoggingService.js'; // Updated import
import { OAuth2Client } from 'google-auth-library';
import { StorageService } from './StorageService.js';
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
      await this.storageService.increaseRunningCount();

      // Step 1: Fetch history since the given historyId
      const historyResponse = await this.gmail.users.history.list({
        userId,
        startHistoryId: historyId,
        // Note: labelId parameter is not supported by History API as per documentation
        // We must filter client-side
      });

      LoggingService.debug('Fetched user histories', {
        component: 'GmailMessageService',
        historyResponse,
      });

      const messageIds =
        historyResponse.data.history
          ?.flatMap((h) => h.messagesAdded ?? []) // Use messagesAdded
          .filter((m) => m.message?.labelIds?.includes('INBOX')) // Filter for INBOX
          .map((m) => m.message?.id) // Extract ID
          .filter((id): id is string => !!id) ?? []; // Ensure non-null IDs

      if (!messageIds.length) {
        LoggingService.info('No new emails found in history', {
          component: 'GmailMessageService',
          historyId,
          userId,
        });
        return [];
      }

      // Remove duplicates
      const uniqueMessageIds = [...new Set(messageIds)];

      LoggingService.debug('Filtered message IDs', {
        component: 'GmailMessageService',
        uniqueMessageIds,
      });

      // Step 2: Fetch message details for each ID
      const inboxMessages = await Promise.all(
        uniqueMessageIds.map((id) =>
          this.gmail.users.messages
            .get({
              userId,
              id,
              format: 'minimal', // Use minimal format to get labelIds efficiently
            })
            .then((res) => res.data)
        )
      );

      if (inboxMessages.length === 0) {
        LoggingService.info('No new emails found in Inbox', {
          component: 'GmailMessageService',
          historyId,
          userId,
          totalMessagesFound: inboxMessages.length,
        });
      }

      LoggingService.debug('Fetched inbox messages', {
        component: 'GmailMessageService',
        inboxMessages,
      });

      return inboxMessages;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(`Failed to fetch emails: ${errorMessage}`, errorStack, {
        component: 'GmailMessageService',
        historyId,
        userId,
      });
      throw error;
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
      const label = labels.find((l) => l.name === labelName);
      return label ? label.id : null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(`Failed to get label ID for ${labelName}: ${errorMessage}`, errorStack, {
        component: 'GmailMessageService',
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
    modification: { addLabelIds?: string[]; removeLabelIds?: string[] }
  ): Promise<void> {
    try {
      this.storageService.increaseRunningCount();

      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: modification,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(
        `Failed to modify labels for message ${messageId}: ${errorMessage}`,
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
   * Moves a message to the trash.
   * @param messageId - The ID of the message.
   */
  public async trashEmail(messageId: string): Promise<void> {
    try {
      this.storageService.increaseRunningCount();

      await this.gmail.users.messages.trash({
        userId: 'me',
        id: messageId,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(`Failed to trash message ${messageId}: ${errorMessage}`, errorStack, {
        component: 'GmailMessageService',
        messageId,
      });
      throw error;
    }
  }
}
