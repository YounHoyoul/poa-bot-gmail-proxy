import 'dotenv/config';
import { existsSync, mkdirSync } from 'fs';
import { format } from 'date-fns';
import path from 'path';
import { createLogger, format as winstonFormat, transports } from 'winston';
// Define log levels
export var LogLevel;
(function (LogLevel) {
    LogLevel["DEBUG"] = "debug";
    LogLevel["INFO"] = "info";
    LogLevel["WARN"] = "warn";
    LogLevel["ERROR"] = "error";
    LogLevel["FATAL"] = "fatal";
})(LogLevel || (LogLevel = {}));
export class LoggingService {
    static DEFAULT_LOG_PATH = './logs/app.log';
    static DEFAULT_LEVEL = LogLevel.INFO;
    static SERVICE_NAME = 'GmailService';
    static logger;
    constructor() {
        if (!LoggingService.logger) {
            LoggingService.initializeLogger();
        }
    }
    static initializeLogger() {
        const logPath = process.env.LOGGING_PATH ?? LoggingService.DEFAULT_LOG_PATH;
        const logLevel = process.env.LOG_LEVEL ?? LoggingService.DEFAULT_LEVEL;
        // Ensure log directory exists
        const logDir = path.dirname(logPath);
        if (!existsSync(logDir)) {
            mkdirSync(logDir, { recursive: true });
        }
        // Configure Winston logger
        LoggingService.logger = createLogger({
            level: logLevel,
            format: winstonFormat.combine(winstonFormat.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winstonFormat.json(), // Structured JSON output
            winstonFormat.errors({ stack: true }) // Include stack traces for errors
            ),
            defaultMeta: { service: LoggingService.SERVICE_NAME },
            transports: [
                new transports.Console(), // Log to console
                new transports.File({
                    filename: logPath,
                    maxsize: 5 * 1024 * 1024, // 5MB per file
                    maxFiles: 5, // Keep 5 rotated files
                    tailable: true, // Rotate logs
                }),
            ],
        });
        // Handle logging errors
        LoggingService.logger.on('error', (error) => {
            console.error('Logging failed:', error); // Fallback to console
        });
    }
    static log(level, message, meta = {}) {
        if (!LoggingService.logger) {
            LoggingService.initializeLogger();
        }
        const logEntry = {
            level,
            message,
            timestamp: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
            ...meta,
        };
        LoggingService.logger.log(level, message, logEntry);
    }
    // Convenience methods
    static debug(message, meta = {}) {
        this.log(LogLevel.DEBUG, message, meta);
    }
    static info(message, meta = {}) {
        this.log(LogLevel.INFO, message, meta);
    }
    static warn(message, meta = {}) {
        this.log(LogLevel.WARN, message, meta);
    }
    static error(message, error, meta = {}) {
        this.log(LogLevel.ERROR, message, { ...meta, error: error?.stack });
    }
    static fatal(message, error, meta = {}) {
        this.log(LogLevel.FATAL, message, { ...meta, error: error?.stack });
        process.exit(1); // Exit on fatal errors
    }
}
