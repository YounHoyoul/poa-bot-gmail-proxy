import { GmailAuthService } from '../GmailAuthService.js';
import { GmailWatchService } from '../GmailWatchService.js';

await new GmailWatchService(new GmailAuthService().getAuth2Client()).stopWatch();
