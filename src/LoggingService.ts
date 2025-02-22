/* eslint-disable @typescript-eslint/no-explicit-any */
import 'dotenv/config';
import { existsSync, mkdirSync } from 'fs';
import { format } from 'date-fns';
import path from 'path';
import winston, { Logger, createLogger, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { Logging } from '@google-cloud/logging';
import axios from 'axios';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service?: string;
  correlationId?: string;
  [key: string]: any;
}

export class LoggingService {
  private static readonly DEFAULT_LOG_PATH = './logs/app.log';
  private static readonly DEFAULT_LEVEL = LogLevel.INFO;
  private static readonly SERVICE_NAME = 'GmailService';
  private static readonly DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
  private static logger: Logger;
  private static cloudLogger: Logging;

  constructor() {
    if (!LoggingService.logger || !LoggingService.cloudLogger) {
      LoggingService.initializeLogger();
    }
  }

  private static initializeLogger(): void {
    const logPath = process.env.LOGGING_PATH ?? LoggingService.DEFAULT_LOG_PATH;
    const logLevel = (process.env.LOG_LEVEL as LogLevel) ?? LoggingService.DEFAULT_LEVEL;
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
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.json(),
        winston.format.errors({ stack: true })
      ),
      defaultMeta: { service: LoggingService.SERVICE_NAME },
      transports: [
        new transports.Console(), // Console output remains unchanged
        new DailyRotateFile({
          // Replace File with DailyRotateFile
          filename: logPath, // e.g., './logs/app-%DATE%.log'
          datePattern: 'YYYY-MM-DD', // Rotate daily (e.g., app-2025-02-21.log)
          maxSize: '5m', // 5MB per file (optional, matches your original maxsize)
          maxFiles: '14d', // Keep logs for 14 days (adjustable)
        }),
      ],
    });

    LoggingService.logger.on('error', (error) => {
      console.error('Local logging failed:', error); // Fallback to console
    });
  }

  private static async sendToCloud(
    level: LogLevel,
    message: string,
    meta: Partial<LogEntry> = {}
  ): Promise<void> {
    if (!LoggingService.cloudLogger) return;

    const log = LoggingService.cloudLogger.log('app_logs'); // Log name in Cloud Logging
    const severity = level.toUpperCase() as 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
    const entry = log.entry(
      { severity, labels: { component: meta.component || 'unknown' } },
      {
        message,
        timestamp: new Date().toISOString(),
        ...meta,
      }
    );

    try {
      await log.write(entry);
    } catch (error) {
      console.error('Failed to send log to Google Cloud Logging:', error);
    }
  }

  private static async sendToDiscord(
    level: LogLevel,
    message: string,
    meta: Partial<LogEntry> = {}
  ): Promise<void> {
    if (!LoggingService.DISCORD_WEBHOOK_URL) return; // Skip if URL is not set

    if (level === LogLevel.ERROR || level === LogLevel.FATAL) {
      const payload = {
        content:
          `**${level.toUpperCase()}**: ${message}\n` +
          (meta.error ? `\`\`\`\n${meta.error}\n\`\`\`` : ''),
        username: 'Log Bot',
      };

      try {
        await axios.post(LoggingService.DISCORD_WEBHOOK_URL, payload);
      } catch (error) {
        console.error('Failed to send message to Discord:', error);
      }
    }
  }

  static async log(level: LogLevel, message: string, meta: Partial<LogEntry> = {}): Promise<void> {
    if (!LoggingService.logger) {
      LoggingService.initializeLogger();
    }

    const logEntry: LogEntry = {
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

  static async debug(message: string, meta: Partial<LogEntry> = {}): Promise<void> {
    await this.log(LogLevel.DEBUG, message, meta);
  }

  static async info(message: string, meta: Partial<LogEntry> = {}): Promise<void> {
    await this.log(LogLevel.INFO, message, meta);
  }

  static async warn(message: string, meta: Partial<LogEntry> = {}): Promise<void> {
    await this.log(LogLevel.WARN, message, meta);
  }

  static async error(message: string, error?: Error, meta: Partial<LogEntry> = {}): Promise<void> {
    await this.log(LogLevel.ERROR, message, { ...meta, error: error?.stack });
  }

  static async fatal(message: string, error?: Error, meta: Partial<LogEntry> = {}): Promise<void> {
    await this.log(LogLevel.FATAL, message, { ...meta, error: error?.stack });
    process.exit(1);
  }
}
