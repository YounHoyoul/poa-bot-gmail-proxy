// types/node-cron.d.ts
declare module 'node-cron' {
    interface CronJob {
      start(): void;
      stop(): void;
    }
  
    interface ScheduleOptions {
      scheduled?: boolean;
      timezone?: string;
    }
  
    function schedule(
      pattern: string,
      fn: () => void | Promise<void>,
      options?: ScheduleOptions
    ): CronJob;
  
    function validate(cronExpression: string): boolean;
  }