// Mock implementations for shared utilities

export class Logger {
  constructor(private context: string) {}

  info(message: string, meta?: any): void {
    console.log(JSON.stringify({
      level: 'info',
      message,
      timestamp: new Date().toISOString(),
      context: { service: this.context, ...meta }
    }));
  }

  warn(message: string, meta?: any): void {
    console.log(JSON.stringify({
      level: 'warn',
      message,
      timestamp: new Date().toISOString(),
      context: { service: this.context, ...meta }
    }));
  }

  error(message: string, meta?: any): void {
    console.log(JSON.stringify({
      level: 'error',
      message,
      timestamp: new Date().toISOString(),
      context: { service: this.context, ...meta }
    }));
  }

  debug(message: string, meta?: any): void {
    console.log(JSON.stringify({
      level: 'debug',
      message,
      timestamp: new Date().toISOString(),
      context: { service: this.context, ...meta }
    }));
  }
}