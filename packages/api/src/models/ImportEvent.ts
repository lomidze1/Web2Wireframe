import mongoose, { Schema, type Document } from "mongoose";

/**
 * One row per import attempt across every flow that consumes the user's quota:
 * Browser Extension capture ("extension"), URL import ("url"), pasted HTML
 * ("html") and screenshot import ("screenshot"). Answers the question we
 * previously could not: "which user imported which site, with what parameters,
 * and did it succeed?"
 *
 * Why we keep it:
 *   - Activation debugging: a user who imports once and never returns probably
 *     hit a quality/extraction problem on THEIR site. With the URL recorded,
 *     the owner re-runs that exact import and reproduces the issue.
 *   - Failure surfacing: success:false + errorCode shows which sites the
 *     extractor chokes on (timeout, navigation block, ...).
 *
 * Best-effort: writes go through `logImportEvent`, which swallows errors so a
 * logging failure never breaks the import itself.
 *
 * Retention: 90 days (TTL). This is debugging telemetry, not a financial
 * record — long enough to investigate recent drop-off, short enough that the
 * collection never grows unbounded.
 */
export type ImportType = "extension" | "url" | "html" | "screenshot";

/**
 * Style parameters the import was rendered with. Populated for "url", "html"
 * and "screenshot" imports (they arrive in the request body). For "extension"
 * imports these are chosen in the Figma plugin at render time and never reach
 * the server, so they stay undefined until a future plugin beacon reports them
 * (Phase 2).
 */
export interface IImportParams {
  colorMode?: string; // "plugin" | "website"
  typographyMode?: string; // "plugin" | "website" | "lines"
  textMode?: string; // "website" | "lorem" | "semantic"
  pluginFont?: string;
}

export interface IImportEvent extends Document {
  figmaUserId: string;
  /** The imported URL. */
  sourceUrl: string;
  /** document.title when available (extension flow). */
  title?: string;
  type: ImportType;
  viewports: number[];
  params?: IImportParams;
  success: boolean;
  /** Set only on failure (e.g. TIMEOUT, NETWORK_ERROR, NAVIGATION_ERROR). */
  errorCode?: string;
  createdAt: Date;
}

const ImportEventSchema = new Schema<IImportEvent>(
  {
    // No standalone `index: true` — the compound index below
    // (figmaUserId, createdAt desc) covers single-key lookups via prefix-match.
    figmaUserId: { type: String, required: true },
    sourceUrl: { type: String, required: true },
    title: { type: String },
    type: {
      type: String,
      required: true,
      enum: ["extension", "url", "html", "screenshot"],
    },
    viewports: { type: [Number], default: [] },
    params: {
      colorMode: { type: String },
      typographyMode: { type: String },
      textMode: { type: String },
      pluginFont: { type: String },
    },
    success: { type: Boolean, required: true },
    errorCode: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Per-user history is the primary access pattern (admin lookup, activation
// investigations). Also serves the global "recent imports" feed via the
// createdAt suffix.
ImportEventSchema.index({ figmaUserId: 1, createdAt: -1 });

// 90-day TTL — debugging telemetry, not a financial record.
ImportEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const ImportEvent = mongoose.model<IImportEvent>(
  "ImportEvent",
  ImportEventSchema,
);

export interface ImportEventInput {
  figmaUserId: string;
  sourceUrl: string;
  title?: string;
  type: ImportType;
  viewports: number[];
  params?: IImportParams;
  success: boolean;
  errorCode?: string;
}

/**
 * Best-effort import-event write. Never throws — a logging failure must not
 * break the import it is recording.
 */
export async function logImportEvent(evt: ImportEventInput): Promise<void> {
  try {
    await ImportEvent.create(evt);
  } catch (e) {
    console.warn("[ImportEvent] log failed:", (e as Error).message);
  }
}

export default ImportEvent;
