"""Short 03 — „Same website. Two different files."

წყარო: production/03-test.cmproj/.../Rec 9-20-2026 2.trec  (3456×2018, 60წმ)
გაშვება:  cd ~/Developer/video-use && uv run python <ეს ფაილი>
"""
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, "/Users/giorgi/Desktop/Web2Wireframe/scripts/video")
from w2wkit import *  # noqa: F403

ROOT = Path("/Users/giorgi/Desktop/Web2Wireframe/social-agent/01) video")
SRC = ROOT / "production/03-test.cmproj/recordings/1789889174.456261/Rec 9-20-2026 2.trec"
# პარამეტრების პანელი 03-ში დახურული დარჩა — ის ერთი ბიტი 02-დან მოდის
# (იგივე პლაგინი, იგივე პოზიცია, იგივე ნაცრისფერი canvas → ჭრილობა არ ჩანს).
SRC2 = ROOT / "production/02-test.cmproj/recordings/1789888763.225826/Rec 9-20-2026 1.trec"
OUT = ROOT / "development/shorts/03-same-site"
OUT.mkdir(parents=True, exist_ok=True)
FINAL = OUT / "03-same-site.mp4"
TMP = Path(tempfile.mkdtemp(prefix="w2w_short03_"))

DUR = 24.6   # end card 3.4წმ — VO-ს ბოლო ხაზი 3.31წმ-ია

# ---------------------------------------------------------------- წყაროს ჭრა
# region = (w, h, x, y) წყაროს პიქსელებში; ყველა ვერტიკალზეა გადათვლილი.
# y≥190 — ბრაუზერის ჩანართების ზოლი (ქართული tab) კადრს გარეთ რჩება.
CUTS = {
    "hook":  (SRC,  27.0, 3.2, "1300:1760:1104:190"),  # ორივე შედეგი გვერდიგვერდ
    "url":   (SRC,   1.5, 2.4, "880:1564:2114:190"),   # URL იწერება
    "opts":  (SRC2,  7.6, 2.7, "880:1564:2114:190"),   # Fonts / Text / Assets არჩევანი
    "real":  (SRC,  30.0, 4.2, "1364:1920:1112:90"),   # ორიგინალის შედეგი
    "wire":  (SRC,  48.0, 4.0, "1364:1920:1112:90"),   # wireframe-ის შედეგი
    "layer": (SRC,  34.6, 3.0, "890:1580:112:330"),    # layer tree — სემანტიკური სახელები
    "panel": (SRC,  38.6, 2.0, "956:1700:2500:200"),   # Auto layout პანელი
}
clips = {}
for name, (src, ss, d, crop) in CUTS.items():
    part = TMP / f"{name}.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", str(ss), "-t", str(d),
                    "-i", str(src), "-vf", f"crop={crop},scale=1080:-2",
                    "-r", "30", "-an", str(part)], check=True)
    clips[name] = ScreenClip(part, fit="width")

# ---------------------------------------------------------------- სპრაიტები
CAPS = [
    (0.0,  3.0,  "Same website. Two different files."),
    (3.0,  5.2,  "Paste a link into Figma."),
    (5.2,  8.6,  "You choose what comes with it — before it imports."),
    (8.6,  12.6, "Keep the site's text, images, colors and fonts."),
    (12.6, 16.4, "Or strip it back to a clean wireframe."),
    (16.4, 19.2, "Real frames. Real layers."),
    (19.2, 21.0, "Ready to edit."),
]
CAP_SPR = {txt: wrap_sprite(txt, FS, 52, WHITE, maxw=900) for _, _, txt in CAPS}
CAP_PLATE = {
    txt: card_sprite(int(s.width / SS) + 56, int(s.height / SS) + 44,
                     r=18, fill=BG, outline=None)
    for txt, s in CAP_SPR.items()
}
END_1 = text_sprite("Web2Wireframe", FEB, 84, WHITE)
END_2 = text_sprite("Free on Figma Community", FS, 46, ACCENT_HI)

CAP_Y = 1745


def caption(base, t):
    for a, b, txt in CAPS:
        if a <= t < b:
            al = ease(seg(t, a, a + 0.35))
            paste(base, CAP_PLATE[txt], W // 2, CAP_Y, alpha=al * 0.92)
            paste(base, CAP_SPR[txt], W // 2, CAP_Y, alpha=al)
            return


# ---------------------------------------------------------------- კადრი
# (დასაწყისი, დასასრული, კლიპი, cy, zoom0, zoom1, speed)
BEATS = [
    (0.0,  3.0,  "hook",  880,  1.00, 1.06, 1.0),
    (3.0,  5.2,  "url",   960,  1.00, 1.00, 1.0),
    (5.2,  8.6,  "opts",  960,  1.00, 1.00, 0.70),   # ნელი — პანელი იკითხებოდეს
    (8.6,  12.6, "real",  900,  1.00, 1.05, 1.0),
    (12.6, 16.4, "wire",  900,  1.00, 1.05, 1.0),
    (16.4, 19.2, "layer", 960,  1.00, 1.06, 1.0),
    (19.2, 21.0, "panel", 960,  1.00, 1.00, 1.0),
]


def frame(t):
    base = new_frame()
    for a, b, name, cy, z0, z1, spd in BEATS:
        if a <= t < b:
            u = seg(t, a, b)
            clips[name].draw(base, (t - a) * spd, cy=cy,
                             alpha=ease(seg(t, a, a + 0.18)),
                             zoom=lerp(z0, z1, u))
            break
    else:
        if t >= 21.0:
            al = ease(seg(t, 21.0, 21.5))
            dy = lerp(40, 0, ease(seg(t, 21.0, 21.6)))
            paste(base, END_1, W // 2, 900 + dy, alpha=al)
            dy2 = lerp(40, 0, ease(seg(t, 21.25, 21.85)))
            paste(base, END_2, W // 2, 1010 + dy2, alpha=ease(seg(t, 21.25, 21.75)))
    caption(base, t)
    return base.convert("RGB")


SILENT = Path(tempfile.gettempdir()) / "w2w_short03_silent.mp4"
render(frame, SILENT, dur=DUR)

mix_sfx(SILENT, FINAL, [
    ("swoosh.mp3",            0.35, 0.24),
    ("click.mp3",             3.10, 0.20),
    ("swoosh-02.mp3",         5.30, 0.20),
    ("popup.mp3",             8.70, 0.26),
    ("popup.mp3",            12.70, 0.24),
    ("click.mp3",            16.50, 0.18),
    ("swoosh.mp3",           19.30, 0.20),
    ("bell-glass-short.mp3", 21.20, 0.24),
], dur=DUR + 0.05)

SILENT.unlink(missing_ok=True)
for c in clips.values():
    c.close()

print(probe(FINAL, "stream=width,height,r_frame_rate,pix_fmt"))
print(probe(FINAL, "format=duration"))
print(probe(FINAL, "stream=codec_name,sample_rate", "a:0"))
contact_sheet(FINAL, str(OUT / "sheet.png"), every=1.2)
