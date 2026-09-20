#!/usr/bin/env python3
"""w2wkit — Web2Wireframe-ის YouTube Shorts-ის ინსტრუმენტები.

წარმოშობა: `~/Desktop/Nicepage - Video/npkit.py` — იქაური ძრავა (PIL + ffmpeg pipe,
easing, სპრაიტები, SFX-ის ტაიმინგი) დამტკიცებულია ათეულობით სცენაზე. აქ იგივე API-ია,
ორი განსხვავებით:

  1. **ვერტიკალური 1080×1920** (Shorts), არა 1920×1080
  2. **W2W-ის პალიტრა** — packages/web-ის ტოკენებიდან, არა Nicepage-ის

გამოყენება:

    import sys; sys.path.insert(0, "/Users/giorgi/Desktop/Web2Wireframe/scripts/video")
    from w2wkit import *

    rec = ScreenClip("recording.mov", fit="width")      # ეკრანის ჩანაწერი

    def frame(t):
        base = new_frame()
        rec.draw(base, t, cy=960, t0=1.2)               # ჩანაწერი 1.2წმ-დან
        paste(base, TITLE, 540, 300, alpha=ease(seg(t, 0.1, 0.7)))
        draw_caption(base, "line-height: normal is not 1.2", y=1620)
        return base.convert("RGB")

    render(frame, "short_silent.mp4", dur=18.0)
    mix_sfx("short_silent.mp4", "short.mp4", [("swoosh.mp3", 0.35, 0.45)])

⚠️ `mix_sfx`-ის დრო = **პიკის** დრო, არა ფაილის დაწყება (npkit-ის ქცევა შენარჩუნებულია).
"""
import math
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

__all__ = [
    "W", "H", "FPS", "SS", "set_canvas", "SHORT", "WIDE",
    "BG", "SURFACE", "CARD", "BORDER", "MUTED", "WHITE", "INK",
    "ACCENT", "ACCENT_HI", "OK", "ERR",
    "FB", "FS", "FR", "FM", "FEB",
    "ease", "ease_out", "seg", "overshoot", "lerp",
    "new_frame", "fit_font", "text_sprite", "wrap_sprite", "card_sprite", "paste",
    "draw_caption", "ScreenClip",
    "render", "mix_sfx", "SFX", "SFX_DIR", "probe", "contact_sheet",
]

# ---------------------------------------------------------------- canvas
SHORT = (1080, 1920)            # YouTube Short / Reel — ვერტიკალური
WIDE  = (1920, 1080)            # long-form — ჰორიზონტალური

W, H, FPS = SHORT[0], SHORT[1], 30
SS = 2                          # სუპერსემპლი: ტექსტი რომ არ დაიკბინოს


def set_canvas(size):
    """კადრის ზომა. ერთი ჩანაწერიდან ორივე ფორმატი გამოდის:

        set_canvas(WIDE)   → long-form 1920×1080 (ძიებისთვის, YouTube-ზე რანჟირდება)
        set_canvas(SHORT)  → Short 1080×1920 (ტოპ-ფანელისთვის)

    ⚠️ გამოიძახე **ყველა სპრაიტის შექმნამდე** — `W`/`H` მოდულის დონეზეა და
    `new_frame`/`paste`/`draw_caption` მას კითხულობს.
    """
    global W, H
    W, H = size
    return W, H

# ---------------------------------------------------------------- პალიტრა
# წყარო: packages/web/src — `--color-*` ტოკენები. მუქი ვარიანტი ვიდეოსთვის.
BG        = (32, 31, 29)        # #201F1D — ღრმა თბილი, საიტის ტექსტის ფერი
SURFACE   = (45, 43, 43)        # #2D2B2B — neutral-900
CARD      = (45, 43, 43)
BORDER    = (68, 65, 65)        # #444141 — neutral-800
MUTED     = (155, 151, 151)     # #9B9797 — neutral-500
WHITE     = (255, 255, 255)
INK       = (32, 31, 29)        # ღია ფონზე ტექსტი
ACCENT    = (182, 130, 53)      # #B68235 — ბრენდის ბრინჯაო
ACCENT_HI = (225, 173, 102)     # #E1AD66 — accent-400, მუქზე უკეთ იკითხება
OK        = (106, 168, 79)
ERR       = (192, 70, 60)

_FD = "/Users/giorgi/Library/Fonts/"
FB  = _FD + "Poppins-Bold.ttf"
FS  = _FD + "Poppins-SemiBold.ttf"
FR  = _FD + "Poppins-Regular.ttf"
FM  = _FD + "Poppins-Medium.ttf"
FEB = _FD + "Poppins-ExtraBold.ttf"


# ---------------------------------------------------------------- easing
def ease(t):
    """easeInOutCubic — ნაგულისხმევი. linear არასდროს."""
    t = max(0.0, min(1.0, t))
    return 4 * t * t * t if t < 0.5 else 1 - pow(-2 * t + 2, 3) / 2


def ease_out(t):
    t = max(0.0, min(1.0, t))
    return 1 - pow(1 - t, 3)


def seg(t, a, b):
    """t-ს პროგრესი [a,b] შუალედში → 0..1."""
    return max(0.0, min(1.0, (t - a) / (b - a)))


def overshoot(t):
    t = max(0.0, min(1.0, t))
    return 1 - pow(2, -9 * t) * math.cos(t * 11.0)


def lerp(a, b, u):
    return a + (b - a) * u


# ---------------------------------------------------------------- სპრაიტები
def new_frame(bg=BG):
    return Image.new("RGBA", (W, H), tuple(bg) + (255,))


def fit_font(path, size, txt, maxw):
    f = ImageFont.truetype(path, size)
    while f.getbbox(txt)[2] > maxw and size > 14:
        size -= 2
        f = ImageFont.truetype(path, size)
    return f


def text_sprite(txt, path=FB, size=64, color=WHITE, pad=24):
    """ერთხაზიანი ცენტრირებული ტექსტი; ცენტრი = ასოების bbox-ის ცენტრი."""
    f = ImageFont.truetype(path, size * SS)
    bb = f.getbbox(txt)
    im = Image.new("RGBA", (bb[2] - bb[0] + 2 * pad * SS, bb[3] - bb[1] + 2 * pad * SS),
                   (0, 0, 0, 0))
    ImageDraw.Draw(im).text((pad * SS - bb[0], pad * SS - bb[1]), txt, font=f,
                            fill=tuple(color) + (255,))
    return im


def wrap_sprite(txt, path=FB, size=64, color=WHITE, maxw=900, leading=1.25, align="center"):
    """მრავალხაზიანი ტექსტი ავტომატური გადატანით. Shorts-ზე სათაურები გრძელია."""
    f = ImageFont.truetype(path, size * SS)
    limit, lines, cur = maxw * SS, [], ""
    for word in txt.split():
        trial = f"{cur} {word}".strip()
        if f.getbbox(trial)[2] <= limit or not cur:
            cur = trial
        else:
            lines.append(cur); cur = word
    if cur:
        lines.append(cur)
    lh = int(size * SS * leading)
    wpx = max(f.getbbox(l)[2] for l in lines)
    im = Image.new("RGBA", (wpx + 8 * SS, lh * len(lines) + 8 * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for i, l in enumerate(lines):
        bb = f.getbbox(l)
        x = {"center": (im.width - bb[2]) / 2, "left": 0,
             "right": im.width - bb[2]}[align]
        d.text((x, i * lh), l, font=f, fill=tuple(color) + (255,))
    return im


def card_sprite(w, h, r=24, fill=CARD, outline=BORDER, width=2):
    im = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle(
        [0, 0, w * SS - 1, h * SS - 1], r * SS,
        fill=tuple(fill) + (255,) if fill else None,
        outline=tuple(outline) + (255,) if outline else None,
        width=width * SS)
    return im


def paste(base, spr, cx, cy, scale=1.0, alpha=1.0):
    """სპრაიტს ცენტრით სვამს (cx,cy)-ზე."""
    if alpha <= 0.003 or scale <= 0.01:
        return
    tw = max(1, int(round(spr.width / SS * scale)))
    th = max(1, int(round(spr.height / SS * scale)))
    im = spr.resize((tw, th), Image.LANCZOS) if (tw, th) != (spr.width, spr.height) else spr.copy()
    if alpha < 0.999:
        im.putalpha(im.split()[3].point(lambda v: int(v * alpha)))
    base.alpha_composite(im, (int(round(cx - tw / 2)), int(round(cy - th / 2))))


def draw_caption(base, txt, y=1620, size=54, color=WHITE, maxw=940, bg=None):
    """ქვედა წარწერა. ხმა არ გვაქვს — წარწერა ატარებს მთელ მესიჯს,
    ამიტომ ის დეკორაცია არაა და ყოველთვის იკითხებადი უნდა იყოს."""
    spr = wrap_sprite(txt, FS, size, color, maxw)
    if bg:
        pad = 28
        plate = card_sprite(int(spr.width / SS) + pad * 2, int(spr.height / SS) + pad * 2,
                            r=18, fill=bg, outline=None)
        paste(base, plate, W // 2, y)
    paste(base, spr, W // 2, y)


# ---------------------------------------------------------------- ეკრანის ჩანაწერი
class ScreenClip:
    """გიორგის ეკრანის ჩანაწერი (Figma / plugin / ბრაუზერი) → ვერტიკალურ კადრში.

    კადრები ერთხელ ამოიღება ffmpeg-ით /tmp-ში, მერე ზარმაცად იტვირთება.
    `fit`:
      "width"  — სიგანეზე ჩასმა, ზემოთ/ქვემოთ ჰაერი (ნაგულისხმევი, უსაფრთხო)
      "cover"  — ვერტიკალის სრული შევსება, გვერდები იჭრება
      "crop"   — `region=(x,y,w,h)` წყაროს პიქსელებში, მერე სიგანეზე
    """

    def __init__(self, path, fit="width", region=None, scale=1.0, fps=FPS):
        self.path, self.fit, self.region, self.scale, self.fps = path, fit, region, scale, fps
        self._dir = Path(tempfile.mkdtemp(prefix="w2wclip_"))
        self._cache = {}
        vf = []
        if fit == "crop" and region:
            x, y, w, h = region
            vf.append(f"crop={w}:{h}:{x}:{y}")
        target_w = int(W * scale)
        if fit == "cover":
            vf.append(f"scale={target_w}:-2:force_original_aspect_ratio=increase")
        else:
            vf.append(f"scale={target_w}:-2")
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(path),
                        "-vf", f"fps={fps}," + ",".join(vf),
                        str(self._dir / "f%05d.png")], check=True)
        self.frames = sorted(self._dir.glob("f*.png"))
        if not self.frames:
            raise RuntimeError(f"{path} — კადრები ვერ ამოიღო")
        self.dur = len(self.frames) / fps

    def image(self, t):
        i = max(0, min(len(self.frames) - 1, int(round(t * self.fps))))
        if i not in self._cache:
            if len(self._cache) > 90:
                self._cache.clear()
            self._cache[i] = Image.open(self.frames[i]).convert("RGBA")
        return self._cache[i]

    def draw(self, base, t, cy=None, t0=0.0, alpha=1.0, zoom=1.0):
        """ჩანაწერს კადრში სვამს. `t0` — ჩანაწერის რომელი წამიდან.
        `zoom` — ნელი push; ≥1.05 იყოს, თორემ „კამერა ხელში უჭირავს" ეფექტი გამოდის."""
        im = self.image(t0 + t)
        if zoom != 1.0:
            nw, nh = int(im.width * zoom), int(im.height * zoom)
            im = im.resize((nw, nh), Image.LANCZOS)
        if alpha < 0.999:
            im = im.copy()
            im.putalpha(im.split()[3].point(lambda v: int(v * alpha)))
        cy = cy if cy is not None else H // 2
        base.alpha_composite(im, (int((W - im.width) / 2), int(cy - im.height / 2)))

    def close(self):
        shutil.rmtree(self._dir, ignore_errors=True)


# ---------------------------------------------------------------- რენდერი
def render(frame_fn, out, dur, fps=FPS, w=W, h=H, crf=17, quiet=False):
    """frame_fn(t) → PIL RGB. PNG-ები დისკზე არ რჩება."""
    n = int(round(dur * fps))
    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pixel_format", "rgb24",
         "-video_size", f"{w}x{h}", "-framerate", str(fps), "-i", "pipe:0",
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", str(crf),
         "-movflags", "+faststart", str(out)], stdin=subprocess.PIPE)
    for i in range(n):
        ff.stdin.write(frame_fn(i / fps).tobytes())
    ff.stdin.close()
    if ff.wait() != 0:
        raise RuntimeError("ffmpeg ჩავარდა")
    if not quiet:
        print(f"render → {out}  {n} კადრი / {n / fps:.2f}წმ")
    return out


# ---------------------------------------------------------------- SFX
# npkit-ის გაზომილი ბიბლიოთეკა (48 ეფექტი, RMS-ით გაზომილი თავის სიჩუმე).
SFX_DIR = "/Users/giorgi/Desktop/Video/_assets/sound-effect/"
_NPKIT = "/Users/giorgi/Desktop/Video/_tools"


def _load_sfx():
    import importlib.util
    import sys as _s
    spec = importlib.util.spec_from_file_location("_npkit", _NPKIT + "/npkit.py")
    if spec is None:
        return {}
    m = importlib.util.module_from_spec(spec)
    _s.modules["_npkit"] = m
    try:
        spec.loader.exec_module(m)
        return dict(m.SFX)
    except Exception:
        return {}


SFX = _load_sfx()


def mix_sfx(video_in, video_out, cues, dur=None, limit=0.95):
    """cues: [(ფაილი, **პიკის** დრო, ხმა 0..1), ...] — npkit-ის იდენტური ქცევა."""
    if not cues:
        raise ValueError("cues ცარიელია")
    if not SFX:
        raise RuntimeError(f"SFX ცხრილი ვერ ჩაიტვირთა — შეამოწმე {_NPKIT}/npkit.py")
    if dur is None:
        dur = float(probe(video_in, "format=duration"))

    inputs, filters, labels = ["-i", str(video_in)], [], []
    for i, (name, at, vol) in enumerate(cues, start=1):
        if name not in SFX:
            raise KeyError(f"{name} — SFX ცხრილში არაა")
        ts, te, po, _ = SFX[name]
        delay = round((at - po) * 1000)
        if delay < 0:
            raise ValueError(f"{name} @ {at}წმ — პიკამდე {po}წმ სჭირდება")
        inputs += ["-i", SFX_DIR + name]
        filters.append(f"[{i}:a]atrim={ts}:{te},asetpts=PTS-STARTPTS,"
                       f"volume={vol},adelay={delay}|{delay}[a{i}]")
        labels.append(f"[a{i}]")

    filters.append(f"{''.join(labels)}amix=inputs={len(cues)}:normalize=0:"
                   f"dropout_transition=0[mx]")
    filters.append(f"[mx]aformat=sample_fmts=fltp:sample_rates=44100:"
                   f"channel_layouts=stereo,aresample=async=1:first_pts=0,"
                   f"apad,atrim=0:{dur},alimiter=limit={limit}[aout]")

    subprocess.run(["ffmpeg", "-y", "-v", "error", *inputs,
                    "-filter_complex", ";".join(filters),
                    "-map", "0:v", "-map", "[aout]", "-c:v", "copy",
                    "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
                    "-movflags", "+faststart", "-shortest", str(video_out)], check=True)
    print(f"sfx → {video_out}  ({len(cues)} ეფექტი)")
    return video_out


def probe(path, entries="stream=width,height,r_frame_rate", stream="v:0"):
    args = ["ffprobe", "-v", "error", "-show_entries", entries, "-of", "csv=p=0", str(path)]
    if entries.startswith("stream"):
        args[3:3] = ["-select_streams", stream]
    return subprocess.run(args, capture_output=True, text=True).stdout.strip()


def contact_sheet(video, out="sheet.png", every=1.5, cols=5, tile_w=260):
    """კონტაქტ-ფურცელი — მერე Read-ით *შეხედე*. ვიდეოს ვერ ვუყურებ, ეს ერთადერთი გზაა."""
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(video),
                    "-vf", f"fps=1/{every},scale={tile_w}:-1,tile={cols}x4",
                    "-frames:v", "1", str(out)], check=True)
    print(f"sheet → {out}")
    return out
