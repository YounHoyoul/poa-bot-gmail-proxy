import { writeFileSync } from 'fs';
import { google } from 'googleapis';
import { LoggingService } from './LoggingService.js';
import 'dotenv/config';
export class GmailWatchService {
    gmail;
    constructor(auth) {
        this.gmail = google.gmail({ version: 'v1', auth });
    }
    async watchGmail() {
        try {
            if (!process.env.TOPIC_NAME)
                throw new Error('TOPIC_NAME is not set in environment variables.');
            const res = (await this.gmail.users.watch({
                userId: 'me',
                requestBody: {
                    topicName: process.env.TOPIC_NAME,
                    labelIds: ['INBOX'],
                },
            })).data;
            LoggingService.logToFile(`Watch response: ${JSON.stringify(res)}`);
            if (!process.env.STOAGE_PATH)
                throw new Error('STOAGE_PATH is not set in environment variables.');
            writeFileSync(process.env.STOAGE_PATH, JSON.stringify(res));
        }
        catch (error) {
            LoggingService.logToFile(`Error setting up Gmail watch: ${error.message}`, true);
        }
    }
    async stopWatch() {
        try {
            const res = await this.gmail.users.stop({ userId: 'me' });
            LoggingService.logToFile(`Stopped Gmail watch: ${JSON.stringify(res.data)}`);
        }
        catch (error) {
            LoggingService.logToFile(`Error stopping Gmail watch: ${error.message}`, true);
        }
    }
}
