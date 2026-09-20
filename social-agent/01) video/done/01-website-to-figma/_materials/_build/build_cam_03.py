#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build_cam_03.py — W2W Short 03 „Same website. Two different files." Camtasia-ში.

გიორგის წესი (2026-09-20): **W2W-ის Short-იც Camtasia-ში იწყობა, ffmpeg-ით არა** —
ისე, როგორც Nicepage-ში. ffmpeg-ის ძველი ვერსია (`build_short_03.py` + `add_voice.py`)
რჩება შესადარებლად, მაგრამ ჩასაბარებელი პროექტი ესაა.

კანვასი 1080×1920 · 30fps. წყარო — გიორგის ორი `.trec`:
  03-test  — ყველა ბიტი (იმპორტი, შედეგები, layer tree, Auto layout პანელი)
  02-test  — მხოლოდ პარამეტრების პანელი (03-ში „More Options" დახურული დარჩა)

ხმა — ერთი ElevenLabs-ის გენერაცია (Mark - Natural Conversations, UgBBYS2sOqTuMpoF3BR0),
დაჭრილი `/video-cleanup-voice`-ის რეცეპტით: 14 ფრაზის კლიპი, 2 ამოსუნთქვა ამოღებული,
პაუზები comma 8 / sentence 14 კადრი.

გაშვება:  cd ~/Developer/video-use && uv run python <ეს ფაილი>
"""
import json
import os
import shutil
import sys
from pathlib import Path

sys.path.insert(0, "/Users/giorgi/Desktop/Video/_tools")
from camkit import Proj, rgb, WHITE, tick  # noqa: E402
from PIL import ImageFont  # noqa: E402

ROOT = Path("/Users/giorgi/Desktop/Web2Wireframe/social-agent/01) video")
HERE = ROOT / "development/shorts/03-same-site"
PROJ = HERE / "03-same-site.cmproj"
BASE = ROOT / "production/03-test.cmproj/project.tscproj"   # მხოლოდ ჩონჩხისთვის

TREC03 = ROOT / "production/03-test.cmproj/recordings/1789889174.456261/Rec 9-20-2026 2.trec"
TREC02 = ROOT / "production/02-test.cmproj/recordings/1789888763.225826/Rec 9-20-2026 1.trec"
VO = ROOT / "development/raw/videos/voice-for-01-video.mp3"
SFXD = Path("/Users/giorgi/Desktop/Video/_assets/sound-effect")

CW, CH = 1080, 1920                  # ვერტიკალური კანვასი
SW, SH = 3456, 2018                  # ორივე ჩანაწერის წყაროს ზომა
DUR = 24.6
BGC = rgb(32, 31, 29)                # #201F1D — w2wkit-ის ფონი, ერთი ენა ორივე ვერსიაში
ACCENT_HI = rgb(225, 173, 102)

FS_PATH = "/Users/giorgi/Library/Fonts/Poppins-SemiBold.ttf"


# ── ჩონჩხი ────────────────────────────────────────────────────────────────
def skeleton():
    """ცარიელი 1080×1920 პროექტი. Camtasia-ს ნამდვილი JSON-იდან ვიღებ ჩონჩხს,
    რომ ვერსიის/ფორმატის ველები ზუსტად მისი იყოს — ხელით აწყობილს მუნჯად აგდებს.

    🚫 გიორგის დახვეწის შემდეგ ეს აღარ გაეშვება — იხილე ქვემოთ."""
    if PROJ.exists():
        shutil.rmtree(PROJ)
    (PROJ / "media").mkdir(parents=True)
    d = json.load(open(BASE))
    d["title"] = "W2W Short 03 — Same website. Two different files."
    d["width"], d["height"] = float(CW), float(CH)
    d["sourceBin"] = []
    sc = d["timeline"]["sceneTrack"]["scenes"][0]["csml"]
    sc["tracks"] = [{"trackIndex": 0, "medias": [], "parameters": {}}]
    d["timeline"]["trackAttributes"] = [
        {"ident": "", "audioMuted": False, "videoHidden": False, "magnetic": False,
         "matte": 0, "solo": False, "metadata": {"IsLocked": "False", "trackHeight": "54"}}]
    json.dump(d, open(PROJ / "project.tscproj", "w"), indent=2)


# ══════════════════════════════════════════════════════════════════════════
# 🚫 ხელახლა ნუ გაუშვებ — გიორგიმ პროექტი დახვეწა 2026-09-20 13:14-ზე.
#    ხელახალი აწყობა წაშლის: gradient-ის ფონს, გაყინულ hook-ის კადრს,
#    ამოჭრილ „Or"-ს, გასწორებულ მასშტაბებს, ორ გადასვლას და SFX-ის ახალ დროებს.
#    ახალი ცვლილება = **პატჩი** `03-same-site.cmproj`-ზე, არა rebuild.
#    ეს ფაილი რჩება როგორც ხერხების წყარო (კადრირება, VO-ს კლიპები, SFX).
#    ტესტისთვის: OUT=<scratchpad>/x.cmproj
# ══════════════════════════════════════════════════════════════════════════
if os.environ.get("OUT"):
    PROJ = Path(os.environ["OUT"])
else:
    raise SystemExit(
        "🚫 03-same-site.cmproj გიორგიმ დახვეწა — ხელახლა ნუ ააწყობ, პატჩი დაწერე.\n"
        "   ტესტისთვის: OUT=<scratchpad>/x.cmproj")

skeleton()
P = Proj(PROJ)

src03 = P.add_media(TREC03, "rec-03")
src02 = P.add_media(TREC02, "rec-02")
vo = P.add_media(VO, "voice")
sfx = {n: P.add_media(SFXD / n, n) for n in
       ("swoosh.mp3", "swoosh-02.mp3", "click.mp3", "popup.mp3", "bell-glass-short.mp3")}

t_voice = P.add_track("voice")
t_sfx = P.add_track("sfx")
t_screen = P.add_track("screen")
t_plate = P.add_track("caption plate")
t_caption = P.add_track("captions")
t_end1 = P.add_track("end card")
t_end2 = P.add_track("end card sub")


# ── ეკრანის ბიტები ────────────────────────────────────────────────────────
def region(x, y, w, h):
    """წყაროს მართკუთხედი → (crop, scale, dx, dy).

    ⚠️ Camtasia-ს `geometryCrop` კიდეებს ჭრის, მაგრამ **ნაჭერს ადგილზე ტოვებს** —
    გასწორება მედიის ძველ ცენტრზე რჩება, არა ამონაჭრისაზე. ამიტომ ყოველ ამონაჭერს
    ცენტრი ხელით უნდა დაუბრუნო `translation`-ით, თორემ კანვასის გარეთ გავა
    (გიორგი, 2026-09-20 — პირველი Camtasia-ს ვერსია სწორედ ასე გავიდა).

    dx/dy — ამონაჭრის ცენტრის ოფსეტი წყაროს ცენტრიდან, წყაროს პიქსელებში.
    translation0 = -dx·scale (დადებითი = მარჯვნივ) · translation1 = +dy·scale (დადებითი = ზევით).
    """
    return ((x, y, SW - x - w, SH - y - h), CW / w,
            (x + w / 2) - SW / 2, (y + h / 2) - SH / 2)


R_HOOK = region(1104, 190, 1300, 1760)   # ორივე შედეგი გვერდიგვერდ
R_PLUG = region(2114, 190, 880, 1564)    # პლაგინის ფანჯარა
R_CANV = region(1112, 90, 1364, 1920)    # canvas — შედეგი სრული სიმაღლით
R_LAYER = region(112, 330, 890, 1580)    # layer tree
R_PANEL = region(2500, 200, 956, 1700)   # Auto layout პანელი

# (დასაწყისი, ხანგრძლივობა, წყარო, წყაროში შესვლა, region, ზუმი(საიდან,სადამდე), სახელი)
BEATS = [
    (0.0,  3.0, src03, 27.00, R_HOOK,  (1.00, 1.06), "hook — ორივე ფაილი"),
    (3.0,  2.2, src03,  1.50, R_PLUG,  None,         "URL"),
    (5.2,  2.8, src02,  7.55, R_PLUG,  None,         "პარამეტრები (02-დან)"),
    (8.0,  4.6, src03, 30.00, R_CANV,  (1.00, 1.05), "ორიგინალის შედეგი"),
    (12.6, 3.8, src03, 48.00, R_CANV,  (1.00, 1.05), "wireframe-ის შედეგი"),
    (16.4, 2.8, src03, 34.60, R_LAYER, (1.00, 1.06), "layer tree"),
    (19.2, 1.8, src03, 38.60, R_PANEL, None,         "Auto layout"),
]

for start, dur, src, mstart, (crop, scale, dx, dy), zoom, name in BEATS:
    tx, ty = -dx * scale, dy * scale          # ამონაჭრის ცენტრი → კანვასის ცენტრი
    m = P.video(t_screen, src, start, dur, mstart=mstart, x=tx, y=ty,
                crop=crop, scale=scale, fade=0.18, ident=name)
    if zoom:                                  # ნატიური Animation — გიორგი თაგვით წელავს
        z0, z1 = zoom
        # ზუმი მედიის ცენტრის გარშემოა, ე.ი. ოფსეტიც იმავე კოეფიციენტით იზრდება —
        # translation-იც უნდა გაიწელოს, თორემ ამონაჭერი ზუმის დროს გვერდზე გაცურდება.
        P.anim(m, 0.0, dur, scale0=(scale * z0, scale * z1), scale1=(scale * z0, scale * z1),
               translation0=(tx * z0, tx * z1), translation1=(ty * z0, ty * z1))


# ── წარწერები ─────────────────────────────────────────────────────────────
CAPS = [
    (0.0,  3.0,  "Same website. Two different files."),
    (3.0,  5.2,  "Paste a link into Figma."),
    (5.2,  8.6,  "You choose what comes with it — before it imports."),
    (8.6,  12.6, "Keep the site's text, images, colors and fonts."),
    (12.6, 16.4, "Or strip it back to a clean wireframe."),
    (16.4, 19.2, "Real frames. Real layers."),
    (19.2, 21.0, "Ready to edit."),
]
CAP_SIZE, CAP_MAXW = 52, 900
CAP_Y = 1745                                   # კანვასის კოორდინატი (ზემოდან)
_font = ImageFont.truetype(FS_PATH, CAP_SIZE)


def wrap(txt, maxw):
    lines, cur = [], ""
    for w in txt.split():
        t = (cur + " " + w).strip()
        if _font.getlength(t) <= maxw or not cur:
            cur = t
        else:
            lines.append(cur); cur = w
    lines.append(cur)
    return lines


for a, b, txt in CAPS:
    lines = wrap(txt, CAP_MAXW)
    tw = max(_font.getlength(l) for l in lines)
    th = int(CAP_SIZE * 1.25 * len(lines))
    # ფირფიტა ტექსტს ეხვევა — w2wkit-ის ვერსიის იერი
    P.rect(t_plate, a, b - a, x=0, y=(CH / 2 - CAP_Y),
           w=int(tw) + 56, h=th + 44, radius=18,
           fill=BGC, fill_opacity=0.92, stroke_width=0.0, fade=0.25)
    P.text(t_caption, "\n".join(lines), a, b - a, x=0, y=(CH / 2 - CAP_Y),
           size=CAP_SIZE, color=WHITE, weight="SemiBold",
           w=int(tw) + 40, h=th + 20, align="center", fade=0.25)

# end card
P.text(t_end1, "Web2Wireframe", 21.0, DUR - 21.0, x=0, y=(CH / 2 - 900),
       size=84, color=WHITE, weight="ExtraBold", w=900, h=140, fade=0.35)
P.text(t_end2, "Free on Figma Community", 21.25, DUR - 21.25, x=0, y=(CH / 2 - 1010),
       size=46, color=ACCENT_HI, weight="SemiBold", w=900, h=100, fade=0.35)


# ── ხმა ───────────────────────────────────────────────────────────────────
SENTENCE, COMMA = 14 / 30, 8 / 30
LINES = [
    ([(0.100, 1.067), (1.467, 2.567)],      [SENTENCE],  0.15),
    ([(3.400, 4.800)],                      [],          3.15),
    ([(5.467, 6.900), (7.367, 8.267)],      [COMMA],     5.35),
    ([(9.333, 10.433), (10.667, 12.600)],   [COMMA],     8.75),
    ([(13.400, 13.833), (13.900, 16.567)],  [COMMA],    12.75),
    ([(17.500, 18.467), (18.733, 19.667)],  [SENTENCE], 16.55),
    ([(20.200, 20.967)],                    [],         19.35),
    ([(22.133, 23.400), (23.800, 25.400)],  [SENTENCE], 21.15),
]
for i, (pieces, gaps, at) in enumerate(LINES, 1):
    cursor = at
    for j, (a, b) in enumerate(pieces, 1):
        P.audio(t_voice, vo, cursor, b - a, mstart=a, gain=1.35, ident=f"vo-{i}.{j}")
        cursor += (b - a)
        if j <= len(gaps):
            cursor += gaps[j - 1]
    if cursor > DUR + 0.05:
        raise SystemExit(f"ხაზი {i} სცდება: {cursor:.2f} > {DUR:.2f}")

# SFX — პიკის დრო, არა ფაილის დასაწყისი: ყველას თავში სიჩუმე აქვს (sfx-index.md)
SFX_CUES = [("swoosh.mp3", 0.35, 0.24), ("click.mp3", 3.10, 0.20),
            ("swoosh-02.mp3", 5.30, 0.20), ("popup.mp3", 8.05, 0.26),
            ("popup.mp3", 12.65, 0.24), ("click.mp3", 16.45, 0.18),
            ("swoosh.mp3", 19.25, 0.20), ("bell-glass-short.mp3", 21.20, 0.24)]
try:
    from npkit import SFX as SFXTAB
except ImportError:
    SFXTAB = {}
for name, at, gain in SFX_CUES:
    ts, te, peak = SFXTAB[name][0], SFXTAB[name][1], SFXTAB[name][2]
    P.audio(t_sfx, sfx[name], max(0.0, at - (peak - ts)), te - ts,
            mstart=ts, gain=gain, ident=name)

P.sync_track_attributes()
P.validate()
P.save()
print(f"✅ {PROJ}")
print(f"   ბიტი {len(BEATS)} · წარწერა {len(CAPS)} · ხმის კლიპი "
      f"{sum(len(p) for p, _, _ in LINES)} · SFX {len(SFX_CUES)} · {DUR}წმ")
