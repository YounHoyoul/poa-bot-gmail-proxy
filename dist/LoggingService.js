/* eslint-disable @typescript-eslint/no-explicit-any */
import 'dotenv/config';
import { existsSync, mkdirSync } from 'fs';
import { format } from 'date-fns';
import path from 'path';
import winston, { createLogger, transports } from 'winston';
import { Logging } from '@google-cloud/logging';
import axios from 'axios';
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
    static DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
    static logger;
    static cloudLogger;
    constructor() {
        if (!LoggingService.logger || !LoggingService.cloudLogger) {
            LoggingService.initializeLogger();
        }
    }
    static initializeLogger() {
        const logPath = process.env.LOGGING_PATH ?? LoggingService.DEFAULT_LOG_PATH;
        const logLevel = process.env.LOG_LEVEL ?? LoggingService.DEFAULT_LEVEL;
        const projectId = process.env.GOOGLE_CLOUD_PROJECT; // Set in .env
        // Ensure local log directory exists
        const logDir = path.dirname(logPath);
        if (!existsSync(logDir)) {
            mkdirSync(logDir, { recursive: true });
        }
        // Initialize Google Cloud Logging (requires GOOGLE_APPLICATION_CREDENTIALS env var or ADC)
        LoggingService.cloudLogger = new Logging({ projectId });
        // Configure Winston logger
        LoggingService.logger = createLogger({
            level: logLevel,
            format: winston.format.combine(winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston.format.json(), winston.format.errors({ stack: true })),
            defaultMeta: { service: LoggingService.SERVICE_NAME },
            transports: [
                new transports.Console(),
                new transports.File({
                    filename: logPath,
                    maxsize: 5 * 1024 * 1024, // 5MB
                    maxFiles: 5,
                    tailable: true,
                }),
            ],
        });
        LoggingService.logger.on('error', (error) => {
            console.error('Local logging failed:', error); // Fallback to console
        });
    }
    static async sendToCloud(level, message, meta = {}) {
        if (!LoggingService.cloudLogger)
            return;
        const log = LoggingService.cloudLogger.log('app_logs'); // Log name in Cloud Logging
        const severity = level.toUpperCase();
        const entry = log.entry({ severity, labels: { component: meta.component || 'unknown' } }, {
            message,
            timestamp: new Date().toISOString(),
            ...meta,
        });
        try {
            await log.write(entry);
        }
        catch (error) {
            console.error('Failed to send log to Google Cloud Logging:', error);
        }
    }
    static async sendToDiscord(level, message, meta = {}) {
        if (!LoggingService.DISCORD_WEBHOOK_URL)
            return; // Skip if URL is not set
        if (level === LogLevel.ERROR || level === LogLevel.FATAL) {
            const payload = {
                content: `**${level.toUpperCase()}**: ${message}\n` +
                    (meta.error ? `\`\`\`\n${meta.error}\n\`\`\`` : ''),
                username: 'Log Bot',
            };
            try {
                await axios.post(LoggingService.DISCORD_WEBHOOK_URL, payload);
            }
            catch (error) {
                console.error('Failed to send message to Discord:', error);
            }
        }
    }
    static async log(level, message, meta = {}) {
        if (!LoggingService.logger) {
            LoggingService.initializeLogger();
        }
        const logEntry = {
            level,
            message,
            timestamp: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
            ...meta,
        };
        // Log locally with Winston
        LoggingService.logger.log(level, message, logEntry);
        // Send to Google Cloud Logging asynchronously
        await this.sendToCloud(level, message, meta);
        // Send to Discord if error or fatal
        await this.sendToDiscord(level, message, meta);
    }
    static async debug(message, meta = {}) {
        await this.log(LogLevel.DEBUG, message, meta);
    }
    static async info(message, meta = {}) {
        await this.log(LogLevel.INFO, message, meta);
    }
    static async warn(message, meta = {}) {
        await this.log(LogLevel.WARN, message, meta);
    }
    static async error(message, error, meta = {}) {
        await this.log(LogLevel.ERROR, message, { ...meta, error: error?.stack });
    }
    static async fatal(message, error, meta = {}) {
        await this.log(LogLevel.FATAL, message, { ...meta, error: error?.stack });
        process.exit(1);
    }
}
