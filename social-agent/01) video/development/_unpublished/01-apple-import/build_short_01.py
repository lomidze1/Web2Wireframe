"""Short 01 — apple.com იმპორტი Figma-ში.

წყარო: social-agent/development/videos/apple.com-01.mp4 (პანელი) + -02.mp4 (შედეგი).
ორივე 1920×1080/30fps, ხმის გარეშე.

⚠️ განზრახ გამოტოვებული მონაკვეთები (ორივე ტექსტის overflow-ის დეფექტია):
   • clip02 ~0–30წმ — hero: „…on 9/9 at 10 a.m. PT" მესამე ხაზი „Add to calendar"-ს ეჯახება
   • clip02 ~50–53წმ — zoom-out: „College, sorted." ქვეტექსტი „Shop" ღილაკს ეფარება
   გამოყენებულია მხოლოდ სუფთა ზოლი: clip02 31–38წმ და 43.5–46.6წმ.
"""
import subprocess, sys, tempfile
from pathlib import Path
from PIL import Image

sys.path.insert(0, "/Users/giorgi/Desktop/Web2Wireframe/scripts/video")
from w2wkit import *

set_canvas(SHORT)

ROOT = Path.home() / "Desktop/Web2Wireframe"
SRC  = ROOT / "social-agent/development/videos"
OUT  = ROOT / "docs/growth/video/shorts/01-apple-import"
TMP  = Path(tempfile.mkdtemp(prefix="w2w_short01_"))

DUR = 32.0
HOOK_END          = 3.4
A0, A1 = 3.40, 11.00      # URL აკრეფა
B0, B1 = 11.00, 19.00     # პარამეტრები
C0, C1 = 19.00, 24.00     # შედეგი
P0, P1 = 24.00, 29.00     # layer tree
E0     = 29.00            # end card


def trim(src, ss, dur, name):
    out = TMP / name
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", str(ss), "-i", str(src),
                    "-t", str(dur), "-an", "-c:v", "libx264", "-crf", "16",
                    "-preset", "veryfast", str(out)], check=True)
    return out


c1, c2 = SRC / "apple.com-01.mp4", SRC / "apple.com-02.mp4"
panelA = ScreenClip(trim(c1, 4.00, 7.7, "pa.mp4"), fit="crop", region=(758, 100, 660, 884))
panelB = ScreenClip(trim(c1, 12.40, 8.1, "pb.mp4"), fit="crop", region=(758, 100, 660, 884))
pageC  = ScreenClip(trim(c2, 34.00, 6.1, "pc.mp4"), fit="crop", region=(548, 0, 1272, 1080))
treeP  = ScreenClip(trim(c2, 44.60, 5.2, "tp.mp4"), fit="crop", region=(70, 100, 494, 870))


def draw_clip(base, clip, t, cy, zoom=1.0, alpha=1.0):
    """ScreenClip.draw-ის ჩამნაცვლებელი — უარყოფით ოფსეტზე ჭრის, არ ვარდება."""
    im = clip.image(t)
    if zoom != 1.0:
        im = im.resize((int(im.width * zoom), int(im.height * zoom)), Image.LANCZOS)
    if alpha < 0.999:
        im = im.copy()
        im.putalpha(im.split()[3].point(lambda v: int(v * alpha)))
    x, y = int((W - im.width) / 2), int(cy - im.height / 2)
    sx, sy = max(0, -x), max(0, -y)
    ex, ey = min(im.width, W - x), min(im.height, H - y)
    if ex <= sx or ey <= sy:
        return
    base.alpha_composite(im.crop((sx, sy, ex, ey)), (max(0, x), max(0, y)))


def reveal(base, spr, cy, u, rise=44, cx=None):
    """ქვემოდან ამოსვლა — pop/scale არა (FEEDBACK 2026-08-06)."""
    if u <= 0:
        return
    e = ease(u)
    paste(base, spr, cx or W // 2, cy + (1 - e) * rise, alpha=e)


TITLE = wrap_sprite("This is not a screenshot.", FB, 88, WHITE, maxw=880)
CAP_A = wrap_sprite("Paste a URL.", FS, 54, WHITE, maxw=900)
CAP_B = wrap_sprite("You choose what lands — before the import runs.", FS, 54, WHITE, maxw=900)
CAP_C = wrap_sprite("Auto layout frames. Live text. Real assets.", FS, 54, WHITE, maxw=900)
CAP_P = wrap_sprite("Every layer is editable.", FS, 54, WHITE, maxw=900)
END_1 = wrap_sprite("Web2Wireframe", FB, 82, WHITE, maxw=900)
END_2 = wrap_sprite("Figma Community", FS, 50, WHITE, maxw=900)
RULE  = card_sprite(132, 7, r=4, fill=ACCENT_HI, outline=None)
# layer tree მთელ კადრს ავსებს — წარწერას ფირფიტა სჭირდება, თორემ ტექსტი ტექსტზე ჯდება
PLATE_P = card_sprite(int(CAP_P.width / SS) + 64, int(CAP_P.height / SS) + 40,
                      r=20, fill=SURFACE, outline=None)
CAP_Y = 1712


def frame(t):
    base = new_frame()

    if t < HOOK_END:                                   # Hook
        u = seg(t, 0, HOOK_END)
        draw_clip(base, pageC, 2.0, cy=880, alpha=0.26, zoom=lerp(1.00, 1.07, u))
        reveal(base, TITLE, 930, seg(t, 0.08, 0.80))

    elif t < A1:                                       # Proof A — URL
        u = seg(t, A0, A1)
        draw_clip(base, panelA, t - A0, cy=820, zoom=lerp(1.00, 1.06, u))
        reveal(base, CAP_A, CAP_Y, seg(t, A0 + 0.15, A0 + 0.75), rise=34)

    elif t < B1:                                       # Proof B — პარამეტრები
        u = seg(t, B0, B1)
        draw_clip(base, panelB, t - B0, cy=820, zoom=lerp(1.00, 1.06, u))
        reveal(base, CAP_B, CAP_Y, seg(t, B0 + 0.15, B0 + 0.75), rise=34)

    elif t < C1:                                       # Proof C — შედეგი
        u = seg(t, C0, C1)
        draw_clip(base, pageC, t - C0, cy=880, zoom=lerp(1.00, 1.07, u))
        reveal(base, CAP_C, CAP_Y, seg(t, C0 + 0.15, C0 + 0.75), rise=34)

    elif t < P1:                                       # Payoff — layer tree
        u = seg(t, P0, P1)
        draw_clip(base, treeP, min(t - P0, 5.0), cy=960, zoom=lerp(1.00, 1.06, u))
        up = seg(t, P0 + 0.10, P0 + 0.60)
        reveal(base, PLATE_P, CAP_Y, up, rise=34)
        reveal(base, CAP_P, CAP_Y, up, rise=34)

    else:                                              # End card — გაყინული
        reveal(base, END_1, 890, seg(t, E0 + 0.05, E0 + 0.55))
        reveal(base, RULE, 985, seg(t, E0 + 0.30, E0 + 0.75), rise=18)
        reveal(base, END_2, 1062, seg(t, E0 + 0.45, E0 + 0.95), rise=26)

    return base.convert("RGB")


SILENT = Path(tempfile.gettempdir()) / "w2w_short01_silent.mp4"
render(frame, SILENT, dur=DUR)

FINAL = OUT / "01-apple-import.mp4"
mix_sfx(SILENT, FINAL, [
    ("swoosh.mp3",           0.40, 0.32),
    ("click.mp3",            3.50, 0.30),
    ("click.mp3",           11.10, 0.30),
    ("swoosh-02.mp3",       19.10, 0.34),
    ("popup.mp3",           24.10, 0.38),
    ("bell-glass-short.mp3", 29.20, 0.34),
], dur=DUR + 0.05)

SILENT.unlink(missing_ok=True)
for c in (panelA, panelB, pageC, treeP):
    c.close()

print(probe(FINAL, "stream=width,height,r_frame_rate,pix_fmt"))
print(probe(FINAL, "format=duration"))
print(probe(FINAL, "stream=codec_name,sample_rate", "a:0"))
contact_sheet(FINAL, str(OUT / "sheet.png"), every=1.5)
