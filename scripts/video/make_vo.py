#!/usr/bin/env python3
"""ყველა VO ხაზი ერთი მოდელის ჩატვირთვით.

say.py მოდელს ყოველ გაშვებაზე ტვირთავს (~40წმ) — 22 ხაზზე ეს 15 წუთის დანაკარგია.
აქ მოდელი ერთხელ იტვირთება.

    cd ~/Developer/chatterbox && uv run python \\
      /Users/giorgi/Desktop/Web2Wireframe/scripts/video/make_vo.py \\
      --script  .../SCRIPT.md \\
      --out     .../vo/
"""
import argparse
import re
from pathlib import Path

import torchaudio as ta
from chatterbox.tts import ChatterboxTTS

ap = argparse.ArgumentParser()
ap.add_argument("--script", type=Path, required=True, help="SCRIPT.md ცხრილით")
ap.add_argument("--out", type=Path, required=True)
ap.add_argument("--voice", type=Path, default=None, help="ხმის კლონირების ნიმუში (~5წმ)")
ap.add_argument("--device", default="mps")
ap.add_argument("--only", default=None, help="მძიმით გამოყოფილი ნომრები, მაგ. 01,02,07")
a = ap.parse_args()

# `| 01 | VO ტექსტი | კადრი |` ხაზების ამოღება
rows = []
for line in a.script.read_text().splitlines():
    m = re.match(r"^\|\s*(\d{2})\s*\|\s*(.+?)\s*\|\s*.+?\s*\|\s*$", line)
    if m:
        rows.append((m.group(1), m.group(2).strip()))
if not rows:
    raise SystemExit("SCRIPT.md-ში `| NN | ტექსტი | კადრი |` ხაზები ვერ მოიძებნა")

if a.only:
    keep = {s.strip() for s in a.only.split(",")}
    rows = [r for r in rows if r[0] in keep]

a.out.mkdir(parents=True, exist_ok=True)
print(f"{len(rows)} ხაზი → {a.out}")

model = ChatterboxTTS.from_pretrained(device=a.device)
kw = {"audio_prompt_path": str(a.voice)} if a.voice else {}

total = 0.0
for num, text in rows:
    dst = a.out / f"line-{num}.wav"
    wav = model.generate(text, **kw)
    ta.save(str(dst), wav.cpu(), model.sr)
    dur = wav.shape[-1] / model.sr
    total += dur
    print(f"  {num}  {dur:5.1f}წმ  {text[:64]}")

print(f"\nსულ {total:.1f}წმ ({total/60:.1f} წუთი)")
