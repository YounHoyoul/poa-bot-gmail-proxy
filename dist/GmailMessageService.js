import { google } from 'googleapis';
import { LoggingService } from './LoggingService.js';
export class GmailMessageService {
    gmail;
    constructor(auth) {
        this.gmail = google.gmail({ version: 'v1', auth });
    }
    async getEmailsByHistoryId(historyId, userId = 'me') {
        try {
            const historyResponse = await this.gmail.users.history.list({
                userId,
                startHistoryId: historyId,
            });
            if (!historyResponse.data.history) {
                LoggingService.logToFile('No new emails found for the given historyId.');
                return [];
            }
            const messageIds = historyResponse.data.history
                .flatMap((h) => h.messages || [])
                .map((m) => m.id);
            if (messageIds.length === 0) {
                LoggingService.logToFile('No new emails found.');
                return [];
            }
            return await Promise.all(messageIds.map(async (messageId) => {
                const message = await this.gmail.users.messages.get({ userId, id: messageId });
                return message.data;
            }));
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            LoggingService.logToFile(`Error fetching emails: ${errorMessage}`, true);
            return [];
        }
    }
    async getEmailContent(messageId) {
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
                    }
                    else if (part.mimeType === 'text/html' && part.body?.data) {
                        htmlContent = Buffer.from(part.body.data, 'base64').toString('utf-8');
                    }
                }
            }
            else if (message.payload.body?.data) {
                plainText = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
            }
            return { sender, date, subject, plainText, htmlContent };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            LoggingService.logToFile(`Error fetching email content: ${errorMessage}`, true);
            return null;
        }
    }
}
