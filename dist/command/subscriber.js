import 'dotenv/config';
import { PubSub } from '@google-cloud/pubsub';
import { LoggingService } from '../LoggingService.js';
import { MessageHandler } from '../MessageHandler.js';
import { GmailMessageService } from '../GmailMessageService.js';
import { GmailAuthService } from '../GmailAuthService.js';
// Check if required environment variables are set
if (!process.env.PROJECT_ID ||
    !process.env.SUBSCRIPTION_CREDENTIALS_PATH ||
    !process.env.SUBSCRIPTION_NAME) {
    LoggingService.logToFile('Error: Missing required environment variables.', true);
    process.exit(1);
}
const gmailMessageService = new GmailMessageService(new GmailAuthService().getAuth2Client());
const messageHandler = new MessageHandler(gmailMessageService);
try {
    // Load credentials if not using environment variable
    const pubSubConfig = {
        projectId: process.env.PROJECT_ID,
        keyFilename: process.env.SUBSCRIPTION_CREDENTIALS_PATH,
    };
    const pubSubClient = new PubSub(pubSubConfig);
    const subscription = pubSubClient.subscription(process.env.SUBSCRIPTION_NAME);
    subscription.on('message', messageHandler.handleMessage);
    subscription.on('error', (error) => {
        LoggingService.logToFile(`Subscription Error: ${error.message}`);
    });
    console.log(`Listening for messages on ${process.env.SUBSCRIPTION_NAME}...`);
}
catch (error) {
    if (error instanceof Error) {
        LoggingService.logToFile(`Error initializing PubSub client: ${error.message}`);
    }
    process.exit(1);
}
