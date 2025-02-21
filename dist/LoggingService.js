import 'dotenv/config';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { format } from 'date-fns';
import path from 'path'; // Import the path module
export class LoggingService {
    static logToFile(message, isError = false) {
        const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
        const logMessage = `[${timestamp}] ${message}\n`;
        if (isError) {
            console.error(logMessage.trim()); // Log to console with timestamp
        }
        else {
            console.log(logMessage.trim()); // Log to console with timestamp
        }
        try {
            const logFilePath = process.env.LOGGING_PATH;
            // Ensure directory exists
            const logDir = path.dirname(logFilePath); // Extract the directory part
            if (!existsSync(logDir)) {
                mkdirSync(logDir, { recursive: true }); // Create the directory recursively
                console.log(`Log directory created: ${logDir}`); // Optional: Log directory creation
            }
            appendFileSync(logFilePath, logMessage, 'utf8');
        }
        catch (error) {
            console.error('Error writing to log file:', error);
            // If logging to file fails, you might want to consider a fallback
            // like writing to a default log file or using a different logging mechanism.
        }
    }
}
