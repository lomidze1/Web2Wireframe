"""Short 02 — z-index / stacking context.

Craft-თემა, თვე 1-ის წესის შესაბამისი: ეკრანზე პროდუქტის გამომავალი არ ჩანს.
წყარო-ჩანაწერი არ სჭირდება — სრულად ანიმაციაა.
იგივე იდეა, რაც 09-07-ის X/LinkedIn პოსტს.
"""
import sys, tempfile
sys.path.insert(0, "/Users/giorgi/Desktop/Web2Wireframe/scripts/video")
from pathlib import Path
from w2wkit import *

set_canvas(SHORT)

OUT = Path("/Users/giorgi/Desktop/Web2Wireframe/social-agent/01) video/development/shorts/02-zindex")
DUR = 28.0

# ── ბიტების საზღვრები ────────────────────────────────────────────────
T_A   = 3.40    # card A
T_B   = 7.20    # card B ჩამოცურდება ზემოდან
T_ANC = 12.60   # წინაპრის ყუთი ვლინდება
T_PAY = 19.60   # payoff
T_END = 24.60   # end card

# ── სპრაიტები ────────────────────────────────────────────────────────
HOOK   = wrap_sprite("z-index: 9999\ndoesn't always win.", FB, 88, WHITE, maxw=900)

BOX    = card_sprite(700, 400, r=28, fill=SURFACE, outline=ACCENT, width=4)
BOXLBL = text_sprite("transform: translateZ(0)", FS, 40, ACCENT_HI)

CARD_A = card_sprite(600, 250, r=20, fill=(62, 59, 58), outline=(96, 92, 91), width=2)
LBL_A  = text_sprite("z-index: 9999", FB, 60, WHITE)
SUB_A  = text_sprite("inside .parent", FR, 36, MUTED)

CARD_B = card_sprite(600, 250, r=20, fill=WHITE, outline=WHITE, width=2)
LBL_B  = text_sprite("z-index: 2", FB, 60, INK)
SUB_B  = text_sprite("outside it", FR, 36, (120, 116, 116))

PAY    = wrap_sprite("z-index only ranks elements inside their own stacking context.",
                     FB, 74, WHITE, maxw=900)

END1   = text_sprite("Web2Wireframe", FEB, 78, WHITE)
END2   = text_sprite("free on Figma Community", FS, 44, ACCENT_HI)

CAPS = [(T_A,   T_B,   "One card asks for 9999."),
        (T_B,   T_ANC, "Its neighbour asks for 2."),
        (T_ANC, 16.20, "The 2 sits on top."),
        (16.20, T_PAY, "Its parent has a transform.")]

AX, AY = 430, 880       # card A ცენტრი
BX, BY = 700, 1070      # card B ცენტრი — ყუთს გარეთ გადმოდის
BOXY   = 880            # წინაპრის ყუთის ცენტრი (= card A)


def scene(base, t, a):
    """A/B ბარათები + წინაპრის ყუთი. `a` = მთელი სცენის alpha."""
    if t >= T_ANC:                                   # ყუთი — ბარათებს უკან
        u = ease(seg(t, T_ANC, T_ANC + 0.7))
        paste(base, BOX, 430, BOXY, alpha=a * u, scale=lerp(0.94, 1.0, u))
        paste(base, BOXLBL, 430, BOXY - 232, alpha=a * ease(seg(t, T_ANC + 0.35, T_ANC + 1.0)))

    if t >= T_A:                                     # card A
        u = ease(seg(t, T_A, T_A + 0.6))
        s = lerp(0.94, 1.0, overshoot(seg(t, T_A, T_A + 0.55)))
        paste(base, CARD_A, AX, AY, alpha=a * u, scale=s)
        paste(base, LBL_A,  AX, AY - 32, alpha=a * u, scale=s)
        paste(base, SUB_A,  AX, AY + 38, alpha=a * u, scale=s)

    if t >= T_B:                                     # card B — ზემოდან ჩამოცურდება
        u  = ease(seg(t, T_B, T_B + 0.7))
        dy = lerp(-150, 0, u)
        paste(base, CARD_B, BX, BY + dy, alpha=a * u)
        paste(base, LBL_B,  BX, BY + dy - 30, alpha=a * u)
        paste(base, SUB_B,  BX, BY + dy + 48, alpha=a * u)


def frame(t):
    base = new_frame()

    if t < T_A:                                      # ── Hook
        paste(base, HOOK, 540, 940,
              alpha=ease(seg(t, 0.0, 0.55)),
              scale=lerp(0.96, 1.0, overshoot(seg(t, 0.0, 0.5))))

    elif t < T_PAY + 0.8:                            # ── Proof
        a = 1.0 - ease(seg(t, T_PAY, T_PAY + 0.8))   # payoff-ზე ქრება
        scene(base, t, a)
        for c0, c1, txt in CAPS:
            if c0 <= t < c1:
                draw_caption(base, txt, y=1590,
                             size=52, color=WHITE, maxw=940)

    if T_PAY <= t < T_END:                           # ── Payoff
        paste(base, PAY, 540, 960, alpha=ease(seg(t, T_PAY + 0.3, T_PAY + 1.0)))

    if t >= T_END:                                   # ── End card (გაყინული)
        u = ease(seg(t, T_END, T_END + 0.5))
        paste(base, END1, 540, 900, alpha=u, scale=lerp(0.96, 1.0, u))
        paste(base, END2, 540, 1000, alpha=ease(seg(t, T_END + 0.3, T_END + 0.9)))

    return base.convert("RGB")


TMP = Path(tempfile.gettempdir()) / "w2w_short02_silent.mp4"
render(frame, TMP, dur=DUR)
mix_sfx(TMP, OUT / "02-zindex.mp4",
        [("swoosh.mp3",    0.40,  0.34),
         ("popup.mp3",     T_A,   0.40),
         ("fast-whoosh.mp3", T_B, 0.42),
         ("popup.mp3",     T_ANC, 0.38),
         ("click.mp3",     T_PAY, 0.34),
         ("swoosh-02.mp3", T_END, 0.30)],
        dur=DUR + 0.05)
TMP.unlink(missing_ok=True)

print(probe(OUT / "02-zindex.mp4", "stream=width,height,r_frame_rate,pix_fmt"))
print(probe(OUT / "02-zindex.mp4", "format=duration"))
print(probe(OUT / "02-zindex.mp4", "stream=codec_name,sample_rate", "a:0"))
contact_sheet(OUT / "02-zindex.mp4", OUT / "sheet.png", every=1.5)
