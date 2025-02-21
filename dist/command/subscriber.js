import { GmailAuthService } from '../GmailAuthService.js';
import { GmailMessageService } from '../GmailMessageService.js';
import { PubSubSubscriber } from '../PubSubSubscriber.js';
import { StorageService } from '../StorageService.js';
const subscriber = new PubSubSubscriber(new GmailMessageService(new GmailAuthService().getAuth2Client()), new StorageService());
await subscriber.initialize();
