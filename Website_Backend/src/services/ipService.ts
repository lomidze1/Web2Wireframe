import type { Request } from "express";

export const getClientIp = (req: Request): string => {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ||
    (req.headers["x-real-ip"] as string) ||
    req.ip ||
    "unknown"
  );
};

export const getUserAgent = (req: Request): string => {
  return req.headers["user-agent"] || "unknown";
};

export const getCurrentTimestamp = (): string => {
  return new Date().toISOString();
};

export const generateTicketId = (): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `SUPPORT-${timestamp}-${random}`;
};
