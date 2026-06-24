/**
 * Structured logging utility for Figma plugin
 * Provides consistent logging with levels and context
 */

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

interface LogContext {
  [key: string]: unknown;
}

class Logger {
  private isDevelopment: boolean;

  constructor() {
    // In Figma plugins, we're always in development mode when running locally
    this.isDevelopment = true;
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` | ${JSON.stringify(context)}` : "";
    return `[${timestamp}] [${level}] ${message}${contextStr}`;
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    // Production: no-op (stripped to nothing by DCE). Dev: route through
    // console so the dev-log bridge (devLogger.ts) mirrors it to Claude.
    if (!__W2W_DEV_LOG__) return;
    const line = this.formatMessage(level, message, context);
    if (level === LogLevel.ERROR) console.error(line);
    else if (level === LogLevel.WARN) console.warn(line);
    else console.log(line);
  }

  /**
   * Log debug information (only in development)
   */
  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log general information
   */
  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log warnings
   */
  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log errors
   */
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorContext = {
      ...context,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    };
    this.log(LogLevel.ERROR, message, errorContext);
  }
}

// Export singleton instance
export const logger = new Logger();
