import sys, tempfile
sys.path.insert(0, "/Users/giorgi/Desktop/Web2Wireframe/scripts/video")
from pathlib import Path
from w2wkit import *

DUR = 7.0
OUT = Path("/Users/giorgi/Desktop/Web2Wireframe/docs/growth/video/shorts/00-pipeline-test/00-pipeline-test.mp4")

HOOK  = wrap_sprite("line-height: normal is not 1.2", FB, 72, WHITE, maxw=740)
RULE  = wrap_sprite("The browser computes it from the font metrics.", FS, 44, MUTED, maxw=740)
BRAND = text_sprite("Web2Wireframe", FB, 52, WHITE)
SUBB  = text_sprite("Figma Community", FR, 34, ACCENT_HI)
CARDS = card_sprite(880, 300, r=28, fill=SURFACE, outline=BORDER)

def frame(t):
    b = new_frame()
    if t < 4.6:
        paste(b, CARDS, 540, 960, alpha=ease(seg(t, 0.0, 0.5)))
        paste(b, HOOK, 540, 900, alpha=ease(seg(t, 0.15, 0.75)),
              scale=lerp(0.94, 1.0, overshoot(seg(t, 0.15, 0.8))))
        paste(b, RULE, 540, 1055, alpha=ease(seg(t, 1.5, 2.2)))
        draw_caption(b, "Every typeface returns a different number.", y=1600, size=44)
    else:
        a = ease(seg(t, 4.6, 5.2))
        paste(b, BRAND, 540, 930, alpha=a, scale=lerp(0.96, 1.0, a))
        paste(b, SUBB, 540, 1010, alpha=ease(seg(t, 4.9, 5.5)))
    return b.convert("RGB")

TMP = Path(tempfile.gettempdir()) / "w2w_test_silent.mp4"
render(frame, TMP, dur=DUR)
mix_sfx(TMP, OUT, [("swoosh.mp3", 0.28, 0.40),
                   ("popup.mp3", 1.55, 0.45),
                   ("bell-glass-short.mp3", 4.70, 0.35)], dur=DUR + 0.05)
TMP.unlink(missing_ok=True)

print("--- ვერიფიკაცია ---")
print("video :", probe(OUT, "stream=width,height,r_frame_rate,pix_fmt"))
print("dur   :", probe(OUT, "format=duration"))
print("audio :", probe(OUT, "stream=codec_name,sample_rate,channels", "a:0"))
contact_sheet(OUT, "/tmp/w2w_sheet.png", every=0.8, cols=4, tile_w=200)
