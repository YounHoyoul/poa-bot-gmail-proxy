import 'dotenv/config';
import axios from 'axios';
import { PubSub } from '@google-cloud/pubsub';
import { LoggingService } from './LoggingService.js'; // Updated import
export class PubSubSubscriber {
    messageService;
    storageService;
    config;
    subscription;
    targetLabelId = null;
    unprocessedLabelId = null;
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
            'ACTION',
            'UNPROCESSED_LABEL',
        ];
        const missing = required.filter((key) => !env[key]);
        if (missing.length) {
            const errorMessage = `Missing required environment variables: ${missing.join(', ')}`;
            LoggingService.error(errorMessage, undefined, { component: 'PubSubSubscriber' });
            throw new Error(errorMessage);
        }
        const action = env.ACTION;
        if (action !== 'move' && action !== 'delete') {
            throw new Error('ACTION must be "move" or "delete"');
        }
        if (action === 'move' && !env.TARGET_LABEL) {
            throw new Error('TARGET_LABEL is required when ACTION is "move"');
        }
        return {
            projectId: env.GOOGLE_CLOUD_PROJECT,
            credentialsPath: env.GOOGLE_APPLICATION_CREDENTIALS,
            subscriptionName: env.SUBSCRIPTION_NAME,
            storagePath: env.STORAGE_PATH,
            webhookUrl: env.WEBHOOK_URL,
            action: action,
            targetLabel: env.TARGET_LABEL,
            unprocessedLabel: env.UNPROCESSED_LABEL,
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
            // Fetch the target label ID if action is 'move'
            if (this.config.action === 'move') {
                this.targetLabelId = await this.storageService.getTargetLabelId();
                if (this.targetLabelId == '') {
                    this.targetLabelId = await this.messageService.getLabelIdByName(this.config.targetLabel);
                    if (!this.targetLabelId) {
                        throw new Error(`Label "${this.config.targetLabel}" not found`);
                    }
                    this.storageService.storeTargetLabelId(this.targetLabelId);
                }
            }
            // Fetch the unprocessed label ID
            this.unprocessedLabelId = await this.storageService.getUnprocessedLabelId();
            if (!this.unprocessedLabelId) {
                this.unprocessedLabelId = await this.messageService.getLabelIdByName(this.config.unprocessedLabel);
                if (!this.unprocessedLabelId) {
                    throw new Error(`Label "${this.config.unprocessedLabel}" not found`);
                }
                this.storageService.storeUnprocessedLabelId(this.unprocessedLabelId);
            }
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
            this.storageService.resetRunningCount();
            LoggingService.info(`Received message: ${message.id}`, {
                component: 'PubSubSubscriber',
                messageId: message.id,
            });
            // Parse the Buffer to a JSON object
            const messageData = JSON.parse(message.data.toString());
            // Extract historyId from the object (assuming it always has historyId)
            const historyId = messageData.historyId;
            if (historyId == '') {
                throw new Error('historyId must not be empty.');
            }
            // Get the last history ID
            const lastHistoryId = await this.storageService.getHistoryId();
            // Store the new history ID
            await this.storageService.storeHistoryId(historyId);
            // Pass the lastHistoryId to getAndProcessEmails
            await this.getAndProcessEmails(lastHistoryId);
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
            // Perform the action based on config
            if (this.config.action === 'move') {
                if (this.targetLabelId) {
                    await this.messageService.modifyLabels(email.id, {
                        addLabelIds: [this.targetLabelId],
                        removeLabelIds: ['INBOX'], // Remove from INBOX to "move" the email
                    });
                    LoggingService.info(`Moved email ${email.id} to label "${this.config.targetLabel}"`, {
                        component: 'PubSubSubscriber',
                        emailId: email.id,
                        targetLabel: this.config.targetLabel,
                    });
                }
            }
            else if (this.config.action === 'delete') {
                await this.messageService.trashEmail(email.id);
                LoggingService.info(`Trashed email ${email.id}`, {
                    component: 'PubSubSubscriber',
                    emailId: email.id,
                });
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error : undefined;
            LoggingService.error(`Failed to process email ${email.id}: ${errorMessage}`, errorStack, {
                component: 'PubSubSubscriber',
                emailId: email.id,
            });
            if (this.unprocessedLabelId) {
                await this.messageService.modifyLabels(email.id, {
                    addLabelIds: [this.unprocessedLabelId],
                    removeLabelIds: ['INBOX'], // Remove from INBOX to "move" the email
                });
                LoggingService.info(`Moved email ${email.id} to label "${this.config.unprocessedLabel}"`, {
                    component: 'PubSubSubscriber',
                    emailId: email.id,
                    targetLabel: this.config.targetLabel,
                });
            }
        }
    }
    async getAndProcessEmails(lastHistoryId) {
        const emails = await this.messageService.getEmailsByHistoryId(lastHistoryId);
        LoggingService.debug('Fetched emails:', {
            component: 'PubSubSubscriber',
            emails: emails,
        });
        if (!emails.length) {
            LoggingService.info('No emails to process', {
                component: 'PubSubSubscriber',
                historyId: lastHistoryId,
            });
            return;
        }
        emails.sort((a, b) => parseInt(a.internalDate || '0', 10) - parseInt(b.internalDate || '0', 10));
        for (const email of emails) {
            if ((await this.storageService.getLastProcessedEmailId()) == email.id ||
                (await this.storageService.isEmailProcessed(email.id))) {
                LoggingService.info(`Skipping processed email ${email.id} because it has already been processed`, {
                    component: 'PubSubSubscriber',
                    emailId: email.id,
                });
                continue;
            }
            await this.processEmail(email);
            await this.storageService.storeLastProcessedEmailId(email.id);
            await this.storageService.addProcessedEmailIds(email.id);
        }
    }
}
