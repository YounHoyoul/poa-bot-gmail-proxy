import { GmailAuthService } from '../GmailAuthService.js';
const gmailAuthService = new GmailAuthService();
gmailAuthService.getNewToken(gmailAuthService.getAuth2Client(true));
