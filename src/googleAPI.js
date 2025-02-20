import { writeFileSync, readFileSync, existsSync, appendFileSync } from 'fs';
import readline from 'readline';
import axios from 'axios';
import { google } from 'googleapis';
import { config } from 'dotenv';
import { format } from 'date-fns';

config();

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

export async function getNewToken(oAuth2Client) {
  try {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
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

        if (!process.env.TOKEN_PATH) throw new Error("TOKEN_PATH is not set in environment variables.");

        writeFileSync(process.env.TOKEN_PATH, JSON.stringify(tokens));
        console.log('Token stored to', process.env.TOKEN_PATH);
      } catch (error) {
        console.error("Error while retrieving token:", error.message);
      } finally {
        rl.close();
      }
    });
  } catch (error) {
    console.error("Error initiating OAuth flow:", error.message);
  }
}

export async function watchGmail() {
  try {
    const auth = getAuth2Client();
    const gmail = google.gmail({ version: 'v1', auth });

    if (!process.env.TOPIC_NAME) throw new Error("TOPIC_NAME is not set in environment variables.");

    const res = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName: process.env.TOPIC_NAME,
        labelIds: ['INBOX'],
      },
    });

    logToFile(`Watch response: ${JSON.stringify(res.data)}`);

    if (!process.env.STOAGE_PATH) throw new Error("STOAGE_PATH is not set in environment variables.");

    writeFileSync(process.env.STOAGE_PATH, JSON.stringify(res.data));
  } catch (error) {
    logToFile(`Error setting up Gmail watch: ${error.message}`, true);
  }
}

export async function stopWatch() {
  try {
    const auth = getAuth2Client();
    const gmail = google.gmail({ version: 'v1', auth });

    const res = await gmail.users.stop({ userId: 'me' });

    logToFile(`Stopped Gmail watch: ${JSON.stringify(res.data)}`);

  } catch (error) {
    logToFile(`Error stopping Gmail watch: ${error.message}`, true);
  }
}

export async function getEmailsByHistoryId(historyId, userId = "me", auth) {
  try {
    const gmail = google.gmail({ version: "v1", auth });

    const historyResponse = await gmail.users.history.list({
      userId,
      startHistoryId: historyId,
    });

    if (!historyResponse.data.history) {
      logToFile("No new emails found for the given historyId.");
      return [];
    }

    const messageIds = historyResponse.data.history.flatMap(h => h.messages || []).map(m => m.id);

    if (messageIds.length === 0) {
      logToFile("No new emails found.");
      return [];
    }

    return await Promise.all(
      messageIds.map(async messageId => {
        const message = await gmail.users.messages.get({ userId, id: messageId });
        return message.data;
      })
    );
  } catch (error) {
    logToFile(`Error fetching emails: ${error.message}`, true);
    return [];
  }
}

export async function getEmailContent(auth, messageId) {
  try {
    const gmail = google.gmail({ version: "v1", auth });

    const response = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
    });

    const message = response.data;

    if (!message.payload || !message.payload.headers) {
      throw new Error("Invalid email format.");
    }

    const headers = message.payload.headers;
    const subject = headers.find(header => header.name === "Subject")?.value || "No Subject";
    const sender = headers.find(header => header.name === "From")?.value || "Unknown Sender";
    const date = headers.find(header => header.name === "Date")?.value || "Unknown Date";

    let plainText = "";
    let htmlContent = "";

    if (message.payload.parts) {
      for (const part of message.payload.parts) {
        if (part.mimeType === "text/plain" && part.body?.data) {
          plainText = Buffer.from(part.body.data, "base64").toString("utf-8");
        } else if (part.mimeType === "text/html" && part.body?.data) {
          htmlContent = Buffer.from(part.body.data, "base64").toString("utf-8");
        }
      }
    } else if (message.payload.body?.data) {
      plainText = Buffer.from(message.payload.body.data, "base64").toString("utf-8");
    }

    return { sender, date, subject, plainText, htmlContent };
  } catch (error) {
    logToFile(`Error fetching email content: ${error.response?.data || error.message}`, true);
    return null;
  }
}

export function getAuth2Client(isNewToken = false) {
  try {
    if (!process.env.CREDENTIALS_PATH) throw new Error("CREDENTIALS_PATH is not set.");

    if (!existsSync(process.env.CREDENTIALS_PATH)) throw new Error("Credentials file not found.");

    const credentials = JSON.parse(readFileSync(process.env.CREDENTIALS_PATH, 'utf8'));
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    if (!isNewToken) {
      if (!process.env.TOKEN_PATH || !existsSync(process.env.TOKEN_PATH)) {
        throw new Error("Missing or invalid token file.");
      }
      const token = JSON.parse(readFileSync(process.env.TOKEN_PATH, 'utf8'));
      oAuth2Client.setCredentials(token);
    }

    return oAuth2Client;
  } catch (error) {
    logToFile(`Error initializing OAuth2 client: ${error.message}`, true);
    process.exit(1);
  }
}

export const messageHandler = async (message) => {
  try {
    logToFile(`Received message: ${message.id}`);
    logToFile(`Data: ${message.data.toString()}`);

    if (!process.env.STOAGE_PATH) throw new Error("STOAGE_PATH is not set in environment variables.");

    if (!existsSync(process.env.STOAGE_PATH)) {
      console.warn("Storage file does not exist, creating a new one.");
      writeFileSync(process.env.STOAGE_PATH, JSON.stringify({ historyId: "0" }));
    }

    const lastHistory = JSON.parse(readFileSync(process.env.STOAGE_PATH, 'utf8'));
    writeFileSync(process.env.STOAGE_PATH, message.data.toString());

    const oAuth2Client = getAuth2Client();
    const emails = await getEmailsByHistoryId(lastHistory.historyId, "me", oAuth2Client);

    if (emails.length > 0) {
      const { sender, date, plainText } = await getEmailContent(oAuth2Client, emails[0].id);

      logToFile(`Eamil Datetime: ${new Date(date).toLocaleString()}`);
      logToFile(`Calling Webhook with ${JSON.stringify(JSON.parse(plainText))}`);

      await axios.post(process.env.WEBHOOK_URL, JSON.parse(plainText));
    }
  } catch (error) {
    logToFile(`Error in message handler:${error.message}`, true);
  } finally {
    message.ack();
  }
};

export function logToFile(message, isError = false) {
  if (isError)
    console.error(message);
  else
    console.log(message);

  const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
  const logMessage = `[${timestamp}] ${message}\n`;

  try {
    appendFileSync(process.env.LOGGING_PATH, logMessage, 'utf8');
  } catch (error) {
    console.error('Error writing to log file:', error);
  }
};