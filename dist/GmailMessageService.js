import { google } from 'googleapis';
import { LoggingService } from './LoggingService.js'; // Updated import
export class GmailMessageService {
    gmail;
    storageService;
    constructor(auth, storageService) {
        this.gmail = google.gmail({ version: 'v1', auth });
        this.storageService = storageService;
    }
    async getEmailsByHistoryId(historyId, userId = 'me') {
        try {
            await this.storageService.increaseRunningCount();
            // Step 1: Fetch history since the given historyId
            const historyResponse = await this.gmail.users.history.list({
                userId,
                startHistoryId: historyId,
                // Note: labelId parameter is not supported by History API as per documentation
                // We must filter client-side
            });
            LoggingService.info('Fetched user histories', {
                component: 'GmailMessageService',
                historyResponse,
            });
            const messageIds = historyResponse.data.history
                ?.flatMap((h) => h.messagesAdded ?? []) // Use messagesAdded instead of messages
                .map((m) => m.message?.id)
                .filter((id) => !!id) ?? [];
            if (!messageIds.length) {
                LoggingService.info('No new emails found in history', {
                    component: 'GmailMessageService',
                    historyId,
                    userId,
                });
                return [];
            }
            // Step 2: Fetch message details for each ID
            const fetchedMessages = await Promise.all(messageIds.map((id) => this.gmail.users.messages
                .get({
                userId,
                id,
                format: 'minimal', // Use minimal format to get labelIds efficiently
            })
                .then((res) => res.data)));
            // Step 3: Filter for messages with INBOX label only
            const inboxMessages = fetchedMessages.filter((message) => message.labelIds?.includes('INBOX'));
            if (inboxMessages.length === 0) {
                LoggingService.info('No new emails found in Inbox', {
                    component: 'GmailMessageService',
                    historyId,
                    userId,
                    totalMessagesFound: fetchedMessages.length,
                });
            }
            else {
                LoggingService.info(`Fetched ${inboxMessages.length} emails from Inbox`, {
                    component: 'GmailMessageService',
                    historyId,
                    userId,
                    messageCount: inboxMessages.length,
                    totalMessagesFound: fetchedMessages.length,
                });
            }
            return inboxMessages;
        }
        catch (error) {
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
    async getEmailContent(messageId) {
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
            const getHeader = (name) => headers.find((h) => h.name === name)?.value ?? '';
            const decodeBody = (data) => data ? Buffer.from(data, 'base64').toString('utf8') : '';
            let plainText = '';
            const processPart = (part) => {
                if (!part)
                    return '';
                if (part.mimeType === 'text/plain')
                    return decodeBody(part.body?.data);
                if (part.mimeType === 'text/html')
                    return decodeBody(part.body?.data);
                return part.parts?.map(processPart).join('') ?? '';
            };
            plainText =
                message.payload.parts?.map(processPart).join('') ?? decodeBody(message.payload.body?.data);
            const emailContent = {
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
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error : undefined;
            LoggingService.error(`Failed to fetch email content for ${messageId}: ${errorMessage}`, errorStack, {
                component: 'GmailMessageService',
                messageId,
            });
            throw error;
        }
    }
    /**
     * Gets the label ID for a given label name.
     * @param labelName - The name of the label.
     * @returns The label ID, or null if not found.
     */
    async getLabelIdByName(labelName) {
        try {
            this.storageService.increaseRunningCount();
            const res = await this.gmail.users.labels.list({ userId: 'me' });
            const labels = res.data.labels || [];
            const label = labels.find((l) => l.name === labelName);
            return label ? label.id : null;
        }
        catch (error) {
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
    async modifyLabels(messageId, modification) {
        try {
            this.storageService.increaseRunningCount();
            await this.gmail.users.messages.modify({
                userId: 'me',
                id: messageId,
                requestBody: modification,
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error : undefined;
            LoggingService.error(`Failed to modify labels for message ${messageId}: ${errorMessage}`, errorStack, {
                component: 'GmailMessageService',
                messageId,
            });
            throw error;
        }
    }
    /**
     * Moves a message to the trash.
     * @param messageId - The ID of the message.
     */
    async trashEmail(messageId) {
        try {
            this.storageService.increaseRunningCount();
            await this.gmail.users.messages.trash({
                userId: 'me',
                id: messageId,
            });
        }
        catch (error) {
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
