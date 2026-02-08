# Browser Extension UI/UX გეგმა v3

> სრული რედიზაინი - Final Version (Updated)

---

## ახალი დიზაინი - Final Layout

```
┌─────────────────────────────────────────────────────────┐
│  [W] Web2Wireframe                                      │ Header
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────┐      ┌─────────┐      ┌─────────┐         │
│  │░░░░░░░░░│  →   │   [W]   │  →   │─────────│         │ Visual Flow
│  │░MOCKUP░░│      │  LOGO   │      │─────────│         │ (Mockup → Logo → Wireframe Mockup)
│  │░░░░░░░░░│      │         │      │─────────│         │
│  └─────────┘      └─────────┘      └─────────┘         │
│   Page             Web2Wireframe    Wireframe           │
│                                                         │
│  VIEWPORTS                                              │
│  ☑ [1920] px  ☑ [1440] px  ☐ [1024] px                 │ Editable inputs
│  ☐ [768 ] px  ☐ [390 ] px                              │
│                                                         │
│  SAVE OPTIONS                                           │
│  ┌──────────────────┐ ┌──────────────────┐             │
│  │ 💾 Save locally  │ │ 🔒 Send to Figma │             │ Toggle buttons
│  │    [active]      │ │    [disabled]    │             │
│  └──────────────────┘ └──────────────────┘             │
│                                                         │
│  ┌─────────────────────────────────────────┐           │
│  │  📄  Capture Page                        │           │ Primary button
│  └─────────────────────────────────────────┘           │
│                                                         │
│  Capture Area:                                          │
│  ┌─────────────────┐ ┌─────────────────┐               │
│  │ ✂️ Select Area   │ │ 🎯 Pick Element │               │ Two options
│  └─────────────────┘ └─────────────────┘               │
│                                                         │
├─────────────────────────────────────────────────────────┤
│       [👑 Plan]                 [❓ Help]               │ Footer (2 icons only)
└─────────────────────────────────────────────────────────┘

Width: 360px
Height: ~520px
```

---

## განახლებული მოთხოვნები

### 1. Visual Flow
- **Mockup-ები** გამოვიყენოთ (არა რეალური screenshot)
- Static placeholder images page-ისთვის და wireframe-ისთვის

### 2. Viewports
- 5 editable input-ი
- Default values: 1920, 1440, 1024, 768, 390
- html.to.design-ის ფუნქციონალი, განსხვავებული დიზაინით

### 3. Save Options
- "Save locally" - active (default)
- "Send to Figma" - disabled (მომავლისთვის)

### 4. Capture Buttons
- **Capture Page** - Primary, სრული page capture
- **Capture Area** - ორი ვარიანტი:
  - Selection tool (mouse-ით rectangle)
  - Element picker (კონკრეტული element)

### 5. Footer (მხოლოდ 2 icon!)
- **Plan icon** (👑) → Plan Modal
- **Help icon** (❓) → Help Modal
- ❌ NO Settings icon

### 6. Help Modal
```
┌─────────────────────────────────────┐
│  Need help?                     ✕   │
├─────────────────────────────────────┤
│                                     │
│  📄  See our Docs                   │
│                                     │
│  💬  Contact us                     │
│                                     │
│  🔌  Open Plugin                    │
│      (goes to Figma plugin)         │
│                                     │
│  💰  Pricing                        │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  📧  Subscribe to our news          │
│  ┌──────────────────┐  ┌─────────┐  │
│  │ your@email.com   │  │Subscribe│  │
│  └──────────────────┘  └─────────┘  │
│                                     │
└─────────────────────────────────────┘
```

### 7. Plan Modal
- Plan info (Free/Pro status)
- Features list
- Upgrade button → pricing page

---

## დეტალური იმპლემენტაციის გეგმა

---

### 1. VISUAL FLOW SECTION (Mockup → Logo → Wireframe Mockup)

#### რა უნდა გავაკეთოთ:
- 3 ელემენტი ჰორიზონტალურად: `[Mockup] → [Logo] → [Wireframe Mockup]`
- ისრები ელემენტებს შორის
- Static mockup images (არა რეალური CDP screenshot)

#### UI Component:
```tsx
<div class="visual-flow">
  <div class="flow-item">
    <div class="flow-image">
      <PageMockupIcon />
    </div>
    <span class="flow-label">Page</span>
  </div>

  <ArrowIcon class="flow-arrow" />

  <div class="flow-item">
    <div class="flow-image logo-container">
      <LogoIcon />
    </div>
    <span class="flow-label">Web2Wireframe</span>
  </div>

  <ArrowIcon class="flow-arrow" />

  <div class="flow-item">
    <div class="flow-image wireframe-preview">
      <WireframeMockupIcon />
    </div>
    <span class="flow-label">Wireframe</span>
  </div>
</div>
```

#### CSS:
```css
.visual-flow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius);
}

.flow-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.flow-image {
  width: 72px;
  height: 56px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
}

.flow-label {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.flow-arrow {
  color: var(--color-text-secondary);
  flex-shrink: 0;
}
```

---

### 2. VIEWPORTS - Editable Inputs

#### State:
```typescript
interface ViewportItem {
  enabled: boolean;
  width: number;
}

const [viewports, setViewports] = useState<ViewportItem[]>([
  { enabled: true, width: 1920 },
  { enabled: true, width: 1440 },
  { enabled: false, width: 1024 },
  { enabled: false, width: 768 },
  { enabled: false, width: 390 },
]);
```

#### UI Component:
```tsx
<div class="viewports-section">
  <label class="section-label">Viewports</label>
  <div class="viewports-grid">
    {viewports.map((vp, index) => (
      <div class="viewport-item" key={index}>
        <input
          type="checkbox"
          checked={vp.enabled}
          onChange={() => toggleViewport(index)}
          class="viewport-checkbox"
        />
        <input
          type="number"
          value={vp.width}
          onChange={(e) => updateViewportWidth(index, e.target.value)}
          class="viewport-input"
          min="320"
          max="2560"
        />
        <span class="viewport-unit">px</span>
      </div>
    ))}
  </div>
</div>
```

#### CSS:
```css
.viewports-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.viewport-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.viewport-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--color-primary);
}

.viewport-input {
  width: 60px;
  padding: 6px 8px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 13px;
  text-align: right;
}

.viewport-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.viewport-unit {
  font-size: 12px;
  color: var(--color-text-secondary);
}
```

---

### 3. SAVE OPTIONS

#### State:
```typescript
type SaveOption = 'local' | 'figma';
const [saveOption, setSaveOption] = useState<SaveOption>('local');
```

#### UI Component:
```tsx
<div class="save-options">
  <label class="section-label">Save Options</label>
  <div class="option-buttons">
    <button
      class={`option-btn ${saveOption === 'local' ? 'active' : ''}`}
      onClick={() => setSaveOption('local')}
    >
      <SaveIcon />
      <span>Save locally</span>
    </button>
    <button
      class="option-btn disabled"
      disabled
      title="Coming soon"
    >
      <FigmaIcon />
      <span>Send to Figma</span>
    </button>
  </div>
</div>
```

---

### 4. CAPTURE BUTTONS

#### Capture Page - Primary:
```tsx
<button
  class="btn btn-primary capture-btn"
  onClick={handleCapturePage}
  disabled={!canCapture || isCapturing}
>
  <DocumentIcon />
  <span>{isCapturing ? 'Capturing...' : 'Capture Page'}</span>
</button>
```

#### Capture Area - Two Options:
```tsx
<div class="capture-area-section">
  <label class="section-label">Capture Area</label>
  <div class="capture-area-buttons">
    <button
      class="btn btn-secondary"
      onClick={handleSelectArea}
      disabled={isCapturing}
    >
      <SelectionIcon />
      <span>Select Area</span>
    </button>
    <button
      class="btn btn-secondary"
      onClick={handlePickElement}
      disabled={isCapturing}
    >
      <TargetIcon />
      <span>Pick Element</span>
    </button>
  </div>
</div>
```

#### Capture Area Implementation:

**Select Area (Rectangle Selection):**
```typescript
const handleSelectArea = async () => {
  // 1. Close popup
  // 2. Inject selection overlay to page
  // 3. User draws rectangle with mouse
  // 4. Capture only that area
  await chrome.tabs.sendMessage(tabId, { type: 'START_AREA_SELECTION' });
  window.close();
};
```

**Pick Element:**
```typescript
const handlePickElement = async () => {
  // 1. Close popup
  // 2. Inject element picker overlay
  // 3. User hovers and clicks element
  // 4. Get element bounds and capture
  await chrome.tabs.sendMessage(tabId, { type: 'START_ELEMENT_PICKER' });
  window.close();
};
```

---

### 5. FOOTER (Only 2 Icons)

```tsx
<footer class="popup-footer">
  <button
    class="footer-icon"
    onClick={() => setShowPlanModal(true)}
    title="Plan"
  >
    <CrownIcon />
  </button>

  <button
    class="footer-icon"
    onClick={() => setShowHelpModal(true)}
    title="Help"
  >
    <HelpIcon />
  </button>
</footer>
```

#### CSS:
```css
.popup-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 10px 16px;
  border-top: 1px solid var(--color-border);
}

.footer-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: all 0.2s ease;
}

.footer-icon:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
```

---

### 6. HELP MODAL

```tsx
{showHelpModal && (
  <div class="modal-overlay" onClick={() => setShowHelpModal(false)}>
    <div class="modal-content help-modal" onClick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h2>Need help?</h2>
        <button class="modal-close" onClick={() => setShowHelpModal(false)}>
          <CloseIcon />
        </button>
      </div>

      <div class="modal-body">
        <div class="help-links">
          <a href="https://web2wireframe.design/docs" target="_blank" class="help-link">
            <DocsIcon />
            <span>See our Docs</span>
          </a>

          <a href="https://web2wireframe.design/contact" target="_blank" class="help-link">
            <ContactIcon />
            <span>Contact us</span>
          </a>

          <a href="https://www.figma.com/community/plugin/XXX" target="_blank" class="help-link">
            <PluginIcon />
            <span>Open Plugin</span>
          </a>

          <a href="https://web2wireframe.design/pricing" target="_blank" class="help-link">
            <PricingIcon />
            <span>Pricing</span>
          </a>
        </div>

        <div class="subscribe-section">
          <label>Subscribe to our news</label>
          <div class="subscribe-form">
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button onClick={handleSubscribe}>Subscribe</button>
          </div>
        </div>
      </div>
    </div>
  </div>
)}
```

#### CSS:
```css
.help-links {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.help-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  color: var(--color-text);
  text-decoration: none;
  transition: background 0.15s ease;
}

.help-link:hover {
  background: var(--color-bg-hover);
}

.help-link svg {
  width: 20px;
  height: 20px;
  opacity: 0.7;
}

.subscribe-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
}

.subscribe-section label {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
  display: block;
}

.subscribe-form {
  display: flex;
  gap: 8px;
}

.subscribe-form input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 13px;
}

.subscribe-form button {
  padding: 8px 16px;
  background: var(--color-primary);
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 13px;
  cursor: pointer;
}
```

---

### 7. PLAN MODAL

```tsx
{showPlanModal && (
  <div class="modal-overlay" onClick={() => setShowPlanModal(false)}>
    <div class="modal-content" onClick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h2>Your Plan</h2>
        <button class="modal-close" onClick={() => setShowPlanModal(false)}>
          <CloseIcon />
        </button>
      </div>

      <div class="modal-body">
        <div class="plan-info">
          <div class="plan-badge free">Free</div>
          <p class="plan-description">
            You're on the free plan with limited features.
          </p>
        </div>

        <ul class="plan-features">
          <li><CheckIcon /> Basic wireframe export</li>
          <li><CheckIcon /> 2 viewports</li>
          <li><XIcon /> Full color & font access</li>
          <li><XIcon /> All viewports</li>
          <li><XIcon /> Real text content</li>
        </ul>
      </div>

      <div class="modal-footer">
        <button
          class="btn btn-primary"
          onClick={() => window.open('https://web2wireframe.design/pricing', '_blank')}
        >
          Upgrade Plan
        </button>
      </div>
    </div>
  </div>
)}
```

---

## SVG Icons საჭირო

```tsx
// icons.tsx

export const CrownIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14" />
  </svg>
);

export const HelpIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

export const DocsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

export const ContactIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export const PluginIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M12 2v6m0 8v6M2 12h6m8 0h6" />
    <circle cx="12" cy="12" r="4" />
  </svg>
);

export const PricingIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

export const TargetIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

export const SelectionIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M5 3h4M3 5v4M19 3h2v2M21 19v2h-2M3 19v2h2M15 21h4" />
    <rect x="7" y="7" width="10" height="10" rx="1" stroke-dasharray="3 2" />
  </svg>
);

export const DocumentIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

export const SaveIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);

export const FigmaIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z" />
    <path d="M12 2h3.5a3.5 3.5 0 1 1 0 7H12V2z" />
    <path d="M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z" />
    <path d="M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z" />
    <path d="M5 12.5A3.5 3.5 0 0 1 8.5 9H12v7H8.5A3.5 3.5 0 0 1 5 12.5z" />
  </svg>
);

export const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

export const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" width="16" height="16">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" width="16" height="16">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const PageMockupIcon = () => (
  <svg viewBox="0 0 72 56" fill="none">
    <rect x="1" y="1" width="70" height="54" rx="4" fill="#f8fafc" stroke="#e2e8f0"/>
    <rect x="8" y="8" width="56" height="8" rx="2" fill="#e2e8f0"/>
    <rect x="8" y="20" width="24" height="28" rx="2" fill="#cbd5e1"/>
    <rect x="36" y="20" width="28" height="12" rx="2" fill="#e2e8f0"/>
    <rect x="36" y="36" width="28" height="12" rx="2" fill="#e2e8f0"/>
  </svg>
);

export const WireframeMockupIcon = () => (
  <svg viewBox="0 0 72 56" fill="none">
    <rect x="1" y="1" width="70" height="54" rx="4" fill="#1e3a47" stroke="#2d4a57"/>
    <rect x="8" y="8" width="56" height="8" rx="2" fill="#2d4a57"/>
    <rect x="8" y="20" width="24" height="28" rx="2" stroke="#4a6572" stroke-width="1.5" stroke-dasharray="4 2"/>
    <rect x="36" y="20" width="28" height="12" rx="2" stroke="#4a6572" stroke-width="1.5" stroke-dasharray="4 2"/>
    <rect x="36" y="36" width="28" height="12" rx="2" stroke="#4a6572" stroke-width="1.5" stroke-dasharray="4 2"/>
  </svg>
);

export const LogoIcon = () => (
  <svg viewBox="0 0 72 56" fill="none">
    <rect x="1" y="1" width="70" height="54" rx="4" fill="#f4a261" stroke="#e76f51"/>
    <text x="36" y="35" text-anchor="middle" fill="white" font-size="20" font-weight="bold">W</text>
  </svg>
);
```

---

## ფაილების სტრუქტურა

```
Browser_Extension/src/
├── popup/
│   ├── App.tsx              ← სრული რეფაქტორინგი
│   ├── components/
│   │   ├── VisualFlow.tsx       ← NEW
│   │   ├── ViewportsSection.tsx ← NEW
│   │   ├── SaveOptions.tsx      ← NEW
│   │   ├── CaptureButtons.tsx   ← NEW
│   │   ├── CaptureArea.tsx      ← NEW
│   │   ├── Footer.tsx           ← NEW
│   │   ├── HelpModal.tsx        ← NEW
│   │   ├── PlanModal.tsx        ← NEW
│   │   └── Icons.tsx            ← NEW (ყველა SVG icon)
│   └── main.tsx
├── content/
│   ├── areaSelector.ts          ← NEW (rectangle selection)
│   └── elementPicker.ts         ← NEW (element hover/click)
├── styles/
│   └── global.css               ← ახალი სტილები
└── background/
    └── index.ts                 ← message handlers
```

---

## იმპლემენტაციის თანმიმდევრობა

### Phase 1: UI Shell
1. [ ] Popup width/height გაზრდა (360x520)
2. [ ] Icons.tsx შექმნა (ყველა icon)
3. [ ] ახალი CSS სტილები
4. [ ] VisualFlow component (mockup-ებით)
5. [ ] ViewportsSection component
6. [ ] SaveOptions component
7. [ ] CaptureButtons component (Capture Page only)
8. [ ] Footer component (2 icons)
9. [ ] HelpModal component
10. [ ] PlanModal component
11. [ ] App.tsx რესტრუქტურიზაცია

### Phase 2: Capture Area
12. [ ] CaptureArea section UI
13. [ ] Content script: areaSelector.ts
14. [ ] Content script: elementPicker.ts
15. [ ] Background message handlers
16. [ ] Partial page capture logic

### Phase 3: Polish
17. [ ] Animations/transitions
18. [ ] Loading states
19. [ ] Error handling
20. [ ] State persistence (chrome.storage)
21. [ ] Testing

---

## Content Scripts - Capture Area

### areaSelector.ts (Rectangle Selection)
```typescript
// Inject overlay, track mouse drag, return bounds
export function startAreaSelection(): Promise<{x: number, y: number, width: number, height: number}> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 999999;
      cursor: crosshair;
      background: rgba(0,0,0,0.3);
    `;

    let startX = 0, startY = 0;
    let selectionBox: HTMLDivElement | null = null;

    overlay.addEventListener('mousedown', (e) => {
      startX = e.clientX;
      startY = e.clientY;

      selectionBox = document.createElement('div');
      selectionBox.style.cssText = `
        position: fixed;
        border: 2px dashed #f4a261;
        background: rgba(244, 162, 97, 0.1);
        pointer-events: none;
      `;
      document.body.appendChild(selectionBox);
    });

    overlay.addEventListener('mousemove', (e) => {
      if (!selectionBox) return;
      const currentX = e.clientX;
      const currentY = e.clientY;

      selectionBox.style.left = Math.min(startX, currentX) + 'px';
      selectionBox.style.top = Math.min(startY, currentY) + 'px';
      selectionBox.style.width = Math.abs(currentX - startX) + 'px';
      selectionBox.style.height = Math.abs(currentY - startY) + 'px';
    });

    overlay.addEventListener('mouseup', (e) => {
      overlay.remove();
      selectionBox?.remove();

      resolve({
        x: Math.min(startX, e.clientX),
        y: Math.min(startY, e.clientY),
        width: Math.abs(e.clientX - startX),
        height: Math.abs(e.clientY - startY)
      });
    });

    document.body.appendChild(overlay);
  });
}
```

### elementPicker.ts (Element Selection)
```typescript
// Highlight elements on hover, return element on click
export function startElementPicker(): Promise<{selector: string, bounds: DOMRect}> {
  return new Promise((resolve) => {
    let highlightBox: HTMLDivElement | null = null;
    let currentElement: Element | null = null;

    const highlight = document.createElement('div');
    highlight.style.cssText = `
      position: fixed;
      border: 2px solid #f4a261;
      background: rgba(244, 162, 97, 0.2);
      pointer-events: none;
      z-index: 999999;
      transition: all 0.1s ease;
    `;
    document.body.appendChild(highlight);

    const handleMove = (e: MouseEvent) => {
      const element = document.elementFromPoint(e.clientX, e.clientY);
      if (!element || element === highlight) return;

      currentElement = element;
      const rect = element.getBoundingClientRect();

      highlight.style.left = rect.left + 'px';
      highlight.style.top = rect.top + 'px';
      highlight.style.width = rect.width + 'px';
      highlight.style.height = rect.height + 'px';
    };

    const handleClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('click', handleClick, true);
      highlight.remove();

      if (currentElement) {
        resolve({
          selector: getUniqueSelector(currentElement),
          bounds: currentElement.getBoundingClientRect()
        });
      }
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('click', handleClick, true);
  });
}

function getUniqueSelector(element: Element): string {
  // Generate unique CSS selector for element
  if (element.id) return `#${element.id}`;
  // ... more logic
  return element.tagName.toLowerCase();
}
```

---

**დოკუმენტი განახლებულია**: 2026-02-08
**ვერსია**: 3.0
