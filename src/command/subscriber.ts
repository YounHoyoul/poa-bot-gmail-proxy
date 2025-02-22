import { GmailAuthService } from '../GmailAuthService.js';
import { GmailMessageService } from '../GmailMessageService.js';
import { GmailWatchService } from '../GmailWatchService.js';
import { PubSubSubscriber } from '../PubSubSubscriber.js';
import { StorageService } from '../StorageService.js';

const gmailWatchService = new GmailWatchService(
  new GmailAuthService().getAuth2Client(),
  new StorageService()
);

await gmailWatchService.startWatchWithRenewal();

const subscriber = new PubSubSubscriber(
  new GmailMessageService(new GmailAuthService().getAuth2Client()),
  new StorageService()
);

await subscriber.initialize();
