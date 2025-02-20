import { PubSub } from '@google-cloud/pubsub';
import { logToFile, messageHandler } from '../googleAPI.js';
import { config } from 'dotenv';

config();

// Check if required environment variables are set
if (!process.env.PROJECT_ID || !process.env.SUBSCRIPTION_CREDENTIALS_PATH || !process.env.SUBSCRIPTION_NAME) {
  logToFile('Error: Missing required environment variables.', true);
  process.exit(1); // Exit the application if required variables are not set
}

try {
  // Load credentials if not using environment variable
  const pubSubClient = new PubSub({
    projectId: process.env.PROJECT_ID,
    keyFilename: process.env.SUBSCRIPTION_CREDENTIALS_PATH, // Optional if using env variable
  });

  const subscription = pubSubClient.subscription(process.env.SUBSCRIPTION_NAME);

  subscription.on('message', messageHandler);

  subscription.on('error', (error) => {
    logToFile(`Subscription Error: ${error.message}`);
  });

  console.log(`Listening for messages on ${process.env.SUBSCRIPTION_NAME}...`);
} catch (error) {
  logToFile(`Error initializing PubSub client: ${error.message}`);
  process.exit(1); // Exit the application on failure to initialize PubSub
}
