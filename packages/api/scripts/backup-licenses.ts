/**
 * MongoDB licenses + webhook events backup script.
 *
 * Dumps every License and WebhookEvent document to a single timestamped
 * JSON file. Pair with cron (host or k8s CronJob) for a daily off-site
 * snapshot:
 *
 *   pnpm --filter @w2w/api backup:licenses
 *
 * Required env:
 *   MONGODB_URI — same URI the API uses (read-only role is fine)
 *
 * Optional env:
 *   BACKUP_DIR  — output directory (default ./backups)
 *
 * Exit codes:
 *   0 — file written
 *   1 — DB unreachable, write failure, or schema mismatch
 *   2 — required env missing
 *
 * Output shape:
 *   {
 *     "exportedAt": "2026-05-20T12:00:00.000Z",
 *     "counts":     { "licenses": N, "webhookEvents": M },
 *     "licenses":   [ { figmaUserId, plan, ... } ],
 *     "webhookEvents": [ { transactionId, orderId, ... } ]
 *   }
 *
 * Notes:
 *   - Audit collection (LicenseAudit) is intentionally NOT included —
 *     it's already auto-purged at 18 months and the snapshot would
 *     balloon over time. Add it here if regulatory needs demand.
 *   - Stream-based to keep memory flat even at 100k+ rows.
 */
import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { License } from "../src/models/License.js";
import { WebhookEvent } from "../src/models/WebhookEvent.js";

const MONGO_URI = process.env.MONGODB_URI;
const BACKUP_DIR =
  process.env.BACKUP_DIR ??
  join(dirname(fileURLToPath(import.meta.url)), "..", "backups");

if (!MONGO_URI) {
  console.error("[backup] MONGODB_URI is required.");
  process.exit(2);
}

async function ensureDir(path: string): Promise<void> {
  await fs.mkdir(path, { recursive: true });
}

function isoFilename(): string {
  // 2026-05-20T12-00-00 (colons replaced — fs-friendly).
  return new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
}

async function streamCollection<T extends { toObject?: () => unknown }>(
  cursor: AsyncIterable<T>,
  handle: fs.FileHandle,
  isFirst: boolean,
): Promise<{ count: number; isFirst: boolean }> {
  let count = 0;
  let firstWrite = isFirst;
  for await (const doc of cursor) {
    const plain = doc.toObject ? doc.toObject() : doc;
    const prefix = firstWrite ? "\n    " : ",\n    ";
    await handle.write(prefix + JSON.stringify(plain));
    firstWrite = false;
    count += 1;
  }
  return { count, isFirst: firstWrite };
}

async function main(): Promise<void> {
  console.log(`[backup] connecting to MongoDB…`);
  await mongoose.connect(MONGO_URI!);

  await ensureDir(BACKUP_DIR);
  const path = join(BACKUP_DIR, `w2w-licenses-${isoFilename()}.json`);
  console.log(`[backup] writing → ${path}`);

  const handle = await fs.open(path, "w");
  let licenseCount = 0;
  let webhookCount = 0;

  try {
    // Manual JSON shell so we can stream very large collections without
    // building a giant in-memory array.
    await handle.write(
      `{\n  "exportedAt": ${JSON.stringify(new Date().toISOString())},\n  "licenses": [`,
    );
    const licenseResult = await streamCollection(
      License.find().cursor(),
      handle,
      true,
    );
    licenseCount = licenseResult.count;
    await handle.write(licenseCount > 0 ? "\n  ],\n" : "],\n");

    await handle.write(`  "webhookEvents": [`);
    const webhookResult = await streamCollection(
      WebhookEvent.find().cursor(),
      handle,
      true,
    );
    webhookCount = webhookResult.count;
    await handle.write(webhookCount > 0 ? "\n  ],\n" : "],\n");

    await handle.write(
      `  "counts": { "licenses": ${licenseCount}, "webhookEvents": ${webhookCount} }\n}\n`,
    );
  } finally {
    await handle.close();
  }

  console.log(
    `[backup] ✓ done — ${licenseCount} licenses, ${webhookCount} webhook events`,
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("[backup] FAILED:", err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
