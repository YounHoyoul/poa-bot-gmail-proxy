import 'dotenv/config';
import { appendFileSync } from 'fs';
import { format } from 'date-fns';

export class LoggingService {
  static logToFile(message: string, isError: boolean = false): void {
    if (isError) {
      console.error(message);
    } else {
      console.log(message);
    }

    const timestamp: string = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
    const logMessage: string = `[${timestamp}] ${message}\n`;

    try {
      appendFileSync(process.env.LOGGING_PATH!, logMessage, 'utf8');
    } catch (error: unknown) {
      console.error('Error writing to log file:', error);
    }
  }
}
