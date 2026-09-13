---
name: youtube-short
description: Web2Wireframe-ის YouTube Short-ის აწყობა — ვერტიკალური 1080×1920, ხმის გარეშე, წარწერებით. გამოიძახე როცა გიორგი ითხოვს ვიდეოს, Short-ს, სარეკლამო კლიპს, ან აგზავნის ეკრანის ჩანაწერს ასაწყობად. მარკეტინგისთვისაა — კოდს არ ეხება.
---

# W2W Short — პაიპლაინი

**შედეგი: ერთი ატვირთვისთვის მზა `.mp4`.** Camtasia არ ერევა — Shorts მოკლეა და
ფორმულური, სრული აწყობა აქ ჯდება.

**ძრავა:** [`scripts/video/w2wkit.py`](../../../scripts/video/w2wkit.py) —
`~/Desktop/Nicepage - Video/npkit.py`-ის დამტკიცებული ძრავა, ვერტიკალზე და
W2W-ის პალიტრაზე მორგებული. SFX-ის 48-ეფექტიანი გაზომილი ბიბლიოთეკა იქიდან იტვირთება.

---

## 0 · სანამ დაიწყებ

1. **წაიკითხე `social-agent/01) video/development/FEEDBACK.md`.**
   გემოვნება მხოლოდ იქ წერია, კოდში არა.
2. **შეამოწმე ფაზა** (`docs/growth/METRICS.md`). თვე 1-ში (08-24 → 09-21)
   **პროდუქტის გამომავალის ჩვენება აკრძალულია** — გატეხილი იმპორტის ვიდეო
   უარყოფითი რეკლამაა. თვე 1-ის Short-ები craft-თემებზეა
   (CSS, ტიპოგრაფია, Figma), სადაც ეკრანზე ბრაუზერი და Figma ჩანს, არა ჩვენი შედეგი.
3. **ერთი სესია = ერთი Short.**

## 1 · ფორმატი (ხისტი)

| | |
|---|---|
| ზომა | **1080×1920**, 30fps, H.264 yuv420p, +faststart |
| ხანგრძლივობა | **20–40წმ.** <15წმ ცარიელია, >60წმ აღარაა Short |
| ხმა | **მხოლოდ SFX.** voice-ი არასდროს — გიორგი ინგლისურად არ ლაპარაკობს |
| ტექსტი | Poppins. სათაური Bold, წარწერა SemiBold. თეთრი. sentence case |
| აქცენტი | `ACCENT_HI` (#E1AD66) — მხოლოდ **ერთ** ელემენტზე კადრში |

## 2 · სტრუქტურა — 4 ბიტი

| ბიტი | დრო | რა |
|---|---|---|
| **Hook** | 0–3წმ | ერთი განცხადება, რომელიც ეწინააღმდეგება მოლოდინს. ეკრანზე ტექსტი **პირველივე კადრიდან** |
| **Proof** | 3–20წმ | ეკრანის ჩანაწერი ან ანიმაცია, რომელიც აჩვენებს |
| **Payoff** | 20–32წმ | წესი ერთი წინადადებით |
| **End card** | ბოლო 3წმ | `Web2Wireframe` + `Figma Community` — **გაყინული კადრი** |

🔑 **Hook-ის პირველი კადრი ცარიელი არ იყოს.** Shorts-ზე 1.5 წამში წყვეტენ.

## 3 · აწყობა

```python
import sys, tempfile
sys.path.insert(0, "/Users/giorgi/Desktop/Web2Wireframe/scripts/video")
from pathlib import Path
from w2wkit import *

DUR = 28.0
rec = ScreenClip("recording.mov", fit="width")     # ffmpeg-ით კადრებად, ერთხელ
TITLE = wrap_sprite("line-height: normal is not 1.2", FB, 72, WHITE, maxw=900)

def frame(t):
    base = new_frame()
    if t < 3.2:
        paste(base, TITLE, 540, 900, alpha=ease(seg(t, 0.0, 0.6)),
              scale=lerp(0.96, 1.0, overshoot(seg(t, 0, 0.5))))
    else:
        rec.draw(base, t - 3.2, cy=860, zoom=lerp(1.0, 1.06, seg(t, 3.2, DUR)))
        draw_caption(base, "The browser computes it from font metrics.", y=1560)
    return base.convert("RGB")

TMP = Path(tempfile.gettempdir()) / "short_silent.mp4"
render(frame, TMP, dur=DUR)
mix_sfx(TMP, "short-01.mp4", [("swoosh.mp3", 0.30, 0.40),
                              ("popup.mp3",  3.25, 0.45)], dur=DUR + 0.05)
TMP.unlink(missing_ok=True); rec.close()
```

**წესები (npkit-იდან, ძვირად ნასწავლი):**
- **ყოველთვის `ease`**, არასდროს linear. pop-ს `overshoot`
- **ზუმი ან ≥5%-ია და მთელ ჰოლდზე გაწელილი, ან საერთოდ არაა.**
  პატარა 1%-იანი ზუმები „კამერა ხელში უჭირავს" ეფექტს იძლევა — გიორგიმ ეს ერთხელ
  უკვე დაიწუნა
- ელემენტები **თანმიმდევრობით** (stagger 0.3–0.5წმ)
- ტექსტი **ერთფეროვანი თეთრი** — ორ ფერად არა
- **ბოლოს ≥0.5წმ გაყინული კადრი**
- `_silent.mp4` **/tmp-ში**, ჩასაბარებელ საქაღალდეში არასდროს

გაშვება (PIL/numpy venv-ში):
```bash
cd ~/Developer/video-use && uv run python /path/to/build_short_NN.py
```

## 4 · შემოწმება — გამოტოვება არ შეიძლება

ვიდეოს ვერ ვუყურებ და ხმას ვერ ვისმენ. ციფრი და კონტაქტ-ფურცელი ერთადერთი მტკიცებულებაა.

```python
print(probe("short-01.mp4", "stream=width,height,r_frame_rate,pix_fmt"))
print(probe("short-01.mp4", "format=duration"))
print(probe("short-01.mp4", "stream=codec_name,sample_rate", "a:0"))
contact_sheet("short-01.mp4", "sheet.png", every=1.5)   # → მერე Read-ით შეხედე
```

✅ 1080×1920 · 30fps · yuv420p · AAC 44100 · 20–40წმ ·
კონტაქტ-ფურცელი **ნანახია** · წარწერა ყველა კადრზე იკითხება

## 5 · ჩაბარება

### 🔴 ორი საქაღალდე — არ აურიო

| სად | რა |
|-----|-----|
| `social-agent/01) video/development/` | **ყველაფერი მუშა:** ვერსიები, ხმები, შუალედები, build-სკრიპტები |
| `social-agent/01) video/production/` | **მხოლოდ ასატვირთი** — და **მხოლოდ გიორგის დადასტურების შემდეგ** |

**`production/`-ში ვიდეოს ყოველთვის თან უნდა ახლდეს `title` და `description`.**
ერთი `.mp4` + ერთი `.md` იმავე სახელით. ამის გარეშე ატვირთვა შეუძლებელია.

🚫 **არასდროს ჩადო რამე `01) video/production/`-ში დადასტურების გარეშე.**

- გეგმები, სცენარები, VO-ს ტექსტი → `social-agent/01) video/development/scripts/`
- build-სკრიპტი + შუალედური რენდერები → `social-agent/01) video/development/shorts/<NN-slug>/`
- ვერსიები `-v2`, `-v3` **იმავე საქაღალდეში**; არსებულ mp4-ს ადგილზე **ნუ გადააწერ**
- `SendUserFile`-ით გაუგზავნე + აუხსენი **იდეა**, არა ციფრები
- Buffer-ში YouTube-ის დაგეგმვა → `/social` ან `social-agent`

## 6 · დასრულებისას

ჩაწერე `FEEDBACK.md`-ში რა გააკეთე; გიორგი დაამატებს რა შეცვალა და **რატომ**.
შემდეგი სესია იქიდან იწყებს.
