import { google } from 'googleapis';
import cron from 'node-cron';
import { LoggingService } from './LoggingService.js'; // Updated import
export class GmailWatchService {
    gmail;
    storageService;
    topicName;
    constructor(auth, storageService, topicName = process.env.TOPIC_NAME ?? '') {
        this.gmail = google.gmail({ version: 'v1', auth });
        this.storageService = storageService;
        this.topicName = topicName;
        if (!this.topicName) {
            const errorMessage = 'TOPIC_NAME is not configured';
            LoggingService.error(errorMessage, undefined, { component: 'GmailWatchService' });
            throw new Error(errorMessage);
        }
    }
    async startWatchWithRenewal() {
        // Initial watch call
        const watchResponse = await this.watchGmail();
        // Schedule renewal every 6 days
        cron.schedule('0 0 */6 * *', async () => {
            try {
                await this.watchGmail();
                LoggingService.info('Gmail watch renewed successfully via cron', {
                    component: 'GmailWatchService',
                    topicName: this.topicName,
                });
            }
            catch (error) {
                LoggingService.error('Cron job failed to renew Gmail watch', error, {
                    component: 'GmailWatchService',
                    topicName: this.topicName,
                });
            }
        }, {
            timezone: 'UTC', // Adjust to your timezone, e.g., 'America/Los_Angeles'
        });
        LoggingService.info('Cron job scheduled for Gmail watch renewal every 6 days', {
            component: 'GmailWatchService',
            topicName: this.topicName,
            expiration: watchResponse.expiration
                ? new Date(parseInt(watchResponse.expiration)).toISOString()
                : 'unknown',
        });
    }
    async watchGmail() {
        try {
            const response = await this.gmail.users.watch({
                userId: 'me',
                requestBody: {
                    topicName: this.topicName,
                    labelIds: ['INBOX'],
                },
            });
            const watchResponse = response.data;
            LoggingService.info(`Watch response received`, {
                component: 'GmailWatchService',
                topicName: this.topicName,
                response: JSON.stringify(watchResponse),
            });
            await this.storageService.storeHistory(JSON.stringify(watchResponse));
            return watchResponse;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error : undefined;
            LoggingService.error(`Failed to set up Gmail watch: ${errorMessage}`, errorStack, {
                component: 'GmailWatchService',
                topicName: this.topicName,
            });
            throw error;
        }
    }
    async stopWatch() {
        try {
            const res = await this.gmail.users.stop({ userId: 'me' });
            LoggingService.info(`Stopped Gmail watch`, {
                component: 'GmailWatchService',
                response: JSON.stringify(res.data),
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error : undefined;
            LoggingService.error(`Failed to stop Gmail watch: ${errorMessage}`, errorStack, {
                component: 'GmailWatchService',
            });
            throw error;
        }
    }
}
