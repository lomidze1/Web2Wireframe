/**
 * Import report routes — the plugin's one-click "Report this to the developer".
 *
 * POST /api/import-report                     (caller-owned via verified token)
 * POST /api/import-report/:reportId/message   (optional follow-up note)
 *
 * No database: each report is an email to the support inbox with Reply-To set
 * to the user's Figma email (backfilled onto the License by the OAuth
 * callback), so answering "fixed!" is one click. Only URL and Browser
 * Extension imports are accepted — they carry a real URL the owner can
 * re-import; HTML-paste and screenshot imports leave nothing to reproduce.
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { authenticatePlugin } from "../../middleware/auth.js";
import { importReportRateLimiter } from "../../middleware/rateLimit.js";
import { License } from "../../models/License.js";
import { mongoConnected } from "../../state.js";
import {
  sendImportReportEmail,
  sendImportReportFollowUp,
} from "../../services/emailService.js";

const router = Router();

/** Must match WarningCategory in the Figma plugin (types/index.ts). */
const CATEGORIES = ["fatal", "typography", "image", "svg", "layout", "other"] as const;

const reportSchema = z.object({
  sourceUrl: z
    .string()
    .trim()
    .max(2048)
    .url()
    .refine((u) => /^https?:\/\//i.test(u), { message: "http(s) URLs only" }),
  kind: z.enum(["url", "extension"]),
  viewports: z.array(z.number().int().positive().max(10_000)).max(10).default([]),
  issues: z
    .array(
      z.object({
        category: z.enum(CATEGORIES),
        message: z.string().trim().min(1).max(300),
        count: z.number().int().positive().max(100_000),
      }),
    )
    .min(1)
    .max(50),
  overflow: z.number().int().min(0).max(100_000).default(0),
});

const messageSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

/** Ids this router issues — the follow-up route accepts nothing else. */
const REPORT_ID = /^REPORT-[A-Z0-9]+-[A-Z0-9]+$/;

function newReportId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 8).padEnd(6, "0").toUpperCase();
  return `REPORT-${timestamp}-${random}`;
}

/**
 * The caller's reply address. Read directly rather than through
 * licenseService.getOrCreate, which creates and resets licenses as a side
 * effect. `""` is a legacy "missing" value (see setEmailIfMissing).
 */
async function findReplyEmail(figmaUserId: string): Promise<string | null> {
  if (!mongoConnected) return null;
  try {
    const doc = await License.findOne({ figmaUserId }, { email: 1 }).lean();
    return doc?.email || null;
  } catch (err) {
    console.warn("[ImportReport] email lookup failed:", (err as Error).message);
    return null;
  }
}

router.post(
  "/import-report",
  authenticatePlugin,
  importReportRateLimiter,
  async (req: Request, res: Response) => {
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: "invalid_report" });
      return;
    }

    // Identity from the verified token only — a body field could name anyone.
    const figmaUserId = req.userId!;
    const reportId = newReportId();
    const result = await sendImportReportEmail({
      reportId,
      figmaUserId,
      email: await findReplyEmail(figmaUserId),
      ...parsed.data,
    });

    // The plugin says "Thanks — we read every report" on success; claiming
    // that for a report that never reached the inbox would be a lie.
    if (!result.ok) {
      res.status(502).json({ success: false, error: "send_failed" });
      return;
    }
    res.json({ success: true, reportId });
  },
);

router.post(
  "/import-report/:reportId/message",
  authenticatePlugin,
  importReportRateLimiter,
  async (req: Request, res: Response) => {
    const { reportId } = req.params;
    const parsed = messageSchema.safeParse(req.body);
    if (!REPORT_ID.test(reportId) || !parsed.success) {
      res.status(400).json({ success: false, error: "invalid_message" });
      return;
    }

    const figmaUserId = req.userId!;
    const result = await sendImportReportFollowUp({
      reportId,
      figmaUserId,
      email: await findReplyEmail(figmaUserId),
      message: parsed.data.message,
    });
    if (!result.ok) {
      res.status(502).json({ success: false, error: "send_failed" });
      return;
    }
    res.json({ success: true });
  },
);

export default router;
