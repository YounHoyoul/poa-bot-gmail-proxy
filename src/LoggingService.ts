import 'dotenv/config';
import { existsSync, mkdirSync } from 'fs';
import { format } from 'date-fns';
import path from 'path';
import { Logger, createLogger, format as winstonFormat, transports } from 'winston';

// Define log levels
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
  [key: string]: unknown; // Allow additional metadata
}

export class LoggingService {
  private static readonly DEFAULT_LOG_PATH = './logs/app.log';
  private static readonly DEFAULT_LEVEL = LogLevel.INFO;
  private static readonly SERVICE_NAME = 'GmailService';
  private static logger: Logger;

  constructor() {
    if (!LoggingService.logger) {
      LoggingService.initializeLogger();
    }
  }

  private static initializeLogger(): void {
    const logPath = process.env.LOGGING_PATH ?? LoggingService.DEFAULT_LOG_PATH;
    const logLevel = (process.env.LOG_LEVEL as LogLevel) ?? LoggingService.DEFAULT_LEVEL;

    // Ensure log directory exists
    const logDir = path.dirname(logPath);
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    // Configure Winston logger
    LoggingService.logger = createLogger({
      level: logLevel,
      format: winstonFormat.combine(
        winstonFormat.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winstonFormat.json(), // Structured JSON output
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

  static log(level: LogLevel, message: string, meta: Partial<LogEntry> = {}): void {
    if (!LoggingService.logger) {
      LoggingService.initializeLogger();
    }

    const logEntry: LogEntry = {
      level,
      message,
      timestamp: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
      ...meta,
    };

    LoggingService.logger.log(level, message, logEntry);
  }

  // Convenience methods
  static debug(message: string, meta: Partial<LogEntry> = {}): void {
    this.log(LogLevel.DEBUG, message, meta);
  }

  static info(message: string, meta: Partial<LogEntry> = {}): void {
    this.log(LogLevel.INFO, message, meta);
  }

  static warn(message: string, meta: Partial<LogEntry> = {}): void {
    this.log(LogLevel.WARN, message, meta);
  }

  static error(message: string, error?: Error, meta: Partial<LogEntry> = {}): void {
    this.log(LogLevel.ERROR, message, { ...meta, error: error?.stack });
  }

  static fatal(message: string, error?: Error, meta: Partial<LogEntry> = {}): void {
    this.log(LogLevel.FATAL, message, { ...meta, error: error?.stack });
    process.exit(1); // Exit on fatal errors
  }
}
