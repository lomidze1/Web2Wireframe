# h2d File Format — Reverse Engineering

## Encoding Pipeline

```
JSON.stringify(data) → TextEncoder.encode() → deflate(level=6) → XOR each byte with (1337 & 0xFF = 57) → .h2d file
```

### Decode Pipeline (reverse)
```
.h2d file → XOR each byte with 57 → raw inflate → JSON.parse() → data
```

### Source Code Location
Extension: `ldnheaepmnmbjjjahokphckbpgciiaed` v0.0.191
File: `assets/src/entries/background/main.54eaa11c.js`

Key line:
```javascript
const n = Gn(new TextEncoder().encode(JSON.stringify(e))).map(a => a ^ 1337);
```

Where:
- `Gn()` = `os()` = deflate compression (level 6, raw deflate without zlib header)
- `^ 1337` = XOR obfuscation (only lower 8 bits = 57 = 0x39)

### Decode Script (Python)
```python
import zlib, json

with open('file.h2d', 'rb') as f:
    encrypted = f.read()

decrypted = bytes(b ^ 57 for b in encrypted)
result = zlib.decompress(decrypted, -15)  # raw deflate
data = json.loads(result.decode('utf-8'))
```

## Magic Bytes

- Tesla/Paul files: `d5 44 32 4a` (first 4 bytes after XOR = deflate stream)
- Apple file: `d5 a4 d4 ab` (different deflate stream start)
- No consistent magic header — varies per content

## File Sizes (Tesla example)

| Stage | Size |
|-------|------|
| .h2d (encrypted+compressed) | 2,058,846 bytes (2.0 MB) |
| Decompressed JSON | 3,517,418 bytes (3.5 MB) |
| Pretty-printed JSON | ~7 MB |
| Compression ratio | ~1.7x |

## Save Locations

h2d supports two save modes:
1. **`saveLocation: "file"`** — downloads .h2d file via `chrome.downloads.download()`
2. **`saveLocation: "gstorage"`** — uploads to Google Cloud Storage, Figma plugin fetches it

For gstorage:
1. `ru(auth, n.length)` — initiate upload, get {id, url}
2. `nu(auth, url, n)` — upload encrypted bytes
3. `iu(auth, id, metadata)` — finalize, notify Figma plugin
