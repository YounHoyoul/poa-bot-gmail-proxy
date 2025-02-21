import 'dotenv/config';
import axios from 'axios';
import { PubSub } from '@google-cloud/pubsub';
import { LoggingService } from './LoggingService.js'; // Updated import
export class PubSubSubscriber {
    messageService;
    storageService;
    config;
    subscription;
    constructor(messageService, storageService) {
        this.config = this.validateConfig();
        this.messageService = messageService;
        this.storageService = storageService;
    }
    validateConfig() {
        const env = process.env;
        const required = [
            'GOOGLE_CLOUD_PROJECT',
            'GOOGLE_APPLICATION_CREDENTIALS',
            'SUBSCRIPTION_NAME',
            'STORAGE_PATH',
            'WEBHOOK_URL',
        ];
        const missing = required.filter((key) => !env[key]);
        if (missing.length) {
            const errorMessage = `Missing required environment variables: ${missing.join(', ')}`;
            LoggingService.error(errorMessage, undefined, { component: 'PubSubSubscriber' });
            throw new Error(errorMessage);
        }
        return {
            projectId: env.GOOGLE_CLOUD_PROJECT,
            credentialsPath: env.GOOGLE_APPLICATION_CREDENTIALS,
            subscriptionName: env.SUBSCRIPTION_NAME,
            storagePath: env.STORAGE_PATH,
            webhookUrl: env.WEBHOOK_URL,
        };
    }
    async initialize() {
        try {
            const pubSubClient = new PubSub({
                projectId: this.config.projectId,
                keyFilename: this.config.credentialsPath,
            });
            this.subscription = pubSubClient.subscription(this.config.subscriptionName);
            this.subscription.on('message', this.handleMessage.bind(this));
            this.subscription.on('error', (error) => {
                LoggingService.error(`Subscription error: ${error.message}`, error, {
                    component: 'PubSubSubscriber',
                    subscriptionName: this.config.subscriptionName,
                });
            });
            LoggingService.info(`Listening for messages on ${this.config.subscriptionName}`, {
                component: 'PubSubSubscriber',
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error : undefined;
            LoggingService.error(`Failed to initialize PubSub: ${errorMessage}`, errorStack, {
                component: 'PubSubSubscriber',
                config: this.config,
            });
            throw error;
        }
    }
    async close() {
        if (this.subscription) {
            this.subscription.removeAllListeners();
            await this.subscription.close();
            LoggingService.info(`Closed subscription ${this.config.subscriptionName}`, {
                component: 'PubSubSubscriber',
            });
        }
    }
    async handleMessage(message) {
        try {
            LoggingService.info(`Received message: ${message.id}`, {
                component: 'PubSubSubscriber',
                messageId: message.id,
            });
            const messageData = message.data.toString();
            const lastHistory = JSON.parse(await this.storageService.readHistory());
            await this.storageService.storeHistory(messageData);
            await this.getAndProcessEmails(lastHistory);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error : undefined;
            LoggingService.error(`Message handling error: ${errorMessage}`, errorStack, {
                component: 'PubSubSubscriber',
                messageId: message.id,
            });
        }
        finally {
            message.ack();
        }
    }
    async processEmail(email) {
        const internalDate = parseInt(email.internalDate || '0', 10);
        if (internalDate < Date.now() - 300000) {
            LoggingService.debug(`Skipping old email ${email.id}`, {
                component: 'PubSubSubscriber',
                emailId: email.id,
                internalDate,
            });
            return;
        }
        const emailContent = await this.messageService.getEmailContent(email.id);
        if (!emailContent?.sender.includes('noreply@tradingview.com')) {
            LoggingService.debug(`Skipping non-TradingView email ${email.id}`, {
                component: 'PubSubSubscriber',
                emailId: email.id,
                sender: emailContent?.sender,
            });
            return;
        }
        try {
            const parsedData = JSON.parse(emailContent.plainText);
            const response = await axios.post(this.config.webhookUrl, parsedData);
            LoggingService.info(`Webhook response: ${response.status}`, {
                component: 'PubSubSubscriber',
                emailId: email.id,
                webhookUrl: this.config.webhookUrl,
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error : undefined;
            LoggingService.error(`Failed to process email ${email.id}: ${errorMessage}`, errorStack, {
                component: 'PubSubSubscriber',
                emailId: email.id,
            });
        }
    }
    async getAndProcessEmails(lastHistory) {
        const emails = await this.messageService.getEmailsByHistoryId(lastHistory.historyId);
        if (!emails.length) {
            LoggingService.info('No emails to process', {
                component: 'PubSubSubscriber',
                historyId: lastHistory.historyId,
            });
            return;
        }
        emails.sort((a, b) => parseInt(a.internalDate || '0', 10) - parseInt(b.internalDate || '0', 10));
        for (const email of emails) {
            await this.processEmail(email);
        }
    }
}
