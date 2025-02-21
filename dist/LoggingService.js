import 'dotenv/config';
import { appendFileSync } from 'fs';
import { format } from 'date-fns';
export class LoggingService {
    static logToFile(message, isError = false) {
        if (isError) {
            console.error(message);
        }
        else {
            console.log(message);
        }
        const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
        const logMessage = `[${timestamp}] ${message}\n`;
        try {
            appendFileSync(process.env.LOGGING_PATH, logMessage, 'utf8');
        }
        catch (error) {
            console.error('Error writing to log file:', error);
        }
    }
}
