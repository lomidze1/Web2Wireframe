/**
 * h2d File Format Codec (encode/decode)
 *
 * Format: JSON string -> deflateRaw -> XOR each byte with 57
 * Decode: XOR each byte with 57 -> inflateRaw -> JSON.parse
 *
 * Key details:
 * - XOR key: 57 (decimal), 0x39
 * - Compression: raw deflate (NO zlib header, NO gzip header)
 *   - Node.js: zlib.deflateRawSync / zlib.inflateRawSync
 *   - NOT zlib.deflateSync/inflateSync (those add zlib header)
 *   - NOT zlib.gzipSync/gunzipSync (those add gzip header)
 *
 * Usage:
 *   node h2d-codec.js decode input.h2d output.json
 *   node h2d-codec.js encode input.json output.h2d
 */

const fs = require('fs');
const zlib = require('zlib');

const XOR_KEY = 57;

function xorBuffer(buf) {
  const result = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    result[i] = buf[i] ^ XOR_KEY;
  }
  return result;
}

function decodeH2D(h2dPath) {
  const raw = fs.readFileSync(h2dPath);
  const xored = xorBuffer(raw);
  const inflated = zlib.inflateRawSync(xored);
  return JSON.parse(inflated.toString('utf-8'));
}

function encodeH2D(jsonData) {
  const jsonStr = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData);
  const deflated = zlib.deflateRawSync(Buffer.from(jsonStr, 'utf-8'));
  return xorBuffer(deflated);
}

// CLI usage
if (require.main === module) {
  const [,, command, input, output] = process.argv;

  if (command === 'decode' && input && output) {
    const json = decodeH2D(input);
    fs.writeFileSync(output, JSON.stringify(json, null, 2));
    console.log(`Decoded: ${input} -> ${output} (${(fs.statSync(output).size / 1024).toFixed(0)} KB)`);
  } else if (command === 'encode' && input && output) {
    const json = JSON.parse(fs.readFileSync(input, 'utf-8'));
    const h2d = encodeH2D(json);
    fs.writeFileSync(output, h2d);
    console.log(`Encoded: ${input} -> ${output} (${(fs.statSync(output).size / 1024).toFixed(0)} KB)`);
  } else {
    console.log('Usage:');
    console.log('  node h2d-codec.js decode <input.h2d> <output.json>');
    console.log('  node h2d-codec.js encode <input.json> <output.h2d>');
  }
}

module.exports = { decodeH2D, encodeH2D, xorBuffer, XOR_KEY };
