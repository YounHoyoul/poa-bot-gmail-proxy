import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { LoggingService } from './LoggingService.js';
import 'dotenv/config';
import path from 'path';

export class StorageService {
  private readonly storagePath: string;

  constructor(storagePath: string = process.env.STORAGE_PATH ?? './storage/history.json') {
    this.storagePath = storagePath;
    this.ensureStorageDirectory();
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
        // Type 'unknown' from catch, assert or check as Error
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

  async readHistory(): Promise<string> {
    try {
      const content = existsSync(this.storagePath) ? readFileSync(this.storagePath, 'utf8') : '{}';
      LoggingService.debug(`Read history from ${this.storagePath} - ${content}`, {
        component: 'StorageService',
        length: content.length,
      });
      return content;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(
        `Failed to read history from ${this.storagePath}: ${errorMessage}`,
        errorStack,
        {
          component: 'StorageService',
          storagePath: this.storagePath,
        }
      );
      throw error;
    }
  }

  async storeHistory(content: string): Promise<void> {
    try {
      writeFileSync(this.storagePath, content, 'utf8');
      LoggingService.info(`Stored history to ${this.storagePath} - ${content}`, {
        component: 'StorageService',
        size: content.length,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error : undefined;
      LoggingService.error(
        `Failed to store history to ${this.storagePath}: ${errorMessage}`,
        errorStack,
        {
          component: 'StorageService',
          storagePath: this.storagePath,
        }
      );
      throw error;
    }
  }
}
