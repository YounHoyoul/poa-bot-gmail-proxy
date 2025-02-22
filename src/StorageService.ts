import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { LoggingService } from './LoggingService.js';
import 'dotenv/config';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';

// Define the structure of our single history record
interface HistoryRecord {
  historyId: string;
  targetLabelId: string;
  unprocessedLabelId: string;
  runningCount: number;
  lastProcessedEamilId: string;
  processedEmailIds: string[];
}

export class StorageService {
  private readonly db: Low<HistoryRecord>;
  private readonly storagePath: string;

  constructor(storagePath: string = process.env.STORAGE_PATH ?? './storage/history.json') {
    this.storagePath = storagePath;
    this.ensureStorageDirectory();

    const adapter = new JSONFile<HistoryRecord>(this.storagePath);
    this.db = new Low<HistoryRecord>(adapter, {
      historyId: '',
      targetLabelId: '',
      unprocessedLabelId: '',
      runningCount: 0,
      lastProcessedEamilId: '',
      processedEmailIds: [],
    });
    this.initializeDatabase();
  }

  private ensureStorageDirectory(): void {
    const storageDir = path.dirname(this.storagePath);
    if (!existsSync(storageDir)) {
      try {
        mkdirSync(storageDir, { recursive: true });
        LoggingService.info(`Created storage directory: ${storageDir}`, {
          component: 'StorageService',
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error : undefined;
        LoggingService.error(`Failed to create storage directory: ${errorMessage}`, errorStack, {
          component: 'StorageService',
          storagePath: this.storagePath,
        });
        throw error;
      }
    }
  }

  private async initializeDatabase(): Promise<void> {
    try {
      await this.db.read();
      this.db.data ||= {
        historyId: '',
        targetLabelId: '',
        unprocessedLabelId: '',
        runningCount: 0,
        lastProcessedEamilId: '',
        processedEmailIds: [],
      };
      await this.db.write();
      LoggingService.info('JSON database initialized successfully', {
        component: 'StorageService',
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(`Failed to initialize database: ${errorMessage}`, errorStack, {
        component: 'StorageService',
        storagePath: this.storagePath,
      });
      throw error;
    }
  }

  async readHistory(): Promise<HistoryRecord> {
    try {
      await this.db.read();
      const record = this.db.data;
      LoggingService.debug(`Read history record from database`, {
        component: 'StorageService',
        historyId: record.historyId,
      });
      return record;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(`Failed to read history from database: ${errorMessage}`, errorStack, {
        component: 'StorageService',
        storagePath: this.storagePath,
      });
      throw error;
    }
  }

  async getHistoryId(): Promise<string> {
    try {
      await this.db.read();
      const historyId = this.db.data.historyId;
      LoggingService.debug(`Retrieved historyId from database`, {
        component: 'StorageService',
        historyId,
      });
      return historyId;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(`Failed to get historyId from database: ${errorMessage}`, errorStack, {
        component: 'StorageService',
        storagePath: this.storagePath,
      });
      throw error;
    }
  }

  async getTargetLabelId(): Promise<string> {
    try {
      await this.db.read();
      const targetLabelId = this.db.data.targetLabelId;
      LoggingService.debug(`Retrieved targetLabelId from database`, {
        component: 'StorageService',
        targetLabelId,
      });
      return targetLabelId;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(
        `Failed to get targetLabelId from database: ${errorMessage}`,
        errorStack,
        {
          component: 'StorageService',
          storagePath: this.storagePath,
        }
      );
      throw error;
    }
  }

  async getUnprocessedLabelId(): Promise<string> {
    try {
      await this.db.read();
      const unprocessedLabelId = this.db.data.unprocessedLabelId;
      LoggingService.debug(`Retrieved unprocessedLabelId from database`, {
        component: 'StorageService',
        unprocessedLabelId,
      });
      return unprocessedLabelId;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(
        `Failed to get unprocessedLabelId from database: ${errorMessage}`,
        errorStack,
        {
          component: 'StorageService',
          storagePath: this.storagePath,
        }
      );
      throw error;
    }
  }

  async getLastProcessedEmailId(): Promise<string> {
    try {
      await this.db.read();
      const lastProcessedEamilId = this.db.data.lastProcessedEamilId;
      LoggingService.debug(`Retrieved lastProcessedEamilId from database`, {
        component: 'StorageService',
        lastProcessedEamilId,
      });
      return lastProcessedEamilId;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(
        `Failed to get lastProcessedEamilId from database: ${errorMessage}`,
        errorStack,
        {
          component: 'StorageService',
          storagePath: this.storagePath,
        }
      );
      throw error;
    }
  }

  async getRunningCount(): Promise<number> {
    try {
      await this.db.read();
      const runningCount = this.db.data.runningCount;
      LoggingService.debug(`Retrieved runningCount from database`, {
        component: 'StorageService',
        runningCount,
      });
      return runningCount;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(
        `Failed to get runningCount from database: ${errorMessage}`,
        errorStack,
        {
          component: 'StorageService',
          storagePath: this.storagePath,
        }
      );
      throw error;
    }
  }

  async storeHistoryId(historyId: string): Promise<void> {
    try {
      await this.db.read();
      this.db.data.historyId = historyId;
      await this.db.write();
      LoggingService.info(`Stored historyId to database`, {
        component: 'StorageService',
        historyId,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(`Failed to store historyId to database: ${errorMessage}`, errorStack, {
        component: 'StorageService',
        storagePath: this.storagePath,
      });
      throw error;
    }
  }

  async storeTargetLabelId(targetLabelId: string): Promise<void> {
    try {
      await this.db.read();
      this.db.data.targetLabelId = targetLabelId;
      await this.db.write();
      LoggingService.info(`Stored targetLabelId to database`, {
        component: 'StorageService',
        targetLabelId,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(
        `Failed to store targetLabelId to database: ${errorMessage}`,
        errorStack,
        {
          component: 'StorageService',
          storagePath: this.storagePath,
        }
      );
      throw error;
    }
  }

  async storeUnprocessedLabelId(unprocessedLabelId: string): Promise<void> {
    try {
      await this.db.read();
      this.db.data.unprocessedLabelId = unprocessedLabelId;
      await this.db.write();
      LoggingService.info(`Stored unprocessedLabelId to database`, {
        component: 'StorageService',
        unprocessedLabelId,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(
        `Failed to store unprocessedLabelId to database: ${errorMessage}`,
        errorStack,
        {
          component: 'StorageService',
          storagePath: this.storagePath,
        }
      );
      throw error;
    }
  }

  async storeLastProcessedEmailId(lastProcessedEamilId: string): Promise<void> {
    try {
      await this.db.read();
      this.db.data.lastProcessedEamilId = lastProcessedEamilId;
      await this.db.write();
      LoggingService.info(`Stored lastProcessedEamilId to database`, {
        component: 'StorageService',
        lastProcessedEamilId,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(
        `Failed to store lastProcessedEamilId to database: ${errorMessage}`,
        errorStack,
        {
          component: 'StorageService',
          storagePath: this.storagePath,
        }
      );
      throw error;
    }
  }

  async resetRunningCount(): Promise<void> {
    try {
      await this.db.read();
      this.db.data.runningCount = 0;
      await this.db.write();
      LoggingService.info(`Stored runningCount to database`, {
        component: 'StorageService',
        runningCount: 0,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(
        `Failed to store runningCount to database: ${errorMessage}`,
        errorStack,
        {
          component: 'StorageService',
          storagePath: this.storagePath,
        }
      );
      throw error;
    }
  }

  async increaseRunningCount(): Promise<void> {
    try {
      await this.db.read();
      this.db.data.runningCount = this.db.data.runningCount + 1;
      await this.db.write();
      LoggingService.info(`Stored runningCount to database`, {
        component: 'StorageService',
        runningCount: this.db.data.runningCount,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(
        `Failed to store runningCount to database: ${errorMessage}`,
        errorStack,
        {
          component: 'StorageService',
          storagePath: this.storagePath,
        }
      );
      throw error;
    }
  }

  async addProcessedEmailIds(emailId: string): Promise<void> {
    try {
      await this.db.read();
      if (this.db.data.processedEmailIds == null) {
        LoggingService.warn(
          `processedEmailIds was null or undefined, initializing to empty array`,
          {
            component: 'StorageService',
          }
        );
        this.db.data.processedEmailIds = [];
      }
      if (!this.db.data.processedEmailIds.includes(emailId)) {
        this.db.data.processedEmailIds.push(emailId);

        // Check if array exceeds 100 items
        if (this.db.data.processedEmailIds.length > 100) {
          // Calculate how many items to remove from the beginning
          const itemsToRemove = this.db.data.processedEmailIds.length - 100;
          // Remove oldest items from the start of the array
          const removedItems = this.db.data.processedEmailIds.splice(0, itemsToRemove);

          LoggingService.debug(`Trimmed processedEmailIds to maintain 100 items max`, {
            component: 'StorageService',
            removedCount: itemsToRemove,
            removedItems,
            newLength: this.db.data.processedEmailIds.length,
          });
        }

        await this.db.write();
        LoggingService.info(`Added emailId to processedEmailIds`, {
          component: 'StorageService',
          emailId,
          totalProcessed: this.db.data.processedEmailIds.length,
        });
      } else {
        LoggingService.debug(`EmailId already in processedEmailIds`, {
          component: 'StorageService',
          emailId,
        });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(
        `Failed to add emailId to processedEmailIds: ${errorMessage}`,
        errorStack,
        {
          component: 'StorageService',
          storagePath: this.storagePath,
          emailId,
        }
      );
      throw error;
    }
  }

  async isEmailProcessed(emailId: string): Promise<boolean> {
    try {
      await this.db.read();
      if (this.db.data.processedEmailIds == null) {
        LoggingService.warn(`processedEmailIds was null or undefined, treating as empty`, {
          component: 'StorageService',
          emailId,
        });
        return false;
      }
      const hasBeenProcessed = this.db.data.processedEmailIds.includes(emailId);
      LoggingService.debug(`Checked if email has been processed`, {
        component: 'StorageService',
        emailId,
        hasBeenProcessed,
      });
      return hasBeenProcessed;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(
        `Failed to check if email has been processed: ${errorMessage}`,
        errorStack,
        {
          component: 'StorageService',
          storagePath: this.storagePath,
          emailId,
        }
      );
      throw error;
    }
  }

  async resetProcessedEmailIds(): Promise<void> {
    try {
      await this.db.read();
      this.db.data.processedEmailIds = [];
      await this.db.write();
      LoggingService.info(`Reset processedEmailIds array`, {
        component: 'StorageService',
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(`Failed to reset processedEmailIds: ${errorMessage}`, errorStack, {
        component: 'StorageService',
        storagePath: this.storagePath,
      });
      throw error;
    }
  }
}
