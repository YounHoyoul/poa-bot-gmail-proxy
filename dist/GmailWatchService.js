import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { google } from 'googleapis';
import { LoggingService } from './LoggingService.js';
import 'dotenv/config';
import path from 'path';
export class GmailWatchService {
    gmail;
    constructor(auth) {
        this.gmail = google.gmail({ version: 'v1', auth });
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
            }
            catch (writeError) {
                LoggingService.logToFile(`Error writing to storage file: ${writeError.message}`, true);
            }
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
