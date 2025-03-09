import { GmailAuthService } from '../GmailAuthService.js';

const gmailAuthService = new GmailAuthService();

await gmailAuthService.getNewToken(
  await gmailAuthService.getAuth2Client(true)
);
