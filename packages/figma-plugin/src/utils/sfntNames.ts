/**
 * Read a font's REAL family name out of its SFNT `name` table.
 *
 * A font carries two identities: the family a stylesheet DECLARES
 * (`@font-face { font-family: "glyphs" }`) and the family its `name` table
 * stamps — which is the only one macOS Font Book, Windows and Figma ever see
 * after install (telex.ge's "glyphs" installs as "icomoon"). The plugin needs
 * the second one to look a font up.
 *
 * The API already extracts it server-side and ships `realFamily` on every
 * URL/HTML import. The browser extension does not: a `.w2w` file carries the
 * font BYTES but no real name. Reading the table here closes that gap for
 * every import path, and doubles as a safety net when the server couldn't
 * parse a face.
 */

import { convertEotToSfnt, isEot } from "./eotToSfnt";
import { convertWoffToSfnt, isWoff } from "./woffToSfnt";

export interface SfntNames {
  family?: string;
  subfamily?: string;
}

/** Name IDs, preferred first. 16/17 are the TYPOGRAPHIC pair: variable-font
 *  static instances put the real family there and a legacy default-instance
 *  name in 1/2 ("Space Grotesk Light" / "SemiBold"). */
const FAMILY_NAME_IDS = [16, 1];
const SUBFAMILY_NAME_IDS = [17, 2];

/**
 * Some foundries stamp "." or another single character as an anti-piracy
 * marker. Using it verbatim yields hidden-file names like `.-Regular.ttf` and
 * a family no lookup can match — same gate the API applies.
 */
function isUsableFontName(name: string | undefined): name is string {
  if (!name) return false;
  const trimmed = name.trim();
  return trimmed.length >= 2 && /[a-z]/i.test(trimmed);
}

/** Unwrap WOFF v1 / EOT to raw SFNT. WOFF2 needs Brotli, which the sandbox
 *  has no decoder for — those simply yield no name. */
function toSfnt(bytes: Uint8Array): Uint8Array | null {
  if (isWoff(bytes)) return convertWoffToSfnt(bytes)?.bytes ?? null;
  if (isEot(bytes)) return convertEotToSfnt(bytes)?.bytes ?? null;
  if (bytes.length < 12) return null;
  const flavor = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  const isSfnt =
    flavor === 0x00010000 || // TrueType outlines
    flavor === 0x4f54544f || // 'OTTO' — CFF outlines
    flavor === 0x74727565 || // 'true' — legacy Mac TrueType
    flavor === 0x74746366; // 'ttcf' — collection; header shares the layout
  return isSfnt ? bytes : null;
}

/** Decode a name record's bytes. Windows records are UTF-16BE; Mac records are
 *  single-byte. Anything non-ASCII in a Mac record is beyond what a family name
 *  needs here. */
function decodeNameString(
  view: DataView,
  offset: number,
  length: number,
  platformId: number,
): string {
  let out = "";
  if (platformId === 3 || platformId === 0) {
    for (let i = 0; i + 1 < length; i += 2) {
      out += String.fromCharCode(view.getUint16(offset + i));
    }
  } else {
    for (let i = 0; i < length; i++) {
      out += String.fromCharCode(view.getUint8(offset + i));
    }
  }
  return out.trim();
}

/**
 * Extract `{ family, subfamily }` from a font binary. Returns an empty object
 * for bytes that can't be parsed (WOFF2, truncated files, non-font data) —
 * never throws, because it runs over whatever a capture happened to cache.
 */
export function readSfntNames(bytes: Uint8Array): SfntNames {
  try {
    const sfnt = toSfnt(bytes);
    if (!sfnt) return {};

    const view = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
    const numTables = view.getUint16(4);

    let nameOffset = -1;
    let nameLength = 0;
    for (let i = 0; i < numTables; i++) {
      const entry = 12 + i * 16;
      if (entry + 16 > sfnt.byteLength) return {};
      const tag = String.fromCharCode(
        view.getUint8(entry),
        view.getUint8(entry + 1),
        view.getUint8(entry + 2),
        view.getUint8(entry + 3),
      );
      if (tag === "name") {
        nameOffset = view.getUint32(entry + 8);
        nameLength = view.getUint32(entry + 12);
        break;
      }
    }
    if (nameOffset < 0 || nameOffset + 6 > sfnt.byteLength) return {};

    const count = view.getUint16(nameOffset + 2);
    const stringBase = nameOffset + view.getUint16(nameOffset + 4);

    // nameId → candidate strings, best platform first. Windows (3) records are
    // the modern norm; Mac (1) is the fallback for older files.
    const byNameId = new Map<number, string>();
    for (let i = 0; i < count; i++) {
      const rec = nameOffset + 6 + i * 12;
      if (rec + 12 > nameOffset + nameLength || rec + 12 > sfnt.byteLength) break;
      const platformId = view.getUint16(rec);
      const nameId = view.getUint16(rec + 6);
      if (!FAMILY_NAME_IDS.includes(nameId) && !SUBFAMILY_NAME_IDS.includes(nameId)) {
        continue;
      }
      const length = view.getUint16(rec + 8);
      const offset = stringBase + view.getUint16(rec + 10);
      if (offset + length > sfnt.byteLength) continue;
      const value = decodeNameString(view, offset, length, platformId);
      if (!value) continue;
      // First writer wins per (nameId, platform-preference): a Windows record
      // seen later must not lose to a Mac one, so only overwrite when the
      // existing entry came from a lesser platform.
      if (!byNameId.has(nameId) || platformId === 3) byNameId.set(nameId, value);
    }

    const pick = (ids: number[]): string | undefined => {
      for (const id of ids) {
        const value = byNameId.get(id);
        if (isUsableFontName(value)) return value.trim();
      }
      return undefined;
    };

    const names: SfntNames = {};
    const family = pick(FAMILY_NAME_IDS);
    const subfamily = pick(SUBFAMILY_NAME_IDS);
    if (family) names.family = family;
    if (subfamily) names.subfamily = subfamily;
    return names;
  } catch {
    // Malformed font data — the caller keeps the CSS-declared name.
    return {};
  }
}
