import { GmailAuthService } from '../GmailAuthService.js';
import { GmailWatchService } from '../GmailWatchService.js';
import { StorageService } from '../StorageService.js';

const gmailWatchService = new GmailWatchService(
  new GmailAuthService().getAuth2Client(),
  new StorageService()
);

await gmailWatchService.stopWatch();
