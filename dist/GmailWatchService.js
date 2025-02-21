import { google } from 'googleapis';
import { LoggingService } from './LoggingService.js';
import 'dotenv/config';
export class GmailWatchService {
    gmail;
    storageService;
    constructor(auth, storageService) {
        this.gmail = google.gmail({ version: 'v1', auth });
        this.storageService = storageService;
    }
    async watchGmail() {
        const env = process.env;
        try {
            if (!env.TOPIC_NAME) {
                throw new Error('TOPIC_NAME is not set in environment variables.');
            }
            const res = (await this.gmail.users.watch({
                userId: 'me',
                requestBody: {
                    topicName: env.TOPIC_NAME,
                    labelIds: ['INBOX'],
                },
            })).data;
            LoggingService.logToFile(`Watch response: ${JSON.stringify(res)}`);
            this.storageService.storeHistory(JSON.stringify(res));
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
