import type { Request, Response, NextFunction } from "express";

export interface ApiError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export class AppError extends Error implements ApiError {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errorHandler = (
  err: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal server error";
  const isDev = process.env.NODE_ENV === "development";

  console.error(`[${new Date().toISOString()}] Error: ${message}`, err.stack);

  // 5xx messages can carry internal detail (DB errors, library internals,
  // file paths). Outside development, return a generic string; 4xx messages
  // are intentional/operational and safe to surface.
  const clientMessage =
    statusCode >= 500 && !isDev ? "Internal server error" : message;

  res.status(statusCode).json({
    success: false,
    error: clientMessage,
    ...(isDev && { stack: err.stack }),
  });
};

export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
