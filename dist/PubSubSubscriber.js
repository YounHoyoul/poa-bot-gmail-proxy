import 'dotenv/config';
import axios from 'axios';
import { PubSub } from '@google-cloud/pubsub';
import { LoggingService } from './LoggingService.js';
export class PubSubSubscriber {
    messageService;
    storageService;
    constructor(messageService, storageService) {
        this.validateEnvironmentVars();
        this.messageService = messageService;
        this.storageService = storageService;
    }
    validateEnvironmentVars() {
        const env = process.env;
        if (!env.PROJECT_ID ||
            !env.SUBSCRIPTION_CREDENTIALS_PATH ||
            !env.SUBSCRIPTION_NAME ||
            !env.STORAGE_PATH ||
            !env.WEBHOOK_URL) {
            LoggingService.logToFile('Error: Missing required environment variables.', true);
            process.exit(1);
        }
    }
    async initialize() {
        try {
            const env = process.env;
            const pubSubConfig = {
                projectId: env.PROJECT_ID,
                keyFilename: env.SUBSCRIPTION_CREDENTIALS_PATH,
            };
            const pubSubClient = new PubSub(pubSubConfig);
            const subscription = pubSubClient.subscription(env.SUBSCRIPTION_NAME);
            subscription.on('message', async (message) => {
                try {
                    LoggingService.logToFile(`Received message: ${message.id}`);
                    LoggingService.logToFile(`Data: ${message.data.toString()}`);
                    try {
                        const lastHistory = JSON.parse((await this.storageService.readHistory()) || '{}');
                        await this.storageService.storeHistory(message.data.toString());
                        const emails = await this.messageService.getEmailsByHistoryId(lastHistory.historyId, 'me');
                        if (emails.length > 0) {
                            const emailContent = await this.messageService.getEmailContent(emails[0].id);
                            if (emailContent != null) {
                                const { date, plainText } = emailContent;
                                LoggingService.logToFile(`Email Datetime: ${new Date(date).toLocaleString()}`);
                                const parsedData = JSON.parse(plainText); // Parse only once
                                LoggingService.logToFile(`Calling Webhook with ${JSON.stringify(parsedData)}`);
                                try {
                                    const response = await axios.post(env.WEBHOOK_URL, parsedData);
                                    // Handle successful webhook response (e.g., log the status)
                                    LoggingService.logToFile(`Webhook response: ${response.status}`);
                                }
                                catch (webhookError) {
                                    if (axios.isAxiosError(webhookError)) {
                                        LoggingService.logToFile(`Webhook Error: ${webhookError.message}, ${webhookError.response?.status}`);
                                        // Handle webhook error (retry, store message, etc.)
                                    }
                                    else {
                                        LoggingService.logToFile(`Webhook Error: ${webhookError}`);
                                    }
                                }
                            }
                        }
                    }
                    catch (storageError) {
                        LoggingService.logToFile(`Storage Error: ${storageError.message}`);
                    }
                }
                catch (error) {
                    LoggingService.logToFile(`Error in message handler: ${error.message}`, true);
                }
                finally {
                    message.ack();
                }
            });
            subscription.on('error', (error) => {
                LoggingService.logToFile(`Subscription Error: ${error.message}`);
            });
            console.log(`Listening for messages on ${env.SUBSCRIPTION_NAME}...`);
        }
        catch (error) {
            if (error instanceof Error) {
                LoggingService.logToFile(`Error initializing PubSub client: ${error.message}`);
            }
            process.exit(1);
        }
    }
}
