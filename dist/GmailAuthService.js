import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import readline from 'readline';
import { google } from 'googleapis';
import { LoggingService } from './LoggingService.js'; // Updated import
import 'dotenv/config';
import path from 'path';
export class GmailAuthService {
    SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];
    credentialsPath;
    tokenPath;
    constructor(credentialsPath = process.env.CREDENTIALS_PATH ?? '', tokenPath = process.env.TOKEN_PATH ?? '') {
        if (!credentialsPath || !tokenPath) {
            const errorMessage = 'CREDENTIALS_PATH and TOKEN_PATH must be configured';
            LoggingService.error(errorMessage, undefined, { component: 'GmailAuthService' });
            throw new Error(errorMessage);
        }
        this.credentialsPath = credentialsPath;
        this.tokenPath = tokenPath;
    }
    async getNewToken(oAuth2Client) {
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: this.SCOPES,
        });
        console.log('Authorize this app by visiting this URL:', authUrl);
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        return new Promise((resolve, reject) => {
            rl.question('Enter the code from the page: ', async (code) => {
                try {
                    const { tokens } = await oAuth2Client.getToken(code);
                    oAuth2Client.setCredentials(tokens);
                    const tokenDir = path.dirname(this.tokenPath);
                    if (!existsSync(tokenDir)) {
                        mkdirSync(tokenDir, { recursive: true });
                        LoggingService.info(`Created token directory: ${tokenDir}`, {
                            component: 'GmailAuthService',
                            tokenPath: this.tokenPath,
                        });
                    }
                    writeFileSync(this.tokenPath, JSON.stringify(tokens));
                    LoggingService.info(`Token stored to ${this.tokenPath}`, {
                        component: 'GmailAuthService',
                        tokenPath: this.tokenPath,
                    });
                    resolve();
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    const errorStack = error instanceof Error ? error : undefined;
                    LoggingService.error(`Failed to retrieve token: ${errorMessage}`, errorStack, {
                        component: 'GmailAuthService',
                        tokenPath: this.tokenPath,
                    });
                    reject(error);
                }
                finally {
                    rl.close();
                }
            });
        });
    }
    async getAuth2Client(isNewToken = false) {
        if (!existsSync(this.credentialsPath)) {
            const errorMessage = `Credentials file not found at ${this.credentialsPath}`;
            LoggingService.error(errorMessage, undefined, {
                component: 'GmailAuthService',
                credentialsPath: this.credentialsPath,
            });
            throw new Error(errorMessage);
        }
        const credentials = JSON.parse(readFileSync(this.credentialsPath, 'utf8'));
        const { client_secret, client_id, redirect_uris } = credentials.installed;
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
        // 토큰 자동 갱신 설정
        oAuth2Client.on('tokens', async (tokens) => {
            if (tokens.refresh_token) {
                // 리프레시 토큰이 새로 발급된 경우 저장
                const currentTokens = oAuth2Client.credentials;
                currentTokens.refresh_token = tokens.refresh_token;
                writeFileSync(this.tokenPath, JSON.stringify(currentTokens));
            }
            else {
                // 액세스 토큰만 갱신된 경우
                writeFileSync(this.tokenPath, JSON.stringify(oAuth2Client.credentials));
            }
        });
        if (!isNewToken) {
            if (!existsSync(this.tokenPath)) {
                const errorMessage = `Token file not found at ${this.tokenPath}`;
                LoggingService.error(errorMessage, undefined, {
                    component: 'GmailAuthService',
                    tokenPath: this.tokenPath,
                });
                throw new Error(errorMessage);
            }
            const token = JSON.parse(readFileSync(this.tokenPath, 'utf8'));
            oAuth2Client.setCredentials(token);
            LoggingService.info('OAuth2 client initialized with existing token', {
                component: 'GmailAuthService',
                tokenPath: this.tokenPath,
            });
            setInterval(async () => {
                await this.forceRefreshToken(oAuth2Client);
            }, 60000 * 60 * 24);
        }
        else {
            LoggingService.info('OAuth2 client initialized for new token', {
                component: 'GmailAuthService',
                credentialsPath: this.credentialsPath,
            });
        }
        return oAuth2Client;
    }
    async forceRefreshToken(oAuth2Client) {
        try {
            const { credentials } = await oAuth2Client.refreshAccessToken();
            oAuth2Client.setCredentials(credentials);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error : undefined;
            LoggingService.error(`Failed to force refrsh token: ${errorMessage}`, errorStack, {
                component: 'GmailAuthService',
                tokenPath: this.tokenPath,
            });
        }
    }
}
