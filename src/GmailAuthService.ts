import { writeFileSync, readFileSync, existsSync } from 'fs';
import readline from 'readline';
import { google } from 'googleapis';
import { OAuth2Client, Credentials } from 'google-auth-library';
import { LoggingService } from './LoggingService.js';
import 'dotenv/config';

interface GoogleCredentials {
  installed: {
    client_secret: string;
    client_id: string;
    redirect_uris: string[];
  };
}

export class GmailAuthService {
  private readonly SCOPES: string[];

  constructor() {
    this.SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
  }

  async getNewToken(oAuth2Client: OAuth2Client): Promise<void> {
    try {
      const authUrl: string = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: this.SCOPES,
      });

      console.log('Authorize this app by visiting this URL:', authUrl);

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question('Enter the code from the page: ', async (code: string) => {
        try {
          const { tokens }: { tokens: Credentials } = await oAuth2Client.getToken(code);
          oAuth2Client.setCredentials(tokens);

          if (!process.env.TOKEN_PATH)
            throw new Error('TOKEN_PATH is not set in environment variables.');

          writeFileSync(process.env.TOKEN_PATH, JSON.stringify(tokens));
          console.log('Token stored to', process.env.TOKEN_PATH);
        } catch (error) {
          console.error('Error while retrieving token:', (error as Error).message);
        } finally {
          rl.close();
        }
      });
    } catch (error) {
      console.error('Error initiating OAuth flow:', (error as Error).message);
    }
  }

  getAuth2Client(isNewToken: boolean = false): OAuth2Client {
    try {
      if (!process.env.CREDENTIALS_PATH) throw new Error('CREDENTIALS_PATH is not set.');

      if (!existsSync(process.env.CREDENTIALS_PATH)) throw new Error('Credentials file not found.');

      const credentials: GoogleCredentials = JSON.parse(
        readFileSync(process.env.CREDENTIALS_PATH, 'utf8')
      );
      const { client_secret, client_id, redirect_uris } = credentials.installed;
      const oAuth2Client: OAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
      );

      if (!isNewToken) {
        if (!process.env.TOKEN_PATH || !existsSync(process.env.TOKEN_PATH)) {
          throw new Error('Missing or invalid token file.');
        }
        const token: Credentials = JSON.parse(readFileSync(process.env.TOKEN_PATH, 'utf8'));
        oAuth2Client.setCredentials(token);
      }

      return oAuth2Client;
    } catch (error) {
      LoggingService.logToFile(
        `Error initializing OAuth2 client: ${(error as Error).message}`,
        true
      );
      process.exit(1);
    }
  }
}
