import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import readline from 'readline';
import { google } from 'googleapis';
import { LoggingService } from './LoggingService.js';
import 'dotenv/config';
import path from 'path';
export class GmailAuthService {
    SCOPES;
    constructor() {
        this.SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
    }
    async getNewToken(oAuth2Client) {
        const env = process.env;
        try {
            const authUrl = oAuth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: this.SCOPES,
            });
            console.log('Authorize this app by visiting this URL:', authUrl);
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
            });
            rl.question('Enter the code from the page: ', async (code) => {
                try {
                    const { tokens } = await oAuth2Client.getToken(code);
                    oAuth2Client.setCredentials(tokens);
                    if (!env.TOKEN_PATH) {
                        throw new Error('TOKEN_PATH is not set in environment variables.');
                    }
                    // Ensure the directory for the token file exists
                    const tokenDir = path.dirname(env.TOKEN_PATH);
                    if (!existsSync(tokenDir)) {
                        mkdirSync(tokenDir, { recursive: true });
                    }
                    writeFileSync(env.TOKEN_PATH, JSON.stringify(tokens));
                    console.log('Token stored to', env.TOKEN_PATH);
                }
                catch (error) {
                    console.error('Error while retrieving token:', error.message);
                }
                finally {
                    rl.close();
                }
            });
        }
        catch (error) {
            console.error('Error initiating OAuth flow:', error.message);
        }
    }
    getAuth2Client(isNewToken = false) {
        const env = process.env;
        try {
            if (!env.CREDENTIALS_PATH) {
                throw new Error('CREDENTIALS_PATH is not set.');
            }
            if (!existsSync(env.CREDENTIALS_PATH)) {
                throw new Error('Credentials file not found.');
            }
            const credentials = JSON.parse(readFileSync(env.CREDENTIALS_PATH, 'utf8'));
            const { client_secret, client_id, redirect_uris } = credentials.installed;
            const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris);
            if (!isNewToken) {
                if (!env.TOKEN_PATH || !existsSync(env.TOKEN_PATH)) {
                    throw new Error('Missing or invalid token file.');
                }
                const token = JSON.parse(readFileSync(env.TOKEN_PATH, 'utf8'));
                oAuth2Client.setCredentials(token);
            }
            return oAuth2Client;
        }
        catch (error) {
            LoggingService.logToFile(`Error initializing OAuth2 client: ${error.message}`, true);
            process.exit(1);
        }
    }
}
