# Chrome Web Store Submission — Web2Wireframe Browser Extension

> Templates + checklist for submitting `web2wireframe-extension` to the
> Chrome Web Store and Edge Add-ons Store. Fill in the **TODO** markers
> before submission; the rest is already accurate.

---

## 1. Single Purpose Statement

> Chrome Web Store requires a one-sentence statement of the extension's
> single purpose. Vague descriptions get auto-rejected. Use this verbatim
> in the submission form's "Single Purpose" field.

**Statement:**

> Capture a single web page's visual structure (layout, styles, fonts,
> images, hover states) and send that structured data to the user's
> linked Web2Wireframe Figma plugin to be re-rendered as an editable
> wireframe inside Figma.

---

## 2. Detailed Description (Store Listing)

> Paste this into the "Detailed description" field. Markdown is NOT
> supported by the Chrome Web Store form — keep it plain text with
> blank-line paragraphs.

```
Web2Wireframe converts any website you visit into an editable Figma
wireframe — colors, fonts, layout, text content, images, and hover
states preserved.

WHY A BROWSER EXTENSION:
Some pages can't be captured from a public URL — they need a logged-in
session (your bank, your team's intranet, a member-only design system).
The extension runs in your browser, so it sees what you see, including
pages behind authentication.

HOW IT WORKS:
1. Install the extension and the matching Web2Wireframe plugin in Figma.
2. Open the page you want to capture.
3. Click the extension icon and press "Capture".
4. Open Figma — the wireframe appears in your linked plugin instance.

THE EXTENSION DOES NOT:
- Send anything anywhere without an explicit "Capture" click.
- Collect passwords, form data, autofill, or browsing history.
- Run on background tabs or pages you haven't asked it to capture.
- Modify the pages you visit.

WHAT IT CAPTURES (only on the page you've asked to capture):
- Layout structure (element positions, sizes, hierarchy)
- Styles (colors, fonts, borders, shadows, gradients)
- Text content
- Images and SVGs (as embedded data, not links)
- Hover states (re-runs the page briefly with :hover forced)

The captured data is sent to api.web2wireframe.design over HTTPS and
held in a short-lived queue (10 minutes) until your Figma plugin
fetches it. We never persist captured page content.

PRICING:
- Free: 10 captures per month.
- Pro: Unlimited captures, $16 per 30 days (one-time, no auto-renewal).

PRIVACY POLICY: https://www.web2wireframe.design/privacy
SUPPORT: https://www.web2wireframe.design/support
```

---

## 3. Permissions Justifications

> Chrome Web Store flags every "powerful" permission. The submission form
> has a separate text box for each one — fill them in with these. Keep
> them concrete; vague justifications get rejected.

### `debugger`

> **Why this is required:**
> The extension uses the Chrome DevTools Protocol (chrome.debugger API)
> to read computed CSS, matched-rule chains, and font fallback data that
> are not exposed through getComputedStyle. CDP gives us:
> (1) `CSS.getMatchedStylesForNode` — preserves gradients, CSS variables,
>     and `:hover` rule chains that getComputedStyle flattens away.
> (2) `CSS.getPlatformFontsForNode` — the actual font the browser
>     rendered with after fallback, not the CSS request.
> (3) `Emulation.setDeviceMetricsOverride` — capture at fixed viewports
>     (1920 / 1440 / 1024 / 768 / 375) for responsive captures.
> (4) `CSS.forcePseudoState` — re-render the page with :hover forced so
>     hover styles can be captured.
>
> The debugger session is opened ONLY against the tab the user is
> capturing, ONLY after the user clicks "Capture", and is detached
> immediately when the capture finishes. The extension shows the
> standard "Web2Wireframe is debugging this tab" banner during capture.
>
> The captured data is sent over HTTPS to api.web2wireframe.design,
> which is the extension publisher's own API. No third-party endpoint
> is ever contacted.

### `<all_urls>` host permission

> **Why this is required:**
> Users capture pages from arbitrary websites — a designer might
> capture stripe.com today and notion.so tomorrow. The extension cannot
> predict which domains a user will want to convert to wireframes, so a
> fixed allowlist would render the extension useless.
>
> The host permission is used ONLY:
> (1) On the active tab when the user clicks "Capture" — never on
>     background tabs.
> (2) For the brief duration of a capture (~3-10 seconds).
> (3) To read DOM and computed styles, NOT to inject scripts, modify
>     the page, or extract form values / passwords.
>
> The content script is matched against `<all_urls>` because it must be
> ready on the page the user wants to capture, but it remains idle and
> consumes no resources until explicitly invoked by a "Capture" click.

### `activeTab`

> **Why this is required:**
> Capture is initiated by the user clicking the extension's toolbar
> icon. activeTab is the standard, user-gesture-gated way to access
> the tab the user just clicked from — strictly narrower scope than
> the host permission, used as a defense-in-depth check that the
> capture target is the foreground tab.

### `scripting`

> **Why this is required:**
> The extension needs to inject the content script's extraction
> module into the captured tab to read DOM structure and computed
> styles. This is the standard chrome.scripting.executeScript pattern
> used by every modern Manifest V3 extension that needs runtime DOM
> access.

### `storage`

> **Why this is required:**
> Stores user preferences (pairing code with the Figma plugin,
> capture viewport defaults, theme). No sensitive data — pairing
> codes are short-lived tokens, not credentials.

### `downloads`

> **Why this is required:**
> Allows the user to download the captured assets as a ZIP (fonts,
> images, raw SVGs) for backup. Optional flow — only triggered by
> the user pressing a "Download backup" button in the popup.

---

## 4. Privacy Practices (Privacy Tab)

> Chrome Web Store has a structured form for this. Click each checkbox
> that matches; the disclosures must align with our Privacy Policy at
> https://www.web2wireframe.design/privacy.

### Data Usage Disclosures (check these)

- [x] **Website content** — captured page DOM, styles, fonts, images.
      Used ONLY for the user's stated purpose (sent to user's Figma plugin).
      Not sold. Not shared. Not used to determine creditworthiness.
- [x] **Personal communications** — N/A (we do not read messages/emails)
- [x] **Authentication info** — N/A (we do not read passwords)
- [x] **Personal info** — pairing-code value stored in chrome.storage
      (short-lived, not PII)

### Certifications (check these)

- [x] I do NOT sell or transfer user data to third parties, outside of
      the approved use cases described in the Privacy Policy
- [x] I do NOT use or transfer user data for purposes unrelated to the
      extension's single purpose
- [x] I do NOT use or transfer user data to determine creditworthiness
      or for lending purposes

### Privacy Policy URL

```
https://www.web2wireframe.design/privacy
```

---

## 5. Store Listing — visual assets

> Chrome Web Store requires specific sizes. Edge Add-ons reuses most.

| Asset | Chrome Web Store | Edge Add-ons | Status |
|-------|------------------|--------------|--------|
| Extension icon (128×128 PNG) | required | required | ✅ `public/icons/icon128.png` |
| Small promo tile (440×280 PNG) | required | required | **TODO** — design 1 |
| Marquee promo tile (1400×560 PNG) | optional but recommended | optional | **TODO** — design 1 |
| Screenshot 1 (1280×800 or 640×400 PNG) | at least 1 required | at least 1 required | **TODO** — extension popup with "Capture" button |
| Screenshot 2 | optional | optional | **TODO** — captured page → Figma wireframe before/after |
| Screenshot 3 | optional | optional | **TODO** — pairing flow with the Figma plugin |
| Screenshot 4 | optional | optional | **TODO** — multi-viewport (1920/1440/375) capture result |
| Screenshot 5 | optional | optional | **TODO** — options page with pairing-code entry |

**Design tip:** screenshots must show only the extension UI or its
direct effect on Figma. Generic landing-page screenshots get rejected.

---

## 6. Submission Metadata

| Field | Value |
|-------|-------|
| Extension name | Web2Wireframe |
| Short summary (132 char max) | Capture any website and convert it to an editable Figma wireframe — colors, fonts, layout, hover states preserved. |
| Category | Developer Tools |
| Language | English |
| Visibility | Public |
| Pricing | Free (Pro features unlocked via paired Figma plugin subscription) |
| Distribution | All regions |

---

## 7. Edge Add-ons Store specifics

Edge accepts the same `.zip` file. Differences from Chrome:

- No $5 fee (free submission)
- Privacy form is shorter (covered by the same Privacy Policy URL)
- "Single Purpose" field is called "Description summary" — paste the
  same text
- Review time: 1-3 business days (Chrome is 1-7)
- Permissions justifications: free-form text box (paste section 3 here)

---

## 8. Pre-submission Checklist

### Code-side
- [ ] `pnpm --filter web2wireframe-extension build` runs clean (no TS errors)
- [ ] `dist/manifest.json` matches `src/manifest.json` field-for-field
- [ ] `dist/background/index.js` is the actual service worker (not chunked)
- [ ] `dist/content/index.js` exists and is the extractor entry
- [ ] `dist/popup/index.html` opens locally (load unpacked → click icon)
- [ ] `dist/options/index.html` opens locally (chrome://extensions → Details → Extension options)
- [ ] All `dist/icons/*` files exist at the paths declared in manifest
- [ ] No `console.log` of secrets in the built bundle (`grep -r "secret\|token" dist/`)
- [ ] No `localhost` or `127.0.0.1` left in the production build
- [ ] Source maps **excluded** from the published ZIP (they help debugging
      but bloat the package and expose internals)

### Manual QA
- [ ] Load unpacked in Chrome dev mode → "Capture" works on
      `https://web2wireframe.design`
- [ ] Capture works on a logged-in page (e.g. your own GitHub)
- [ ] Permissions banner appears correctly on first install
- [ ] "Web2Wireframe is debugging this tab" yellow bar appears during
      capture and disappears after
- [ ] Pairing code from popup successfully links with the Figma plugin
- [ ] Options page saves preferences across browser restart

### Store account
- [ ] Chrome Web Store developer account ($5 one-time fee paid)
- [ ] Edge Add-ons partner account (free, sign in with Microsoft)
- [ ] 2FA enabled on both accounts
- [ ] Public-facing email set (used in support replies)

### Legal
- [ ] Privacy Policy live at https://www.web2wireframe.design/privacy
- [ ] Terms of Service live at https://www.web2wireframe.design/terms
- [ ] EULA (if any) accessible from extension popup or store listing

---

## 9. Submission flow

1. **Build** — `pnpm --filter web2wireframe-extension build`
2. **Zip** — `cd dist && zip -r ../web2wireframe-extension-v1.0.0.zip .`
3. **Chrome Web Store** — https://chrome.google.com/webstore/devconsole
   - "New Item" → upload ZIP
   - Fill store listing using sections 2, 4, 5, 6 above
   - Fill privacy form using section 4
   - Submit for review (1-7 days)
4. **Edge Add-ons** — https://partner.microsoft.com/dashboard/microsoftedge
   - "Submit new extension" → upload same ZIP
   - Reuse listing copy
   - Submit (1-3 days)

---

## 10. Post-approval

When approved by Chrome:
- [ ] Note the assigned Extension ID (e.g. `abcdef…128 chars`)
- [ ] Update `packages/figma-plugin` Help modal if it references the extension URL
- [ ] Update `docs/runbooks/billing-faq.md` if it references "install the extension"
- [ ] Update `packages/web/src/data/links.ts` `installLinks.chrome` from
      placeholder to `https://chrome.google.com/webstore/detail/<EXTENSION_ID>`
- [ ] Announce in Figma plugin release notes
- [ ] Monitor Chrome Web Store reviews for first 7 days — respond to
      negative reviews within 24h
