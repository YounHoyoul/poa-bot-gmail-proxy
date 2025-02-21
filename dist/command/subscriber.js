import { GmailAuthService } from '../GmailAuthService.js';
import { GmailMessageService } from '../GmailMessageService.js';
import { PubSubSubscriber } from '../PubSubSubscriber.js';
const subscriber = new PubSubSubscriber(new GmailMessageService(new GmailAuthService().getAuth2Client()));
await subscriber.initialize();
