# Web2Wireframe — Manual Test Matrix

> Generated: 2026-04-09
> Updated: 2026-04-22
> Branch: `dev` (new-way merged; `old-way` kept as backup)

---

## 0. Test Websites (3 difficulty levels)

| დონე      | URL                                                  | აღწერა                                 |
| --------- | ---------------------------------------------------- | -------------------------------------- |
| 🟢 მარტივი | `https://www.web2wireframe.design/pricing`           | Simple layout, own design system       |
| 🟡 საშუალო | `https://www.apple.com/`                             | Complex layout, images, CSS animations |
| 🔴 რთული   | `https://www.tesla.com/`                             | Full-bleed images, video backgrounds   |

**ტესტის მეთოდი:** ყოველ smoke test-ს (W-01, W-02, W-03...) ვატარებთ 3-ივე ვებსაიტზე, რომ ბევრი use case-ი გავტესტოთ (მარტივი → რთული).

---

## 1. Settings Available Per Tab

### Tab Review Status

| Tab              | სტატუსი | შენიშვნა                                          |
| ---------------- | ------- | ------------------------------------------------- |
| Web              | ✅      | ყველა ფუნქცია სწორად არის                         |
| Screenshot       | ✅      | გამოსწორდა — იხილე ცვლილებები ქვემოთ              |
| HTML Import      | ✅      | ყველა ფუნქცია სწორად არის                         |
| Area Selection   | ✅      | ყველა ფუნქცია სწორად არის                         |
| Browser Extension| ✅      | მხოლოდ viewport, დანარჩენს პლაგინი აკონტროლებს    |

### Settings Matrix

| Setting          | Web                        | Screenshot                              | HTML                       | Area Selection             | Browser Extension   |
| ---------------- | -------------------------- | --------------------------------------- | -------------------------- | -------------------------- | ------------------- |
| **Viewports**    | 5 checkboxes               | 5 checkboxes                            | 5 checkboxes               | HIDDEN                     | N/A (default)       |
| **Colors**       | Plugin / Website           | Plugin / Screenshot                     | Plugin / Website           | Plugin / Website           | default config      |
| **Fonts**        | Plugin / Website / Lines   | Plugin / ~~Website~~ / Lines            | Plugin / Website / Lines   | Plugin / Website / Lines   | default config      |
| **Text**         | Semantic / Lorem / Website | ~~Semantic~~ / Lorem / Screenshot       | Semantic / Lorem / Code    | Semantic / Lorem / Website | default config      |
| **Assets**       | Placeholders / Real        | Placeholders / ~~Real~~                 | Placeholders / Real        | Placeholders / Real        | default config      |
| **CSS Vars**     | Direct / Styles            | Direct / Styles                         | Direct / Styles            | Direct / Styles            | default config      |
| **Layout**       | Auto Layout / Absolute     | ~~Auto Layout~~ / Absolute              | Auto Layout / Absolute     | Auto Layout / Absolute     | default config      |
| **Interactions** | None / Hover Variants      | None / ~~Hover Variants~~               | None / Hover Variants      | None / Hover Variants      | N/A                 |

### Screenshot Tab — ცვლილებები (გამოსწორებული)

| #    | საკითხი                | შედეგი                                                             | სტატუსი |
| ---- | ---------------------- | ------------------------------------------------------------------ | ------- |
| SS-1 | "Website Text" label   | შეიცვალა → **"Screenshot Text"**                                   | ✅      |
| SS-2 | Semantic Placeholder   | **disabled** — forced Lorem, Semantic ჩანს მაგრამ ვერ აირჩევ       | ✅      |
| SS-3 | Real Assets            | **disabled** — forced Placeholder, Real ჩანს მაგრამ ვერ აირჩევ     | ✅      |
| SS-4 | Auto Layout            | **disabled** — forced Absolute (DOM tree არ არსებობს)              | ✅      |
| SS-5 | Interactions           | **დაემატა** — None არჩეული, Hover Variants disabled                | ✅      |

---

## 2. Viewports (Multi-select, min 1)

| #  | Viewport | Value    |
| -- | -------- | -------- |
| V1 | 1920px   | `"1920"` |
| V2 | 1440px   | `"1440"` |
| V3 | 1024px   | `"1024"` |
| V4 | 768px    | `"768"`  |
| V5 | 375px    | `"375"`  |

### Viewport Combinations (selection only, import ტესტი Section 5-ში)

| #     | Viewports            | აღწერა                           | სტატუსი |
| ----- | -------------------- | -------------------------------- | ------- |
| VP-1  | 1920 only            | Single desktop                   | ✅      |
| VP-2  | 1440 only            | Single mid-desktop               | ✅      |
| VP-3  | 1024 only            | Single tablet landscape          | ✅      |
| VP-4  | 768 only             | Single tablet portrait           | ✅      |
| VP-5  | 375 only             | Single mobile                    | ✅      |
| VP-6  | 1920 + 375           | Desktop + mobile (extreme)       | ✅      |
| VP-7  | 1440 + 768 + 375     | Desktop + tablet + mobile        | ✅      |
| VP-8  | All 5                | Full set                         | ✅      |
| VP-9  | 1024 + 768           | Two tablet sizes                 | ✅      |
| VP-10 | None selected         | Edge case: min 1 ყოველთვის რჩება | ✅      |

### Viewport Bug Fixes

| #    | საკითხი                                    | შედეგი                                                | სტატუსი |
| ---- | ------------------------------------------ | ----------------------------------------------------- | ------- |
| VP-B1 | Browser Extension: duplicate viewport values | **დაიბლოკა** — იგივე რიცხვის ჩაწერა reset-ს აკეთებს | ✅      |

---

## 3. Settings Dropdown Values

### 3.1 Colors

| #  | Value      | Label                                          | სტატუსი |
| -- | ---------- | ---------------------------------------------- | ------- |
| C1 | `plugin`   | Plugin Colors                                  | ✅      |
| C2 | `website`  | Website Colors / Screenshot Colors / Code Colors | ✅      |

### 3.2 Fonts

| #  | Value     | Label                          | სტატუსი |
| -- | --------- | ------------------------------ | ------- |
| F1 | `plugin`  | Plugin Fonts                   | ✅      |
| F2 | `website` | Website Fonts / Code Fonts     | ✅      |
| F3 | `lines`   | Wireframe Lines                | ✅      |

### 3.3 Text

| #  | Value      | Label                                          | სტატუსი |
| -- | ---------- | ---------------------------------------------- | ------- |
| T1 | `semantic` | Semantic Placeholders                          | ✅      |
| T2 | `lorem`    | Lorem Ipsum                                    | ✅      |
| T3 | `website`  | Website Text / Screenshot Text / Code Text     | ✅      |

### 3.4 Assets

| #  | Value          | Label                | სტატუსი |
| -- | -------------- | -------------------- | ------- |
| A1 | `placeholders` | Plugin Placeholders  | ✅      |
| A2 | `realAssets`   | Real Assets          | ✅      |

### 3.5 CSS Variables

| #   | Value    | Label               | სტატუსი |
| --- | -------- | ------------------- | ------- |
| CV1 | `direct` | Direct Value        | ✅      |
| CV2 | `styles` | Create Figma Styles | ✅      |

### 3.6 Layout Mode

| #  | Value        | Label                    | სტატუსი |
| -- | ------------ | ------------------------ | ------- |
| L1 | `autoLayout` | Auto Layout              | ✅      |
| L2 | `absolute`   | Absolute (Pixel-perfect) | ✅      |

### 3.7 Interactions

| #  | Value      | Label              | სტატუსი |
| -- | ---------- | ------------------ | ------- |
| I1 | `none`     | None               | ✅      |
| I2 | `variants` | Interactive States | ✅      |

### Label Changes Summary

| ძველი                      | ახალი              | სტატუსი |
| -------------------------- | ------------------ | ------- |
| Plugin Colors (Editable)   | Plugin Colors      | ✅      |
| Plugin Fonts (Editable)    | Plugin Fonts       | ✅      |
| Auto Layout (Editable)     | Auto Layout        | ✅      |
| Hover Variants             | Interactive States | ✅      |

---

## 4. Total Combinations Per Tab

| Tab                | Colors | Fonts | Text | Assets | CSS Vars | Layout | Interactions | Total       |
| ------------------ | ------ | ----- | ---- | ------ | -------- | ------ | ------------ | ----------- |
| **Web**            | 2      | 3     | 3    | 2      | 2        | 2      | 2            | **288**     |
| **Screenshot**     | 2      | 2*    | 3    | 2      | 2        | 1*     | -            | **48**      |
| **HTML**           | 2      | 3     | 3    | 2      | 2        | 2      | 2            | **288**     |
| **Area Selection** | 2      | 3     | 3    | 2      | 2        | 2      | 2            | **288**     |
| **Browser Ext.**   | -      | -     | -    | -      | -        | -      | -            | **1**       |

*Screenshot: Website Fonts disabled, Auto Layout disabled (forced Absolute)*

---

## 5. Priority Test Cases (Smoke Tests)

### 5.1 Web Tab

> 🟢 მარტივი = web2wireframe.design/pricing | 🟡 საშუალო = apple.com | 🔴 რთული = tesla.com

| #    | VP        | Colors  | Fonts   | Text     | Assets       | CSS Vars | Layout | Inter.  | შენიშვნა               | 🟢 მარტივი | 🟡 საშუალო | 🔴 რთული |
| ---- | --------- | ------- | ------- | -------- | ------------ | -------- | ------ | ------- | ----------------------- | ---------- | ---------- | -------- |
| W-01 | 1440      | Website | Website | Website  | Real         | Direct   | AL     | None    | Default real-world      | ✅         |            |          |
| W-02 | 1440      | Plugin  | Plugin  | Semantic | Placeholders | Direct   | AL     | None    | Default wireframe       | ✅         |            |          |
| W-03 | 1440      | Website | Website | Website  | Real         | Styles   | AL     | Hover   | Full features           | ⛔         |            |          |
| W-04 | 1440      | Plugin  | Lines   | Lorem    | Placeholders | Direct   | Abs    | None    | Full wireframe          |            |            |          |
| W-05 | 375       | Website | Website | Website  | Real         | Direct   | AL     | None    | Mobile                  |            |            |          |
| W-06 | 1920+375  | Website | Website | Website  | Real         | Direct   | AL     | None    | Multi-viewport          |            |            |          |
| W-07 | All 5     | Plugin  | Plugin  | Semantic | Placeholders | Styles   | AL     | Hover   | All VP + all features   |            |            |          |
| W-08 | 1440      | Website | Lines   | Website  | Real         | Styles   | Abs    | Hover   | Mixed: real + wireframe |            |            |          |
| W-09 | 768       | Plugin  | Website | Lorem    | Real         | Direct   | Abs    | None    | Tablet + mixed          |            |            |          |
| W-10 | 1024      | Website | Plugin  | Semantic | Placeholders | Styles   | AL     | Hover   | Mixed reversed          |            |            |          |

### 5.2 Screenshot Tab

| #    | VP       | Colors     | Fonts  | Text     | Assets       | CSS Vars | Layout | შენიშვნა                | სტატუსი |
| ---- | -------- | ---------- | ------ | -------- | ------------ | -------- | ------ | ----------------------- | ------- |
| S-01 | 1440     | Screenshot | Plugin | Semantic | Placeholders | Direct   | Abs    | Default                 |         |
| S-02 | 1440     | Plugin     | Plugin | Lorem    | Placeholders | Direct   | Abs    | Plugin wireframe        |         |
| S-03 | 1440     | Screenshot | Lines  | Website  | Real         | Styles   | Abs    | Real + wireframe lines  |         |
| S-04 | 375      | Screenshot | Plugin | Semantic | Real         | Direct   | Abs    | Mobile screenshot       |         |
| S-05 | 1920+768 | Plugin     | Lines  | Lorem    | Placeholders | Styles   | Abs    | Multi-viewport          |         |

### 5.3 HTML Tab

| #    | VP   | Colors  | Fonts   | Text | Assets       | CSS Vars | Layout | Inter. | შენიშვნა     | სტატუსი |
| ---- | ---- | ------- | ------- | ---- | ------------ | -------- | ------ | ------ | ------------- | ------- |
| H-01 | 1440 | Website | Website | Code | Real         | Direct   | AL     | None   | Default       |         |
| H-02 | 1440 | Plugin  | Plugin  | Sem  | Placeholders | Direct   | AL     | None   | Wireframe     |         |
| H-03 | 1440 | Website | Website | Code | Real         | Styles   | AL     | Hover  | Full features |         |
| H-04 | 1440 | Plugin  | Lines   | Lor  | Placeholders | Direct   | Abs    | None   | Full wire     |         |
| H-05 | 375  | Website | Website | Code | Real         | Direct   | AL     | Hover  | Mobile        |         |

### 5.4 Area Selection Tab

| #     | Colors  | Fonts   | Text     | Assets       | CSS Vars | Layout | Inter. | შენიშვნა     | სტატუსი |
| ----- | ------- | ------- | -------- | ------------ | -------- | ------ | ------ | ------------- | ------- |
| AS-01 | Website | Website | Website  | Real         | Direct   | AL     | None   | Default       |         |
| AS-02 | Plugin  | Plugin  | Semantic | Placeholders | Direct   | AL     | None   | Wireframe     |         |
| AS-03 | Website | Website | Website  | Real         | Styles   | AL     | Hover  | Full features |         |
| AS-04 | Plugin  | Lines   | Lorem    | Placeholders | Direct   | Abs    | None   | Full wire     |         |
| AS-05 | Website | Plugin  | Website  | Real         | Styles   | Abs    | Hover  | Mixed         |         |

### 5.5 Browser Extension Tab

| #     | შენიშვნა                                     | სტატუსი |
| ----- | -------------------------------------------- | ------- |
| BE-01 | Default config — import from pending CDP     |         |
| BE-02 | No pending data — error handling             |         |
| BE-03 | Large page — performance test                |         |

---

## 6. Exhaustive Combination Tests

### 6.1 Web Tab — 288 Combinations (VP = 1440)

| #      | C  | F  | T  | A  | CV  | L  | I  |
| ------ | -- | -- | -- | -- | --- | -- | -- |
| W-E001 | C1 | F1 | T1 | A1 | CV1 | L1 | I1 |
| W-E002 | C1 | F1 | T1 | A1 | CV1 | L1 | I2 |
| W-E003 | C1 | F1 | T1 | A1 | CV1 | L2 | I1 |
| W-E004 | C1 | F1 | T1 | A1 | CV1 | L2 | I2 |
| W-E005 | C1 | F1 | T1 | A1 | CV2 | L1 | I1 |
| W-E006 | C1 | F1 | T1 | A1 | CV2 | L1 | I2 |
| W-E007 | C1 | F1 | T1 | A1 | CV2 | L2 | I1 |
| W-E008 | C1 | F1 | T1 | A1 | CV2 | L2 | I2 |
| W-E009 | C1 | F1 | T1 | A2 | CV1 | L1 | I1 |
| W-E010 | C1 | F1 | T1 | A2 | CV1 | L1 | I2 |
| W-E011 | C1 | F1 | T1 | A2 | CV1 | L2 | I1 |
| W-E012 | C1 | F1 | T1 | A2 | CV1 | L2 | I2 |
| W-E013 | C1 | F1 | T1 | A2 | CV2 | L1 | I1 |
| W-E014 | C1 | F1 | T1 | A2 | CV2 | L1 | I2 |
| W-E015 | C1 | F1 | T1 | A2 | CV2 | L2 | I1 |
| W-E016 | C1 | F1 | T1 | A2 | CV2 | L2 | I2 |
| W-E017 | C1 | F1 | T2 | A1 | CV1 | L1 | I1 |
| W-E018 | C1 | F1 | T2 | A1 | CV1 | L1 | I2 |
| W-E019 | C1 | F1 | T2 | A1 | CV1 | L2 | I1 |
| W-E020 | C1 | F1 | T2 | A1 | CV1 | L2 | I2 |
| W-E021 | C1 | F1 | T2 | A1 | CV2 | L1 | I1 |
| W-E022 | C1 | F1 | T2 | A1 | CV2 | L1 | I2 |
| W-E023 | C1 | F1 | T2 | A1 | CV2 | L2 | I1 |
| W-E024 | C1 | F1 | T2 | A1 | CV2 | L2 | I2 |
| W-E025 | C1 | F1 | T2 | A2 | CV1 | L1 | I1 |
| W-E026 | C1 | F1 | T2 | A2 | CV1 | L1 | I2 |
| W-E027 | C1 | F1 | T2 | A2 | CV1 | L2 | I1 |
| W-E028 | C1 | F1 | T2 | A2 | CV1 | L2 | I2 |
| W-E029 | C1 | F1 | T2 | A2 | CV2 | L1 | I1 |
| W-E030 | C1 | F1 | T2 | A2 | CV2 | L1 | I2 |
| W-E031 | C1 | F1 | T2 | A2 | CV2 | L2 | I1 |
| W-E032 | C1 | F1 | T2 | A2 | CV2 | L2 | I2 |
| W-E033 | C1 | F1 | T3 | A1 | CV1 | L1 | I1 |
| W-E034 | C1 | F1 | T3 | A1 | CV1 | L1 | I2 |
| W-E035 | C1 | F1 | T3 | A1 | CV1 | L2 | I1 |
| W-E036 | C1 | F1 | T3 | A1 | CV1 | L2 | I2 |
| W-E037 | C1 | F1 | T3 | A1 | CV2 | L1 | I1 |
| W-E038 | C1 | F1 | T3 | A1 | CV2 | L1 | I2 |
| W-E039 | C1 | F1 | T3 | A1 | CV2 | L2 | I1 |
| W-E040 | C1 | F1 | T3 | A1 | CV2 | L2 | I2 |
| W-E041 | C1 | F1 | T3 | A2 | CV1 | L1 | I1 |
| W-E042 | C1 | F1 | T3 | A2 | CV1 | L1 | I2 |
| W-E043 | C1 | F1 | T3 | A2 | CV1 | L2 | I1 |
| W-E044 | C1 | F1 | T3 | A2 | CV1 | L2 | I2 |
| W-E045 | C1 | F1 | T3 | A2 | CV2 | L1 | I1 |
| W-E046 | C1 | F1 | T3 | A2 | CV2 | L1 | I2 |
| W-E047 | C1 | F1 | T3 | A2 | CV2 | L2 | I1 |
| W-E048 | C1 | F1 | T3 | A2 | CV2 | L2 | I2 |
| W-E049 | C1 | F2 | T1 | A1 | CV1 | L1 | I1 |
| W-E050 | C1 | F2 | T1 | A1 | CV1 | L1 | I2 |
| W-E051 | C1 | F2 | T1 | A1 | CV1 | L2 | I1 |
| W-E052 | C1 | F2 | T1 | A1 | CV1 | L2 | I2 |
| W-E053 | C1 | F2 | T1 | A1 | CV2 | L1 | I1 |
| W-E054 | C1 | F2 | T1 | A1 | CV2 | L1 | I2 |
| W-E055 | C1 | F2 | T1 | A1 | CV2 | L2 | I1 |
| W-E056 | C1 | F2 | T1 | A1 | CV2 | L2 | I2 |
| W-E057 | C1 | F2 | T1 | A2 | CV1 | L1 | I1 |
| W-E058 | C1 | F2 | T1 | A2 | CV1 | L1 | I2 |
| W-E059 | C1 | F2 | T1 | A2 | CV1 | L2 | I1 |
| W-E060 | C1 | F2 | T1 | A2 | CV1 | L2 | I2 |
| W-E061 | C1 | F2 | T1 | A2 | CV2 | L1 | I1 |
| W-E062 | C1 | F2 | T1 | A2 | CV2 | L1 | I2 |
| W-E063 | C1 | F2 | T1 | A2 | CV2 | L2 | I1 |
| W-E064 | C1 | F2 | T1 | A2 | CV2 | L2 | I2 |
| W-E065 | C1 | F2 | T2 | A1 | CV1 | L1 | I1 |
| W-E066 | C1 | F2 | T2 | A1 | CV1 | L1 | I2 |
| W-E067 | C1 | F2 | T2 | A1 | CV1 | L2 | I1 |
| W-E068 | C1 | F2 | T2 | A1 | CV1 | L2 | I2 |
| W-E069 | C1 | F2 | T2 | A1 | CV2 | L1 | I1 |
| W-E070 | C1 | F2 | T2 | A1 | CV2 | L1 | I2 |
| W-E071 | C1 | F2 | T2 | A1 | CV2 | L2 | I1 |
| W-E072 | C1 | F2 | T2 | A1 | CV2 | L2 | I2 |
| W-E073 | C1 | F2 | T2 | A2 | CV1 | L1 | I1 |
| W-E074 | C1 | F2 | T2 | A2 | CV1 | L1 | I2 |
| W-E075 | C1 | F2 | T2 | A2 | CV1 | L2 | I1 |
| W-E076 | C1 | F2 | T2 | A2 | CV1 | L2 | I2 |
| W-E077 | C1 | F2 | T2 | A2 | CV2 | L1 | I1 |
| W-E078 | C1 | F2 | T2 | A2 | CV2 | L1 | I2 |
| W-E079 | C1 | F2 | T2 | A2 | CV2 | L2 | I1 |
| W-E080 | C1 | F2 | T2 | A2 | CV2 | L2 | I2 |
| W-E081 | C1 | F2 | T3 | A1 | CV1 | L1 | I1 |
| W-E082 | C1 | F2 | T3 | A1 | CV1 | L1 | I2 |
| W-E083 | C1 | F2 | T3 | A1 | CV1 | L2 | I1 |
| W-E084 | C1 | F2 | T3 | A1 | CV1 | L2 | I2 |
| W-E085 | C1 | F2 | T3 | A1 | CV2 | L1 | I1 |
| W-E086 | C1 | F2 | T3 | A1 | CV2 | L1 | I2 |
| W-E087 | C1 | F2 | T3 | A1 | CV2 | L2 | I1 |
| W-E088 | C1 | F2 | T3 | A1 | CV2 | L2 | I2 |
| W-E089 | C1 | F2 | T3 | A2 | CV1 | L1 | I1 |
| W-E090 | C1 | F2 | T3 | A2 | CV1 | L1 | I2 |
| W-E091 | C1 | F2 | T3 | A2 | CV1 | L2 | I1 |
| W-E092 | C1 | F2 | T3 | A2 | CV1 | L2 | I2 |
| W-E093 | C1 | F2 | T3 | A2 | CV2 | L1 | I1 |
| W-E094 | C1 | F2 | T3 | A2 | CV2 | L1 | I2 |
| W-E095 | C1 | F2 | T3 | A2 | CV2 | L2 | I1 |
| W-E096 | C1 | F2 | T3 | A2 | CV2 | L2 | I2 |
| W-E097 | C1 | F3 | T1 | A1 | CV1 | L1 | I1 |
| W-E098 | C1 | F3 | T1 | A1 | CV1 | L1 | I2 |
| W-E099 | C1 | F3 | T1 | A1 | CV1 | L2 | I1 |
| W-E100 | C1 | F3 | T1 | A1 | CV1 | L2 | I2 |
| W-E101 | C1 | F3 | T1 | A1 | CV2 | L1 | I1 |
| W-E102 | C1 | F3 | T1 | A1 | CV2 | L1 | I2 |
| W-E103 | C1 | F3 | T1 | A1 | CV2 | L2 | I1 |
| W-E104 | C1 | F3 | T1 | A1 | CV2 | L2 | I2 |
| W-E105 | C1 | F3 | T1 | A2 | CV1 | L1 | I1 |
| W-E106 | C1 | F3 | T1 | A2 | CV1 | L1 | I2 |
| W-E107 | C1 | F3 | T1 | A2 | CV1 | L2 | I1 |
| W-E108 | C1 | F3 | T1 | A2 | CV1 | L2 | I2 |
| W-E109 | C1 | F3 | T1 | A2 | CV2 | L1 | I1 |
| W-E110 | C1 | F3 | T1 | A2 | CV2 | L1 | I2 |
| W-E111 | C1 | F3 | T1 | A2 | CV2 | L2 | I1 |
| W-E112 | C1 | F3 | T1 | A2 | CV2 | L2 | I2 |
| W-E113 | C1 | F3 | T2 | A1 | CV1 | L1 | I1 |
| W-E114 | C1 | F3 | T2 | A1 | CV1 | L1 | I2 |
| W-E115 | C1 | F3 | T2 | A1 | CV1 | L2 | I1 |
| W-E116 | C1 | F3 | T2 | A1 | CV1 | L2 | I2 |
| W-E117 | C1 | F3 | T2 | A1 | CV2 | L1 | I1 |
| W-E118 | C1 | F3 | T2 | A1 | CV2 | L1 | I2 |
| W-E119 | C1 | F3 | T2 | A1 | CV2 | L2 | I1 |
| W-E120 | C1 | F3 | T2 | A1 | CV2 | L2 | I2 |
| W-E121 | C1 | F3 | T2 | A2 | CV1 | L1 | I1 |
| W-E122 | C1 | F3 | T2 | A2 | CV1 | L1 | I2 |
| W-E123 | C1 | F3 | T2 | A2 | CV1 | L2 | I1 |
| W-E124 | C1 | F3 | T2 | A2 | CV1 | L2 | I2 |
| W-E125 | C1 | F3 | T2 | A2 | CV2 | L1 | I1 |
| W-E126 | C1 | F3 | T2 | A2 | CV2 | L1 | I2 |
| W-E127 | C1 | F3 | T2 | A2 | CV2 | L2 | I1 |
| W-E128 | C1 | F3 | T2 | A2 | CV2 | L2 | I2 |
| W-E129 | C1 | F3 | T3 | A1 | CV1 | L1 | I1 |
| W-E130 | C1 | F3 | T3 | A1 | CV1 | L1 | I2 |
| W-E131 | C1 | F3 | T3 | A1 | CV1 | L2 | I1 |
| W-E132 | C1 | F3 | T3 | A1 | CV1 | L2 | I2 |
| W-E133 | C1 | F3 | T3 | A1 | CV2 | L1 | I1 |
| W-E134 | C1 | F3 | T3 | A1 | CV2 | L1 | I2 |
| W-E135 | C1 | F3 | T3 | A1 | CV2 | L2 | I1 |
| W-E136 | C1 | F3 | T3 | A1 | CV2 | L2 | I2 |
| W-E137 | C1 | F3 | T3 | A2 | CV1 | L1 | I1 |
| W-E138 | C1 | F3 | T3 | A2 | CV1 | L1 | I2 |
| W-E139 | C1 | F3 | T3 | A2 | CV1 | L2 | I1 |
| W-E140 | C1 | F3 | T3 | A2 | CV1 | L2 | I2 |
| W-E141 | C1 | F3 | T3 | A2 | CV2 | L1 | I1 |
| W-E142 | C1 | F3 | T3 | A2 | CV2 | L1 | I2 |
| W-E143 | C1 | F3 | T3 | A2 | CV2 | L2 | I1 |
| W-E144 | C1 | F3 | T3 | A2 | CV2 | L2 | I2 |
| W-E145 | C2 | F1 | T1 | A1 | CV1 | L1 | I1 |
| W-E146 | C2 | F1 | T1 | A1 | CV1 | L1 | I2 |
| W-E147 | C2 | F1 | T1 | A1 | CV1 | L2 | I1 |
| W-E148 | C2 | F1 | T1 | A1 | CV1 | L2 | I2 |
| W-E149 | C2 | F1 | T1 | A1 | CV2 | L1 | I1 |
| W-E150 | C2 | F1 | T1 | A1 | CV2 | L1 | I2 |
| W-E151 | C2 | F1 | T1 | A1 | CV2 | L2 | I1 |
| W-E152 | C2 | F1 | T1 | A1 | CV2 | L2 | I2 |
| W-E153 | C2 | F1 | T1 | A2 | CV1 | L1 | I1 |
| W-E154 | C2 | F1 | T1 | A2 | CV1 | L1 | I2 |
| W-E155 | C2 | F1 | T1 | A2 | CV1 | L2 | I1 |
| W-E156 | C2 | F1 | T1 | A2 | CV1 | L2 | I2 |
| W-E157 | C2 | F1 | T1 | A2 | CV2 | L1 | I1 |
| W-E158 | C2 | F1 | T1 | A2 | CV2 | L1 | I2 |
| W-E159 | C2 | F1 | T1 | A2 | CV2 | L2 | I1 |
| W-E160 | C2 | F1 | T1 | A2 | CV2 | L2 | I2 |
| W-E161 | C2 | F1 | T2 | A1 | CV1 | L1 | I1 |
| W-E162 | C2 | F1 | T2 | A1 | CV1 | L1 | I2 |
| W-E163 | C2 | F1 | T2 | A1 | CV1 | L2 | I1 |
| W-E164 | C2 | F1 | T2 | A1 | CV1 | L2 | I2 |
| W-E165 | C2 | F1 | T2 | A1 | CV2 | L1 | I1 |
| W-E166 | C2 | F1 | T2 | A1 | CV2 | L1 | I2 |
| W-E167 | C2 | F1 | T2 | A1 | CV2 | L2 | I1 |
| W-E168 | C2 | F1 | T2 | A1 | CV2 | L2 | I2 |
| W-E169 | C2 | F1 | T2 | A2 | CV1 | L1 | I1 |
| W-E170 | C2 | F1 | T2 | A2 | CV1 | L1 | I2 |
| W-E171 | C2 | F1 | T2 | A2 | CV1 | L2 | I1 |
| W-E172 | C2 | F1 | T2 | A2 | CV1 | L2 | I2 |
| W-E173 | C2 | F1 | T2 | A2 | CV2 | L1 | I1 |
| W-E174 | C2 | F1 | T2 | A2 | CV2 | L1 | I2 |
| W-E175 | C2 | F1 | T2 | A2 | CV2 | L2 | I1 |
| W-E176 | C2 | F1 | T2 | A2 | CV2 | L2 | I2 |
| W-E177 | C2 | F1 | T3 | A1 | CV1 | L1 | I1 |
| W-E178 | C2 | F1 | T3 | A1 | CV1 | L1 | I2 |
| W-E179 | C2 | F1 | T3 | A1 | CV1 | L2 | I1 |
| W-E180 | C2 | F1 | T3 | A1 | CV1 | L2 | I2 |
| W-E181 | C2 | F1 | T3 | A1 | CV2 | L1 | I1 |
| W-E182 | C2 | F1 | T3 | A1 | CV2 | L1 | I2 |
| W-E183 | C2 | F1 | T3 | A1 | CV2 | L2 | I1 |
| W-E184 | C2 | F1 | T3 | A1 | CV2 | L2 | I2 |
| W-E185 | C2 | F1 | T3 | A2 | CV1 | L1 | I1 |
| W-E186 | C2 | F1 | T3 | A2 | CV1 | L1 | I2 |
| W-E187 | C2 | F1 | T3 | A2 | CV1 | L2 | I1 |
| W-E188 | C2 | F1 | T3 | A2 | CV1 | L2 | I2 |
| W-E189 | C2 | F1 | T3 | A2 | CV2 | L1 | I1 |
| W-E190 | C2 | F1 | T3 | A2 | CV2 | L1 | I2 |
| W-E191 | C2 | F1 | T3 | A2 | CV2 | L2 | I1 |
| W-E192 | C2 | F1 | T3 | A2 | CV2 | L2 | I2 |
| W-E193 | C2 | F2 | T1 | A1 | CV1 | L1 | I1 |
| W-E194 | C2 | F2 | T1 | A1 | CV1 | L1 | I2 |
| W-E195 | C2 | F2 | T1 | A1 | CV1 | L2 | I1 |
| W-E196 | C2 | F2 | T1 | A1 | CV1 | L2 | I2 |
| W-E197 | C2 | F2 | T1 | A1 | CV2 | L1 | I1 |
| W-E198 | C2 | F2 | T1 | A1 | CV2 | L1 | I2 |
| W-E199 | C2 | F2 | T1 | A1 | CV2 | L2 | I1 |
| W-E200 | C2 | F2 | T1 | A1 | CV2 | L2 | I2 |
| W-E201 | C2 | F2 | T1 | A2 | CV1 | L1 | I1 |
| W-E202 | C2 | F2 | T1 | A2 | CV1 | L1 | I2 |
| W-E203 | C2 | F2 | T1 | A2 | CV1 | L2 | I1 |
| W-E204 | C2 | F2 | T1 | A2 | CV1 | L2 | I2 |
| W-E205 | C2 | F2 | T1 | A2 | CV2 | L1 | I1 |
| W-E206 | C2 | F2 | T1 | A2 | CV2 | L1 | I2 |
| W-E207 | C2 | F2 | T1 | A2 | CV2 | L2 | I1 |
| W-E208 | C2 | F2 | T1 | A2 | CV2 | L2 | I2 |
| W-E209 | C2 | F2 | T2 | A1 | CV1 | L1 | I1 |
| W-E210 | C2 | F2 | T2 | A1 | CV1 | L1 | I2 |
| W-E211 | C2 | F2 | T2 | A1 | CV1 | L2 | I1 |
| W-E212 | C2 | F2 | T2 | A1 | CV1 | L2 | I2 |
| W-E213 | C2 | F2 | T2 | A1 | CV2 | L1 | I1 |
| W-E214 | C2 | F2 | T2 | A1 | CV2 | L1 | I2 |
| W-E215 | C2 | F2 | T2 | A1 | CV2 | L2 | I1 |
| W-E216 | C2 | F2 | T2 | A1 | CV2 | L2 | I2 |
| W-E217 | C2 | F2 | T2 | A2 | CV1 | L1 | I1 |
| W-E218 | C2 | F2 | T2 | A2 | CV1 | L1 | I2 |
| W-E219 | C2 | F2 | T2 | A2 | CV1 | L2 | I1 |
| W-E220 | C2 | F2 | T2 | A2 | CV1 | L2 | I2 |
| W-E221 | C2 | F2 | T2 | A2 | CV2 | L1 | I1 |
| W-E222 | C2 | F2 | T2 | A2 | CV2 | L1 | I2 |
| W-E223 | C2 | F2 | T2 | A2 | CV2 | L2 | I1 |
| W-E224 | C2 | F2 | T2 | A2 | CV2 | L2 | I2 |
| W-E225 | C2 | F2 | T3 | A1 | CV1 | L1 | I1 |
| W-E226 | C2 | F2 | T3 | A1 | CV1 | L1 | I2 |
| W-E227 | C2 | F2 | T3 | A1 | CV1 | L2 | I1 |
| W-E228 | C2 | F2 | T3 | A1 | CV1 | L2 | I2 |
| W-E229 | C2 | F2 | T3 | A1 | CV2 | L1 | I1 |
| W-E230 | C2 | F2 | T3 | A1 | CV2 | L1 | I2 |
| W-E231 | C2 | F2 | T3 | A1 | CV2 | L2 | I1 |
| W-E232 | C2 | F2 | T3 | A1 | CV2 | L2 | I2 |
| W-E233 | C2 | F2 | T3 | A2 | CV1 | L1 | I1 |
| W-E234 | C2 | F2 | T3 | A2 | CV1 | L1 | I2 |
| W-E235 | C2 | F2 | T3 | A2 | CV1 | L2 | I1 |
| W-E236 | C2 | F2 | T3 | A2 | CV1 | L2 | I2 |
| W-E237 | C2 | F2 | T3 | A2 | CV2 | L1 | I1 |
| W-E238 | C2 | F2 | T3 | A2 | CV2 | L1 | I2 |
| W-E239 | C2 | F2 | T3 | A2 | CV2 | L2 | I1 |
| W-E240 | C2 | F2 | T3 | A2 | CV2 | L2 | I2 |
| W-E241 | C2 | F3 | T1 | A1 | CV1 | L1 | I1 |
| W-E242 | C2 | F3 | T1 | A1 | CV1 | L1 | I2 |
| W-E243 | C2 | F3 | T1 | A1 | CV1 | L2 | I1 |
| W-E244 | C2 | F3 | T1 | A1 | CV1 | L2 | I2 |
| W-E245 | C2 | F3 | T1 | A1 | CV2 | L1 | I1 |
| W-E246 | C2 | F3 | T1 | A1 | CV2 | L1 | I2 |
| W-E247 | C2 | F3 | T1 | A1 | CV2 | L2 | I1 |
| W-E248 | C2 | F3 | T1 | A1 | CV2 | L2 | I2 |
| W-E249 | C2 | F3 | T1 | A2 | CV1 | L1 | I1 |
| W-E250 | C2 | F3 | T1 | A2 | CV1 | L1 | I2 |
| W-E251 | C2 | F3 | T1 | A2 | CV1 | L2 | I1 |
| W-E252 | C2 | F3 | T1 | A2 | CV1 | L2 | I2 |
| W-E253 | C2 | F3 | T1 | A2 | CV2 | L1 | I1 |
| W-E254 | C2 | F3 | T1 | A2 | CV2 | L1 | I2 |
| W-E255 | C2 | F3 | T1 | A2 | CV2 | L2 | I1 |
| W-E256 | C2 | F3 | T1 | A2 | CV2 | L2 | I2 |
| W-E257 | C2 | F3 | T2 | A1 | CV1 | L1 | I1 |
| W-E258 | C2 | F3 | T2 | A1 | CV1 | L1 | I2 |
| W-E259 | C2 | F3 | T2 | A1 | CV1 | L2 | I1 |
| W-E260 | C2 | F3 | T2 | A1 | CV1 | L2 | I2 |
| W-E261 | C2 | F3 | T2 | A1 | CV2 | L1 | I1 |
| W-E262 | C2 | F3 | T2 | A1 | CV2 | L1 | I2 |
| W-E263 | C2 | F3 | T2 | A1 | CV2 | L2 | I1 |
| W-E264 | C2 | F3 | T2 | A1 | CV2 | L2 | I2 |
| W-E265 | C2 | F3 | T2 | A2 | CV1 | L1 | I1 |
| W-E266 | C2 | F3 | T2 | A2 | CV1 | L1 | I2 |
| W-E267 | C2 | F3 | T2 | A2 | CV1 | L2 | I1 |
| W-E268 | C2 | F3 | T2 | A2 | CV1 | L2 | I2 |
| W-E269 | C2 | F3 | T2 | A2 | CV2 | L1 | I1 |
| W-E270 | C2 | F3 | T2 | A2 | CV2 | L1 | I2 |
| W-E271 | C2 | F3 | T2 | A2 | CV2 | L2 | I1 |
| W-E272 | C2 | F3 | T2 | A2 | CV2 | L2 | I2 |
| W-E273 | C2 | F3 | T3 | A1 | CV1 | L1 | I1 |
| W-E274 | C2 | F3 | T3 | A1 | CV1 | L1 | I2 |
| W-E275 | C2 | F3 | T3 | A1 | CV1 | L2 | I1 |
| W-E276 | C2 | F3 | T3 | A1 | CV1 | L2 | I2 |
| W-E277 | C2 | F3 | T3 | A1 | CV2 | L1 | I1 |
| W-E278 | C2 | F3 | T3 | A1 | CV2 | L1 | I2 |
| W-E279 | C2 | F3 | T3 | A1 | CV2 | L2 | I1 |
| W-E280 | C2 | F3 | T3 | A1 | CV2 | L2 | I2 |
| W-E281 | C2 | F3 | T3 | A2 | CV1 | L1 | I1 |
| W-E282 | C2 | F3 | T3 | A2 | CV1 | L1 | I2 |
| W-E283 | C2 | F3 | T3 | A2 | CV1 | L2 | I1 |
| W-E284 | C2 | F3 | T3 | A2 | CV1 | L2 | I2 |
| W-E285 | C2 | F3 | T3 | A2 | CV2 | L1 | I1 |
| W-E286 | C2 | F3 | T3 | A2 | CV2 | L1 | I2 |
| W-E287 | C2 | F3 | T3 | A2 | CV2 | L2 | I1 |
| W-E288 | C2 | F3 | T3 | A2 | CV2 | L2 | I2 |

### 6.2 Screenshot Tab — 48 Combinations (VP = 1440)

*Fonts = Plugin (F1) or Lines (F3) only; Layout = Absolute (L2) only; No Interactions*

| #     | C  | F  | T  | A  | CV  |
| ----- | -- | -- | -- | -- | --- |
| S-E01 | C1 | F1 | T1 | A1 | CV1 |
| S-E02 | C1 | F1 | T1 | A1 | CV2 |
| S-E03 | C1 | F1 | T1 | A2 | CV1 |
| S-E04 | C1 | F1 | T1 | A2 | CV2 |
| S-E05 | C1 | F1 | T2 | A1 | CV1 |
| S-E06 | C1 | F1 | T2 | A1 | CV2 |
| S-E07 | C1 | F1 | T2 | A2 | CV1 |
| S-E08 | C1 | F1 | T2 | A2 | CV2 |
| S-E09 | C1 | F1 | T3 | A1 | CV1 |
| S-E10 | C1 | F1 | T3 | A1 | CV2 |
| S-E11 | C1 | F1 | T3 | A2 | CV1 |
| S-E12 | C1 | F1 | T3 | A2 | CV2 |
| S-E13 | C1 | F3 | T1 | A1 | CV1 |
| S-E14 | C1 | F3 | T1 | A1 | CV2 |
| S-E15 | C1 | F3 | T1 | A2 | CV1 |
| S-E16 | C1 | F3 | T1 | A2 | CV2 |
| S-E17 | C1 | F3 | T2 | A1 | CV1 |
| S-E18 | C1 | F3 | T2 | A1 | CV2 |
| S-E19 | C1 | F3 | T2 | A2 | CV1 |
| S-E20 | C1 | F3 | T2 | A2 | CV2 |
| S-E21 | C1 | F3 | T3 | A1 | CV1 |
| S-E22 | C1 | F3 | T3 | A1 | CV2 |
| S-E23 | C1 | F3 | T3 | A2 | CV1 |
| S-E24 | C1 | F3 | T3 | A2 | CV2 |
| S-E25 | C2 | F1 | T1 | A1 | CV1 |
| S-E26 | C2 | F1 | T1 | A1 | CV2 |
| S-E27 | C2 | F1 | T1 | A2 | CV1 |
| S-E28 | C2 | F1 | T1 | A2 | CV2 |
| S-E29 | C2 | F1 | T2 | A1 | CV1 |
| S-E30 | C2 | F1 | T2 | A1 | CV2 |
| S-E31 | C2 | F1 | T2 | A2 | CV1 |
| S-E32 | C2 | F1 | T2 | A2 | CV2 |
| S-E33 | C2 | F1 | T3 | A1 | CV1 |
| S-E34 | C2 | F1 | T3 | A1 | CV2 |
| S-E35 | C2 | F1 | T3 | A2 | CV1 |
| S-E36 | C2 | F1 | T3 | A2 | CV2 |
| S-E37 | C2 | F3 | T1 | A1 | CV1 |
| S-E38 | C2 | F3 | T1 | A1 | CV2 |
| S-E39 | C2 | F3 | T1 | A2 | CV1 |
| S-E40 | C2 | F3 | T1 | A2 | CV2 |
| S-E41 | C2 | F3 | T2 | A1 | CV1 |
| S-E42 | C2 | F3 | T2 | A1 | CV2 |
| S-E43 | C2 | F3 | T2 | A2 | CV1 |
| S-E44 | C2 | F3 | T2 | A2 | CV2 |
| S-E45 | C2 | F3 | T3 | A1 | CV1 |
| S-E46 | C2 | F3 | T3 | A1 | CV2 |
| S-E47 | C2 | F3 | T3 | A2 | CV1 |
| S-E48 | C2 | F3 | T3 | A2 | CV2 |

### 6.3 HTML Tab — 288 Combinations

Same as Web Tab (Section 6.1) — identical settings. Use `H-E001`...`H-E288` prefix.

### 6.4 Area Selection Tab — 288 Combinations

Same as Web Tab (Section 6.1) but without Viewports. Use `AS-E001`...`AS-E288` prefix.

---

## 7. Edge Cases & Special Tests

### 7.1 UI Behavior

| #     | ტესტი                                               | მოსალოდნელი                                     | სტატუსი |
| ----- | ---------------------------------------------------- | ----------------------------------------------- | ------- |
| UI-01 | Screenshot: try selecting "Website Fonts" (disabled) | Should NOT be selectable                        |         |
| UI-02 | Screenshot: try selecting "Auto Layout" (disabled)   | Should NOT be selectable, forced Absolute       |         |
| UI-03 | Area Selection: check Viewports section              | Should be HIDDEN                                |         |
| UI-04 | Screenshot: check Interactions section               | Should NOT be present                           |         |
| UI-05 | Browser Extension: check for SettingsPanel           | No settings panel, uses default config          |         |
| UI-06 | Collapse "More Options" section                      | All dropdowns should hide                       |         |
| UI-07 | Expand "More Options" section                        | All applicable dropdowns should show            |         |
| UI-08 | Click "Reset" button                                 | All settings return to defaults                 |         |
| UI-09 | Click "Save" (Save as Default)                       | Settings persist across sessions                |         |
| UI-10 | Click "Config" button                                | Opens Configuration settings panel              |         |
| UI-11 | Switch between tabs                                  | Each tab should remember its own settings       |         |
| UI-12 | Change setting on Web tab, switch to HTML            | HTML tab should have independent settings       |         |

### 7.2 Settings Persistence

| #     | ტესტი                                            | მოსალოდნელი                                    | სტატუსი |
| ----- | ------------------------------------------------- | ---------------------------------------------- | ------- |
| SP-01 | Set custom options, close & reopen plugin         | Defaults should persist (if saved)             |         |
| SP-02 | Set custom options without saving, reopen         | Should revert to saved defaults                |         |
| SP-03 | Save defaults on Web tab, check other tabs        | Other tabs should pick up global defaults      |         |
| SP-04 | Override per-tab, check sessionOverrides          | Session overrides should apply per-tab         |         |

### 7.3 Import Flow

| #     | ტესტი                                   | მოსალოდნელი                           | სტატუსი |
| ----- | ---------------------------------------- | ------------------------------------- | ------- |
| IF-01 | Web tab: valid URL import                | Successful import with settings       |         |
| IF-02 | Web tab: invalid URL                     | Error message shown                   |         |
| IF-03 | Web tab: empty URL                       | Import button disabled or error       |         |
| IF-04 | Screenshot tab: upload valid image       | Successful import                     |         |
| IF-05 | Screenshot tab: upload non-image file    | Error/rejection                       |         |
| IF-06 | HTML tab: paste valid HTML               | Successful import                     |         |
| IF-07 | HTML tab: paste empty content            | Error/rejection                       |         |
| IF-08 | Area Selection: no selection made        | Error/rejection                       |         |
| IF-09 | Browser Extension: no pending data       | Shows waiting/polling state           |         |
| IF-10 | Browser Extension: pending data available | Auto-imports                         |         |

### 7.4 Rendering Verification

| #     | Settings              | რა შევამოწმოთ                                         | სტატუსი |
| ----- | --------------------- | ----------------------------------------------------- | ------- |
| RV-01 | Colors=Plugin         | All elements use plugin color palette (grays)         |         |
| RV-02 | Colors=Website        | Elements match source website colors                  |         |
| RV-03 | Fonts=Plugin          | All text uses configured plugin font (e.g. Inter)     |         |
| RV-04 | Fonts=Website         | Text uses original website fonts                      |         |
| RV-05 | Fonts=Lines           | Text replaced with horizontal lines                   |         |
| RV-06 | Text=Semantic         | Text shows role-based placeholders                    |         |
| RV-07 | Text=Lorem            | Text replaced with Lorem Ipsum                        |         |
| RV-08 | Text=Website          | Original website text preserved                       |         |
| RV-09 | Assets=Placeholders   | Images replaced with X-cross placeholder frames       |         |
| RV-10 | Assets=Real           | Original images rendered                              |         |
| RV-11 | CSS Variables=Direct  | CSS var values resolved inline                        |         |
| RV-12 | CSS Variables=Styles  | Figma PaintStyles/TextStyles created                  |         |
| RV-13 | Layout=Auto Layout    | Frames use Figma auto-layout                          |         |
| RV-14 | Layout=Absolute       | Elements positioned with absolute coordinates         |         |
| RV-15 | Interactions=None     | No component sets or variants created                 |         |
| RV-16 | Interactions=Hover    | Hover states as component set variants                |         |

### 7.5 Cross-Setting Interactions

| #     | კომბინაცია                         | რა შევამოწმოთ                                       | სტატუსი |
| ----- | ---------------------------------- | --------------------------------------------------- | ------- |
| XI-01 | Fonts=Lines + Text=Website         | Lines show, original text length preserved           |         |
| XI-02 | Fonts=Lines + Text=Lorem           | Lines with Lorem text metrics                        |         |
| XI-03 | Colors=Plugin + Assets=Real        | Gray wireframe frames but real images                |         |
| XI-04 | Colors=Website + Assets=Placeholder | Colored frames but placeholder images               |         |
| XI-05 | Layout=Abs + Interactions=Hover    | Variants with absolute positioning                   |         |
| XI-06 | Layout=AL + Interactions=Hover     | Variants with auto-layout                            |         |
| XI-07 | CSS Vars=Styles + Colors=Plugin    | Figma styles created but with plugin colors?         |         |
| XI-08 | Fonts=Website + font unavailable   | Font fallback modal should appear                    |         |
| XI-09 | All Placeholders mode              | Plugin + Lines + Lorem + Placeholders                |         |
| XI-10 | All Real mode                      | Website + Website + Website + Real                   |         |

---

## 8. Test URLs for Web Tab

| #  | URL                              | რატომ                                       |
| -- | -------------------------------- | ------------------------------------------- |
| 1  | `https://apple.com`              | Complex layout, large images, CSS animations |
| 2  | `https://stripe.com`             | Gradients, CSS variables, modern layout     |
| 3  | `https://github.com`             | Complex nav, tables, lots of text           |
| 4  | `https://tailwindcss.com`        | Utility classes, responsive design          |
| 5  | `https://figma.com`              | Competitor reference                        |
| 6  | `https://news.ycombinator.com`   | Simple layout, minimal CSS                  |
| 7  | `https://wikipedia.org`          | Text-heavy, complex hierarchy               |
| 8  | `https://tesla.com`              | Full-bleed images, video backgrounds        |
| 9  | `https://amazon.com`             | Complex grid, many elements                 |
| 10 | `https://example.com`            | Minimal page — baseline test                |

---

## 9. Summary Statistics

| Category                           | Count   |
| ---------------------------------- | ------- |
| Import tabs                        | 5       |
| Import pages                       | 2       |
| Settings dropdowns                 | 7       |
| Viewport options                   | 5       |
| Viewport combinations              | 31      |
| Web tab setting combos             | 288     |
| Screenshot tab setting combos      | 48      |
| HTML tab setting combos            | 288     |
| Area Selection setting combos      | 288     |
| Browser Extension combos           | 1       |
| **Total setting combos (all tabs)**| **913** |
| Smoke tests                        | 28      |
| Edge case tests                    | 42      |
| Rendering verification tests       | 16      |
| Cross-setting interaction tests    | 10      |
