import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { LoggingService } from './LoggingService.js';
import 'dotenv/config';
import path from 'path';

export class StorageService {
  private storagePath: string | undefined; // Make storagePath optional

  constructor() {
    this.storagePath = process.env.STORAGE_PATH; // Initialize in constructor
    if (!this.storagePath) {
      LoggingService.logToFile('STORAGE_PATH is not set in environment variables.', true);
      // Consider if you want to throw an error here to halt execution
      // or handle it gracefully later.  If you don't throw, be prepared
      // to handle the undefined storagePath in your methods.
      // throw new Error('STORAGE_PATH is not set in environment variables.');
    }
  }

  async readHistory(): Promise<string | null> {
    if (!this.storagePath) {
      LoggingService.logToFile('Cannot read watch response: STORAGE_PATH is not defined.', true);
      return null;
    }
    try {
      const data = readFileSync(this.storagePath, 'utf8');
      return data;
    } catch (error) {
      LoggingService.logToFile(`Error reading watch response: ${(error as Error).message}`, true);
      return null;
    }
  }

  async storeHistory(response: string): Promise<void> {
    // Accept any type for response

    if (!this.storagePath) {
      // Handle the case where storagePath is not defined.
      // E.g., log a message, throw an error, or skip storing.
      LoggingService.logToFile('Cannot store watch response: STORAGE_PATH is not defined.', true);
      return; // Or throw an error if you want to stop execution
      // throw new Error('STORAGE_PATH is not set in environment variables.');
    }

    try {
      const storageDir = path.dirname(this.storagePath);
      if (!existsSync(storageDir)) {
        mkdirSync(storageDir, { recursive: true });
        LoggingService.logToFile(`Storage directory created: ${storageDir}`);
      }
      writeFileSync(this.storagePath, JSON.stringify(response, null, 2), 'utf8'); // Stringify with indentation
    } catch (writeError) {
      LoggingService.logToFile(
        `Error writing to storage file: ${(writeError as Error).message}`,
        true
      );
      throw writeError; // Re-throw the error after logging it.  Important!
    }
  }
}
