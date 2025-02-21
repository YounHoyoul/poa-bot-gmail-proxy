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
            const pubSubClient = new PubSub({
                projectId: env.PROJECT_ID,
                keyFilename: env.SUBSCRIPTION_CREDENTIALS_PATH,
            });
            const subscription = pubSubClient.subscription(env.SUBSCRIPTION_NAME);
            const messageHandler = async (message) => {
                // Type the message
                try {
                    LoggingService.logToFile(`Received message: ${message.id}`);
                    const messageData = message.data.toString(); // Extract data once
                    LoggingService.logToFile(`Data: ${messageData}`);
                    try {
                        const lastHistory = JSON.parse((await this.storageService.readHistory()) || '{}');
                        await this.storageService.storeHistory(messageData);
                        await this.getAndProcessEmails(lastHistory, env);
                    }
                    catch (storageError) {
                        LoggingService.logToFile(`Storage Error: ${storageError.message}`);
                    }
                }
                catch (error) {
                    LoggingService.logToFile(`Error in message handler: ${error.message}`, true);
                }
                finally {
                    message.ack(); // Acknowledge the message regardless of errors
                }
            };
            subscription.on('message', messageHandler); // Use named function
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
    async processEmail(email, env) {
        try {
            const internalDate = parseInt(email.internalDate || '0', 10);
            // Early exit if the email is older than 5 minutes
            if (internalDate < Date.now() - 300000) {
                // 300000 milliseconds = 5 minutes
                return;
            }
            const emailContent = await this.messageService.getEmailContent(email.id);
            if (!emailContent) {
                // Check for null or undefined
                return;
            }
            const { date, plainText, sender } = emailContent;
            // Early exit if sender is not from TradingView
            if (!sender.includes('noreply@tradingview.com')) {
                return;
            }
            const emailDate = new Date(date); // Create Date object once
            LoggingService.logToFile(`Email Datetime: ${emailDate.toLocaleString()}`);
            try {
                const parsedData = JSON.parse(plainText);
                LoggingService.logToFile(`Calling Webhook with ${JSON.stringify(parsedData)}`);
                const response = await axios.post(env.WEBHOOK_URL, parsedData);
                LoggingService.logToFile(`Webhook response: ${response.status}`);
            }
            catch (parseError) {
                LoggingService.logToFile(`Error parsing email content: ${parseError.message}`);
                // Consider other error handling here, like retrying or skipping
            }
        }
        catch (error) {
            LoggingService.logToFile(`Error processing email: ${error.message}`); // More specific message
        }
    }
    async getAndProcessEmails(lastHistory, env) {
        try {
            const emails = await this.messageService.getEmailsByHistoryId(lastHistory.historyId, 'me');
            if (emails.length === 0)
                return;
            emails.sort((a, b) => {
                const aDate = parseInt(a.internalDate || '0', 10);
                const bDate = parseInt(b.internalDate || '0', 10);
                return aDate - bDate;
            });
            // Process each email
            for (const email of emails) {
                try {
                    await this.processEmail(email, env);
                }
                catch (processError) {
                    // Log the error for the specific email, but continue processing others
                    LoggingService.logToFile(`Error processing email ${email.id}: ${processError.message}`);
                }
            }
        }
        catch (error) {
            LoggingService.logToFile(`Error getting or processing emails: ${error.message}`);
        }
    }
}
