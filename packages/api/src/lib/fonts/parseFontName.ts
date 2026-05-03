/**
 * SFNT `name` table parser.
 *
 * Pulls family / subfamily / fullName out of a TTF or OTF buffer so we can
 * use the **real** font name (e.g. `PPFragment Glare`) instead of the
 * CSS-declared alias (`PS1`) in:
 *   - the ZIP filename the user sees
 *   - the `w2w_original_font` plugin-data marker the rebind action reads
 *
 * Spec reference: OpenType "name" table —
 * https://learn.microsoft.com/en-us/typography/opentype/spec/name
 *
 * The parser is deliberately conservative: any malformed offset or
 * out-of-range read returns an empty result instead of throwing. The
 * pipeline degrades gracefully (CSS-name fallback) when this happens.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FontNames {
  /** Typographic Family (NameID 16) preferred, else Family (NameID 1). */
  family?: string;
  /** Typographic Subfamily (NameID 17) preferred, else Subfamily (NameID 2). */
  subfamily?: string;
  /** Full font name (NameID 4). */
  fullName?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Valid sfntVersion values: 0x00010000 = TrueType, 'OTTO' = CFF/OpenType. */
const SFNT_TTF = 0x00010000;
const SFNT_OTF = 0x4f54544f; // "OTTO"

const NAME_TAG = 0x6e616d65; // "name"

/** NameID values defined by the OpenType spec. */
const NAME_FAMILY = 1;
const NAME_SUBFAMILY = 2;
const NAME_FULL = 4;
const NAME_TYPO_FAMILY = 16;
const NAME_TYPO_SUBFAMILY = 17;

/** Platform identifiers we know how to decode. PlatformID=1 (Mac Roman) is
 *  intentionally excluded — it's rare on web fonts and the platform=3 record
 *  always exists alongside it for any modern font. */
const PLATFORM_UNICODE = 0;
const PLATFORM_MICROSOFT = 3;

/** Microsoft language ID for English (United States) — what we prefer. */
const LANG_EN_US = 0x0409;
/** Unicode platform language IDs are 0 (per spec; some files use 0x0409 too). */
const LANG_UNICODE_DEFAULT = 0;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract family / subfamily / fullName from an SFNT (TTF or OTF) buffer.
 *
 * Returns `{}` when the buffer isn't a recognisable SFNT or the name table
 * is missing / malformed. Never throws.
 */
export function parseFontNames(buffer: Buffer): FontNames {
  // -- Offset table is 12 bytes; need that plus at least one directory
  // entry (16) to do anything useful.
  if (buffer.length < 12 + 16) return {};

  const sfntVersion = buffer.readUInt32BE(0);
  if (sfntVersion !== SFNT_TTF && sfntVersion !== SFNT_OTF) return {};

  const numTables = buffer.readUInt16BE(4);
  // Directory starts at byte 12; each entry is 16 bytes.
  if (buffer.length < 12 + numTables * 16) return {};

  // -- Find the 'name' table directory entry.
  let nameTableOffset = -1;
  let nameTableLength = 0;
  for (let i = 0; i < numTables; i++) {
    const entryStart = 12 + i * 16;
    const tag = buffer.readUInt32BE(entryStart);
    if (tag === NAME_TAG) {
      nameTableOffset = buffer.readUInt32BE(entryStart + 8);
      nameTableLength = buffer.readUInt32BE(entryStart + 12);
      break;
    }
  }
  if (nameTableOffset < 0) return {};
  if (nameTableOffset + nameTableLength > buffer.length) return {};
  if (nameTableLength < 6) return {};

  // -- Name table header: format(2) + count(2) + stringOffset(2)
  const nameFormat = buffer.readUInt16BE(nameTableOffset);
  const recordCount = buffer.readUInt16BE(nameTableOffset + 2);
  const stringOffsetWithinTable = buffer.readUInt16BE(nameTableOffset + 4);

  // We support format 0 (the common case). Format 1 adds language tag
  // records but the regular records still parse identically — so we don't
  // bail on it.
  if (nameFormat !== 0 && nameFormat !== 1) {
    // Defensive: unfamiliar format → bail rather than misread.
    return {};
  }

  const recordsStart = nameTableOffset + 6;
  const stringHeapStart = nameTableOffset + stringOffsetWithinTable;

  // For each NameID we care about, track the best candidate seen so far
  // alongside a "preference score" — higher beats lower.
  type Candidate = { score: number; text: string };
  const best: Record<number, Candidate | undefined> = {};

  for (let i = 0; i < recordCount; i++) {
    const recordStart = recordsStart + i * 12;
    if (recordStart + 12 > nameTableOffset + nameTableLength) break;

    const platformID = buffer.readUInt16BE(recordStart);
    const encodingID = buffer.readUInt16BE(recordStart + 2);
    const languageID = buffer.readUInt16BE(recordStart + 4);
    const nameID = buffer.readUInt16BE(recordStart + 6);
    const length = buffer.readUInt16BE(recordStart + 8);
    const offset = buffer.readUInt16BE(recordStart + 10);

    // Filter to NameIDs we'll resolve later; saves work + heap reads.
    if (
      nameID !== NAME_FAMILY &&
      nameID !== NAME_SUBFAMILY &&
      nameID !== NAME_FULL &&
      nameID !== NAME_TYPO_FAMILY &&
      nameID !== NAME_TYPO_SUBFAMILY
    ) {
      continue;
    }

    const score = scoreCandidate(platformID, encodingID, languageID);
    if (score < 0) continue; // unsupported encoding

    const stringStart = stringHeapStart + offset;
    if (stringStart + length > buffer.length) continue; // truncated → skip
    if (stringStart + length > nameTableOffset + nameTableLength) continue;

    const slice = buffer.subarray(stringStart, stringStart + length);
    const decoded = decodeString(slice, platformID, encodingID);
    if (!decoded) continue;

    const current = best[nameID];
    if (!current || score > current.score) {
      best[nameID] = { score, text: decoded };
    }
  }

  // -- Resolve with priority: typographic (16/17) wins, fall back to legacy (1/2).
  const family = best[NAME_TYPO_FAMILY]?.text ?? best[NAME_FAMILY]?.text;
  const subfamily = best[NAME_TYPO_SUBFAMILY]?.text ?? best[NAME_SUBFAMILY]?.text;
  const fullName = best[NAME_FULL]?.text;

  const out: FontNames = {};
  if (family) out.family = family;
  if (subfamily) out.subfamily = subfamily;
  if (fullName) out.fullName = fullName;
  return out;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Score a (platformID, encodingID, languageID) tuple for preference. Higher
 * is better. Returns `-1` for tuples we don't decode.
 *
 * Heuristic:
 *   +10 — Microsoft Unicode BMP (3, 1) — what 99% of web fonts use
 *    +9 — Microsoft Unicode UCS-4 (3, 10) — variable fonts sometimes use this
 *    +5 — Unicode platform (0, anything) — older but valid
 *  bonus +2 if language is English (en-US for Microsoft, default 0 for Unicode)
 */
function scoreCandidate(platformID: number, encodingID: number, languageID: number): number {
  let base: number;
  let preferredLang: number;
  if (platformID === PLATFORM_MICROSOFT) {
    if (encodingID === 1) base = 10;
    else if (encodingID === 10) base = 9;
    else return -1;
    preferredLang = LANG_EN_US;
  } else if (platformID === PLATFORM_UNICODE) {
    base = 5;
    preferredLang = LANG_UNICODE_DEFAULT;
  } else {
    return -1; // PlatformID 1 (Mac Roman) and others — skip
  }
  const langBonus = languageID === preferredLang ? 2 : 0;
  return base + langBonus;
}

/**
 * Decode the raw bytes for a name record. Microsoft and Unicode platforms
 * always store strings as UTF-16BE. (We don't reach this for Mac Roman —
 * `scoreCandidate` already filters it out.)
 */
function decodeString(slice: Buffer, _platformID: number, _encodingID: number): string | null {
  // UTF-16BE: pairs of bytes, big-endian. Length must be even.
  if (slice.length % 2 !== 0) return null;
  const codeUnits: number[] = [];
  for (let i = 0; i < slice.length; i += 2) {
    codeUnits.push(slice.readUInt16BE(i));
  }
  // Strip trailing NULs that some fonts emit defensively.
  while (codeUnits.length > 0 && codeUnits[codeUnits.length - 1] === 0) {
    codeUnits.pop();
  }
  if (codeUnits.length === 0) return null;
  return String.fromCharCode(...codeUnits);
}
