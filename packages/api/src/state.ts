// Shared mutable state for Plugin_Backend
// Extracted to avoid circular dependencies between index.ts and route modules.

export let mongoConnected = false;

export function setMongoConnected(value: boolean): void {
  mongoConnected = value;
}

export interface PendingImportEntry {
  data: Record<string, unknown>;
  timestamp: number;
  expires: number;
}

export const pendingCDPImports = new Map<string, PendingImportEntry>();
