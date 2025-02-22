import 'dotenv/config';
import axios from 'axios';
import { PubSub } from '@google-cloud/pubsub';
import { LoggingService } from './LoggingService.js';
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
            'GOOGLE_CLOUD_PROJECT', 'GOOGLE_APPLICATION_CREDENTIALS', 'SUBSCRIPTION_NAME',
            'STORAGE_PATH', 'WEBHOOK_URL', 'ACTION', 'UNPROCESSED_LABEL'
        ];
        const missing = required.filter(key => !env[key]);
        if (missing.length) {
            throw this.logAndThrow(`Missing required environment variables: ${missing.join(', ')}`);
        }
        const action = env.ACTION;
        if (action !== 'move' && action !== 'delete') {
            throw this.logAndThrow('ACTION must be "move" or "delete"');
        }
        if (action === 'move' && !env.TARGET_LABEL) {
            throw this.logAndThrow('TARGET_LABEL is required when ACTION is "move"');
        }
        return {
            projectId: env.GOOGLE_CLOUD_PROJECT,
            credentialsPath: env.GOOGLE_APPLICATION_CREDENTIALS,
            subscriptionName: env.SUBSCRIPTION_NAME,
            storagePath: env.STORAGE_PATH,
            webhookUrl: env.WEBHOOK_URL,
            action,
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
            this.subscription.on('error', error => this.logError('Subscription error', error));
            await this.initializeLabelIds();
            this.logInfo(`Listening for messages on ${this.config.subscriptionName}`);
        }
        catch (error) {
            throw this.logAndThrow('Failed to initialize PubSub', error);
        }
    }
    async initializeLabelIds() {
        if (this.config.action === 'move') {
            this.targetLabelId = await this.getOrFetchLabelId(this.storageService.getTargetLabelId.bind(this.storageService), this.storageService.storeTargetLabelId.bind(this.storageService), this.config.targetLabel, 'targetLabel');
        }
        this.unprocessedLabelId = await this.getOrFetchLabelId(this.storageService.getUnprocessedLabelId.bind(this.storageService), this.storageService.storeUnprocessedLabelId.bind(this.storageService), this.config.unprocessedLabel, 'unprocessedLabel');
    }
    async getOrFetchLabelId(getFn, storeFn, labelName, configField) {
        let labelId = await getFn();
        if (!labelId) {
            labelId = await this.messageService.getLabelIdByName(labelName) ?? '';
            if (!labelId)
                throw this.logAndThrow(`Label "${this.config[configField]}" not found`);
            await storeFn(labelId);
        }
        return labelId;
    }
    async close() {
        if (this.subscription) {
            this.subscription.removeAllListeners();
            await this.subscription.close();
            this.logInfo(`Closed subscription ${this.config.subscriptionName}`);
        }
    }
    async handleMessage(message) {
        try {
            this.storageService.resetRunningCount();
            this.logInfo(`Received message: ${message.id}`, { messageId: message.id });
            const { historyId } = JSON.parse(message.data.toString());
            if (!historyId)
                throw this.logAndThrow('historyId must not be empty');
            const lastHistoryId = await this.storageService.getHistoryId();
            await this.storageService.storeHistoryId(historyId);
            await this.getAndProcessEmails(lastHistoryId);
        }
        catch (error) {
            this.logError('Message handling error', error, { messageId: message.id });
        }
        finally {
            message.ack();
        }
    }
    async processEmail(email) {
        const emailId = email.id;
        const internalDate = parseInt(email.internalDate || '0', 10);
        if (internalDate < Date.now() - 300000) {
            this.logDebug(`Skipping old email ${emailId}`, { internalDate });
            return;
        }
        const { sender, plainText } = await this.messageService.getEmailContent(email);
        if (!sender.includes('noreply@tradingview.com')) {
            this.logDebug(`Skipping non-TradingView email ${emailId}`, { sender });
            return;
        }
        try {
            await this.processValidEmail(emailId, plainText);
        }
        catch (error) {
            await this.handleProcessingError(emailId, error);
        }
    }
    async processValidEmail(emailId, plainText) {
        const parsedData = JSON.parse(plainText);
        const response = await axios.post(this.config.webhookUrl, parsedData);
        this.logInfo(`Webhook response: ${response.status}`, { webhookUrl: this.config.webhookUrl });
        await this.handleEmailAction(emailId);
    }
    async handleEmailAction(emailId) {
        if (this.config.action === 'delete' || !this.targetLabelId) {
            await this.trashEmail(emailId);
        }
        else if (this.config.action === 'move') {
            await this.moveEmail(emailId, this.targetLabelId, this.config.targetLabel);
        }
    }
    async handleProcessingError(emailId, error) {
        this.logError(`Failed to process email ${emailId}`, error, { emailId });
        if (this.unprocessedLabelId) {
            await this.moveEmail(emailId, this.unprocessedLabelId, this.config.unprocessedLabel);
        }
        else {
            await this.trashEmail(emailId);
        }
    }
    async moveEmail(emailId, labelId, labelName) {
        await this.messageService.modifyLabels(emailId, {
            addLabelIds: [labelId],
            removeLabelIds: ['INBOX'],
        });
        this.logInfo(`Moved email ${emailId} to label "${labelName}"`, { targetLabel: labelName });
    }
    async trashEmail(emailId) {
        await this.messageService.trashEmail(emailId);
        this.logInfo(`Trashed email ${emailId}`, { emailId });
    }
    async getAndProcessEmails(lastHistoryId) {
        const emails = await this.messageService.getEmailsByHistoryId(lastHistoryId);
        this.logDebug('Fetched emails:', { emails });
        if (!emails.length) {
            this.logInfo('No emails to process', { historyId: lastHistoryId });
            return;
        }
        emails.sort((a, b) => parseInt(a.internalDate || '0', 10) - parseInt(b.internalDate || '0', 10));
        for (const email of emails) {
            const emailId = email.id;
            if (await this.isEmailProcessed(emailId)) {
                this.logInfo(`Skipping processed email ${emailId} because it has already been processed`, { emailId });
                continue;
            }
            await this.processEmail(email);
            await this.storageService.storeLastProcessedEmailId(emailId);
            await this.storageService.addProcessedEmailIds(emailId);
        }
    }
    async isEmailProcessed(emailId) {
        return (await this.storageService.getLastProcessedEmailId()) === emailId ||
            await this.storageService.isEmailProcessed(emailId);
    }
    // Logging helpers
    log(level, message, extra = {}, error) {
        const errorStack = error instanceof Error ? error : undefined;
        LoggingService[level](message, errorStack, { component: 'PubSubSubscriber', ...extra });
    }
    logDebug(message, extra) {
        this.log('debug', message, extra);
    }
    logInfo(message, extra) {
        this.log('info', message, extra);
    }
    logError(message, error, extra = {}) {
        this.log('error', `${message}: ${error instanceof Error ? error.message : String(error)}`, extra, error);
    }
    logAndThrow(message, error) {
        this.logError(message, error);
        throw error instanceof Error ? error : new Error(message);
    }
}
