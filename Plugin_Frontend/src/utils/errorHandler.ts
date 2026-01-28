/**
 * Centralized error handling utility for Figma plugin
 * Provides consistent error handling with user notifications
 */

import { logger } from "./logger";

export enum ErrorCode {
  // Wireframe creation errors
  WIREFRAME_CREATION_FAILED = "WIREFRAME_CREATION_FAILED",
  ELEMENT_CREATION_FAILED = "ELEMENT_CREATION_FAILED",
  FONT_LOADING_FAILED = "FONT_LOADING_FAILED",

  // Data errors
  NO_DATA_RECEIVED = "NO_DATA_RECEIVED",
  INVALID_DATA_FORMAT = "INVALID_DATA_FORMAT",

  // UI errors
  UI_INITIALIZATION_FAILED = "UI_INITIALIZATION_FAILED",

  // Unknown errors
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

export interface ErrorDetails {
  code: ErrorCode;
  message: string;
  originalError?: Error | unknown;
  context?: Record<string, unknown>;
}

class ErrorHandler {
  /**
   * Handle error with logging and optional user notification
   */
  handle(details: ErrorDetails, notifyUser = true): void {
    const { code, message, originalError, context } = details;

    // Log the error
    logger.error(
      `[${code}] ${message}`,
      originalError,
      context
    );

    // Notify user if requested
    if (notifyUser) {
      figma.notify(message, { error: true, timeout: 4000 });
    }
  }

  /**
   * Wrap an async function with error handling
   * Returns a new function that catches errors and handles them appropriately
   */
  wrapAsync<T extends unknown[], R>(
    fn: (...args: T) => Promise<R>,
    errorCode: ErrorCode,
    errorMessage: string,
    notifyUser = true
  ): (...args: T) => Promise<R | null> {
    return async (...args: T): Promise<R | null> => {
      try {
        return await fn(...args);
      } catch (error) {
        this.handle(
          {
            code: errorCode,
            message: errorMessage,
            originalError: error,
          },
          notifyUser
        );
        return null;
      }
    };
  }

  /**
   * Wrap a sync function with error handling
   * Returns a new function that catches errors and handles them appropriately
   */
  wrapSync<T extends unknown[], R>(
    fn: (...args: T) => R,
    errorCode: ErrorCode,
    errorMessage: string,
    notifyUser = true
  ): (...args: T) => R | null {
    return (...args: T): R | null => {
      try {
        return fn(...args);
      } catch (error) {
        this.handle(
          {
            code: errorCode,
            message: errorMessage,
            originalError: error,
          },
          notifyUser
        );
        return null;
      }
    };
  }

  /**
   * Create a user-friendly error message from an unknown error
   */
  getUserMessage(error: unknown, defaultMessage = "An unexpected error occurred"): string {
    if (error instanceof Error) {
      return error.message || defaultMessage;
    }
    if (typeof error === "string") {
      return error;
    }
    return defaultMessage;
  }

  /**
   * Try/catch wrapper for code blocks that may fail
   * Returns [result, error] tuple
   */
  async tryCatch<T>(
    fn: () => Promise<T>,
    errorCode: ErrorCode,
    errorMessage: string
  ): Promise<[T | null, ErrorDetails | null]> {
    try {
      const result = await fn();
      return [result, null];
    } catch (error) {
      const errorDetails: ErrorDetails = {
        code: errorCode,
        message: errorMessage,
        originalError: error,
      };
      return [null, errorDetails];
    }
  }
}

// Export singleton instance
export const errorHandler = new ErrorHandler();
