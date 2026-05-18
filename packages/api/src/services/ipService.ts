import type { Request } from "express";

// `req.ip` honors the configured `trust proxy` hop count. Reading raw
// `x-forwarded-for` / `x-real-ip` headers instead would let a client spoof
// the recorded IP (e.g. to poison support-ticket forensics).
export const getClientIp = (req: Request): string => req.ip ?? "unknown";

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
