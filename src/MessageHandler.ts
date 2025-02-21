import { gmail_v1 } from 'googleapis';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import axios from 'axios';
import { LoggingService } from './LoggingService.js';
import { GmailMessageService } from './GmailMessageService.js';

interface StorageData {
  historyId: string;
}

interface Message {
  id: string;
  data: Buffer;
  ack: () => void;
}

export class MessageHandler {
  private messageService: GmailMessageService;

  constructor(messageService: GmailMessageService) {
    this.messageService = messageService;
  }

  async handleMessage(message: Message): Promise<void> {
    try {
      LoggingService.logToFile(`Received message: ${message.id}`);
      LoggingService.logToFile(`Data: ${message.data.toString()}`);

      if (!process.env.STOAGE_PATH)
        throw new Error('STOAGE_PATH is not set in environment variables.');

      if (!existsSync(process.env.STOAGE_PATH)) {
        console.warn('Storage file does not exist, creating a new one.');
        writeFileSync(process.env.STOAGE_PATH, JSON.stringify({ historyId: '0' }));
      }

      const lastHistory: StorageData = JSON.parse(readFileSync(process.env.STOAGE_PATH, 'utf8'));
      writeFileSync(process.env.STOAGE_PATH, message.data.toString());

      const emails: gmail_v1.Schema$Message[] = await this.messageService.getEmailsByHistoryId(
        lastHistory.historyId,
        'me'
      );

      if (emails.length > 0) {
        const emailContent = await this.messageService.getEmailContent(emails[0].id!);

        if (emailContent != null) {
          const { date, plainText } = emailContent;

          LoggingService.logToFile(`Email Datetime: ${new Date(date).toLocaleString()}`);
          LoggingService.logToFile(`Calling Webhook with ${JSON.stringify(JSON.parse(plainText))}`);

          await axios.post(process.env.WEBHOOK_URL!, JSON.parse(plainText));
        }
      }
    } catch (error) {
      LoggingService.logToFile(`Error in message handler:${(error as Error).message}`, true);
    } finally {
      message.ack();
    }
  }
}
