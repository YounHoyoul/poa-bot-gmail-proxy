import { GmailAuthService } from '../GmailAuthService.js';

const gmailAuthService = new GmailAuthService();

await gmailAuthService.getNewToken(gmailAuthService.getAuth2Client(true));
