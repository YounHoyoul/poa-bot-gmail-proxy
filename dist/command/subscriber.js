import { GmailAuthService } from '../GmailAuthService.js';
import { GmailMessageService } from '../GmailMessageService.js';
import { GmailWatchService } from '../GmailWatchService.js';
import { LoggingService } from '../LoggingService.js';
import { PubSubSubscriber } from '../PubSubSubscriber.js';
import { StorageService } from '../StorageService.js';
try {
    const storageService = new StorageService();
    const gmailWatchService = new GmailWatchService(await new GmailAuthService().getAuth2Client(), storageService);
    await gmailWatchService.startWatchWithRenewal();
    const subscriber = new PubSubSubscriber(new GmailMessageService(await new GmailAuthService().getAuth2Client(), storageService), storageService);
    await subscriber.initialize();
}
catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error : undefined;
    LoggingService.error(`Failed with unknown error: ${errorMessage}`, errorStack, {
        component: 'subscriber',
    });
}
