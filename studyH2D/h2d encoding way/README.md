# h2d File Format Encoding/Decoding

## Format

```
JSON string  →  deflateRaw  →  XOR 57  =  .h2d file
```

## Decode (h2d → JSON)

```
.h2d file  →  XOR 57  →  inflateRaw  →  JSON.parse
```

## Key Details

| Parameter | Value |
|-----------|-------|
| XOR key | `57` (decimal) / `0x39` (hex) |
| Compression | **deflateRaw** (NO zlib/gzip headers) |
| Node.js decompress | `zlib.inflateRawSync()` |
| Node.js compress | `zlib.deflateRawSync()` |

**WRONG methods** (these won't work):
- `zlib.inflateSync()` — expects zlib header (bytes `78 xx`)
- `zlib.gunzipSync()` — expects gzip header (bytes `1f 8b`)

## CLI Usage

```bash
# Decode
node h2d-codec.js decode input.h2d output.json

# Encode
node h2d-codec.js encode input.json output.h2d
```

## Programmatic Usage

```javascript
const { decodeH2D, encodeH2D } = require('./h2d-codec');

// Decode
const json = decodeH2D('file.h2d');

// Encode
const h2dBuffer = encodeH2D(jsonObject);
fs.writeFileSync('output.h2d', h2dBuffer);
```

## JSON Structure (top-level keys)

```
name, doc, frame, assets, fonts, url, theme, width
```

## Discovery Process

1. Memory had "JSON → deflate → XOR 57" from previous research
2. `zlib.inflateSync()` failed — "unknown compression method"
3. `zlib.inflateRawSync()` worked — deflate is headerless (raw)
4. Confirmed: XOR 57 + inflateRaw = correct decode pipeline
