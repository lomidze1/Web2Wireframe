"""Short 03 — VO-ს ჩასმა.

ერთი ElevenLabs-ის გენერაცია (Mark - Natural Conversations, `UgBBYS2sOqTuMpoF3BR0`,
ვებ-ინტერფეისით — უფასო გეგმაზე ბიბლიოთეკის ხმა API-ით არ მუშაობს) იჭრება
პაუზებზე და თითოეული ხაზი თავის ბიტში ჯდება.

გაშვება:  cd ~/Developer/video-use && uv run python <ეს ფაილი>
"""
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, "/Users/giorgi/Desktop/Web2Wireframe/scripts/video")
from w2wkit import probe  # noqa: E402

ROOT = Path("/Users/giorgi/Desktop/Web2Wireframe/social-agent/01) video")
VIDEO = ROOT / "development/shorts/03-same-site/03-same-site.mp4"
VO = ROOT / "development/raw/videos/voice-for-01-video.mp3"
OUT = ROOT / "development/shorts/03-same-site/03-same-site-v4.mp4"

# ფრაზის კლიპები გიორგის რეცეპტით — `~/Desktop/Video/_tools/clean_voice.py`
# (`/video-cleanup-voice`). ამოსუნთქვას სპექტრული ბრტყელობით იჭერს
# (flat > 0.3, ორივე მხრიდან სიჩუმით შემოსაზღვრული), და არა ხმის დონით:
# `silencedetect`-ის ნებისმიერი ზღვარი აქ ცრუობს, რადგან ამოსუნთქვა
# -21 dB-საც აღწევს, ანუ მეტყველებაზე ხმამაღალია.
#
# ორი ნამდვილი ამოსუნთქვა: 8.30–8.48 (-21 dB) · 10.48–10.54 (-29 dB).
# დანარჩენი ჭრილები მკვდარ ჰაერს იღებს. კლიპების საზღვრები `onset`/`tail_end`-ისაა.
SENTENCE, COMMA = 14 / 30, 8 / 30   # პაუზა კადრებში — გიორგის რიტმი
LINES = [
    ([(0.100, 1.067), (1.467, 2.567)], [SENTENCE],  0.15),   # Same website. | Two different files.
    ([(3.400, 4.800)],                 [],          3.15),   # Paste a link into Figma.
    ([(5.467, 6.900), (7.367, 8.267)], [COMMA],     5.35),   # You choose… | before it imports.
    ([(9.333, 10.433), (10.667, 12.600)], [COMMA],  8.75),   # Keep the site's text… (სუნთქვა ამოღებული)
    ([(13.400, 13.833), (13.900, 16.567)], [COMMA], 12.75),  # Or | strip it back…
    ([(17.500, 18.467), (18.733, 19.667)], [SENTENCE], 16.55),  # Real frames. | Real layers.
    ([(20.200, 20.967)],               [],         19.35),   # Ready to edit.
    ([(22.133, 23.400), (23.800, 25.400)], [SENTENCE], 21.15),  # Web2Wireframe. | Free on Figma…
]

DUR = float(probe(VIDEO, "format=duration"))
parts, labels = [], []
for i, (pieces, gaps, at) in enumerate(LINES, 1):
    cursor = at
    for j, (a, b) in enumerate(pieces, 1):
        tag = f"v{i}_{j}"
        # ნაჭრის კიდეებზე 25მწმ fade — ჭრილობა რომ არ დაწკაპუნდეს
        parts.append(f"[1:a]atrim={a}:{b},asetpts=PTS-STARTPTS,"
                     f"afade=t=in:st=0:d=0.025,"
                     f"afade=t=out:st={b - a - 0.025:.3f}:d=0.025,"
                     f"adelay={round(cursor * 1000)}|{round(cursor * 1000)}[{tag}]")
        labels.append(f"[{tag}]")
        cursor += (b - a)
        if j <= len(gaps):
            cursor += gaps[j - 1]
    if cursor > DUR + 0.05:
        raise SystemExit(f"ხაზი {i} ვიდეოს სცდება: {cursor:.2f} > {DUR:.2f}")
    print(f"ხაზი {i}: {at:5.2f} → {cursor:5.2f}  ({cursor - at:.2f}წმ, {len(pieces)} კლიპი)")

parts.append(f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0:"
             f"dropout_transition=0,volume=1.35[vo]")
parts.append(f"[0:a][vo]amix=inputs=2:normalize=0:dropout_transition=0,"
             f"aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,"
             f"apad,atrim=0:{DUR},alimiter=limit=0.95[aout]")

subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(VIDEO), "-i", str(VO),
                "-filter_complex", ";".join(parts),
                "-map", "0:v", "-map", "[aout]", "-c:v", "copy",
                "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
                "-movflags", "+faststart", "-shortest", str(OUT)], check=True)

print(f"vo → {OUT}")
print(probe(OUT, "stream=width,height,r_frame_rate,pix_fmt"))
print(probe(OUT, "format=duration"))
print(probe(OUT, "stream=codec_name,sample_rate,channels", "a:0"))
