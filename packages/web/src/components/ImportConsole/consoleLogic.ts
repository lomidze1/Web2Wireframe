/**
 * Pure derivation logic for the interactive import console — a faithful port
 * of the design prototype's DCLogic class ("Web2Wireframe Site.dc.html").
 * Every value the console renders (palette, copy, frame metrics, layer list,
 * summary line, pricing) is a pure function of this state, so the whole
 * centerpiece stays instant and testable. No network, no side effects.
 */

export type SourceMode = "url" | "screenshot" | "html" | "area";
export type ViewportMode = "1440" | "768" | "375";
export type LayoutMode = "auto" | "absolute";
export type TextMode = "semantic" | "lorem" | "website";
export type AssetsMode = "placeholder" | "real";
export type ColorsMode = "plugin" | "website";
export type FontsMode = "plugin" | "website";
export type VarsMode = "direct" | "figma";
export type BillingMode = "monthly" | "annual";

export interface ConsoleState {
  source: SourceMode;
  viewport: ViewportMode;
  layout: LayoutMode;
  text: TextMode;
  assets: AssetsMode;
  colors: ColorsMode;
  fonts: FontsMode;
  vars: VarsMode;
}

export const DEFAULT_CONSOLE_STATE: ConsoleState = {
  source: "url",
  viewport: "1440",
  layout: "auto",
  text: "semantic",
  assets: "placeholder",
  colors: "plugin",
  fonts: "plugin",
  vars: "direct",
};

export interface Palette {
  text: string;
  bg: string;
  secondary: string;
  surface: string;
  accent: string;
}

export const PALETTES: Record<ColorsMode, Palette> = {
  plugin: {
    text: "#1f2124",
    bg: "#ffffff",
    secondary: "#d6d4d1",
    surface: "#f2f1ef",
    accent: "#54524e",
  },
  website: {
    text: "#0f1729",
    bg: "#ffffff",
    secondary: "#c9d3e0",
    surface: "#eef2f8",
    accent: "#2f5fd8",
  },
};

export function getPalette(colors: ColorsMode): Palette {
  return PALETTES[colors];
}

export function getPaletteLabel(colors: ColorsMode): string {
  return colors === "plugin"
    ? "plugin defaults, editable"
    : "detected on the source page";
}

export interface MockCard {
  title: string;
  body: string;
}

export interface CopySet {
  nav1: string;
  nav2: string;
  nav3: string;
  h1: string;
  p: string;
  cta: string;
  cards: MockCard[];
}

const COPY_SETS: Record<TextMode, CopySet> = {
  semantic: {
    nav1: "Link",
    nav2: "Link",
    nav3: "Link",
    h1: "Heading 1",
    p: "Paragraph — two lines of body text at the original measure.",
    cta: "Button",
    cards: [
      { title: "Heading 3", body: "Paragraph" },
      { title: "Heading 3", body: "Paragraph" },
      { title: "Heading 3", body: "Paragraph" },
    ],
  },
  lorem: {
    nav1: "Lorem",
    nav2: "Ipsum",
    nav3: "Dolor",
    h1: "Lorem ipsum dolor sit amet",
    p: "Consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore.",
    cta: "Lorem ipsum",
    cards: [
      { title: "Lorem ipsum", body: "Dolor sit amet consectetur adipiscing." },
      { title: "Sed do eiusmod", body: "Tempor incididunt ut labore et dolore." },
      { title: "Magna aliqua", body: "Ut enim ad minim veniam quis nostrud." },
    ],
  },
  website: {
    nav1: "Product",
    nav2: "Pricing",
    nav3: "Docs",
    h1: "Close the books before the board asks",
    p: "Northwind turns four ledgers into one board-ready brief, in an afternoon.",
    cta: "Start free trial",
    cards: [
      { title: "Ledger sync", body: "Connect once; every figure updates itself overnight." },
      { title: "Variance notes", body: "Explanations written where the numbers moved." },
      { title: "Board export", body: "One PDF, in the format your chair already reads." },
    ],
  },
};

export function getCopy(text: TextMode): CopySet {
  return COPY_SETS[text];
}

export interface FrameMetrics {
  w: string;
  label: string;
  padSm: string;
  padLg: string;
  padX: string;
  gap: string;
  fsH1: string;
  fsBody: string;
  fsMicro: string;
  btnPad: string;
  mediaH: string;
  cardCols: string;
}

export const FRAMES: Record<ViewportMode, FrameMetrics> = {
  "1440": {
    w: "620px",
    label: "Landing — 1440 × 3120",
    padSm: "13px 18px",
    padLg: "26px 30px",
    padX: "30px",
    gap: "13px",
    fsH1: "25px",
    fsBody: "12.5px",
    fsMicro: "10.5px",
    btnPad: "9px 16px",
    mediaH: "112px",
    cardCols: "1fr 1fr 1fr",
  },
  "768": {
    w: "400px",
    label: "Landing — 768 × 3860",
    padSm: "12px 14px",
    padLg: "26px 20px",
    padX: "20px",
    gap: "12px",
    fsH1: "21px",
    fsBody: "11.5px",
    fsMicro: "10px",
    btnPad: "8px 14px",
    mediaH: "120px",
    cardCols: "1fr 1fr",
  },
  "375": {
    w: "260px",
    label: "Landing — 375 × 5240",
    padSm: "10px 12px",
    padLg: "20px 16px",
    padX: "16px",
    gap: "10px",
    fsH1: "17px",
    fsBody: "11px",
    fsMicro: "9.5px",
    btnPad: "7px 12px",
    mediaH: "96px",
    cardCols: "1fr",
  },
};

export const SOURCE_HINTS: Record<SourceMode, string> = {
  url: "https://northwind.example/pricing — public pages, fetched and parsed live.",
  screenshot:
    "Drop a PNG or JPG. Structure is inferred from the image — the way most people use this.",
  html: "Paste markup and styles straight from devtools, or a saved page.",
  area: "Draw a rectangle on the page in the browser extension; only that region imports.",
};

export function getFontStack(fonts: FontsMode): string {
  return fonts === "plugin"
    ? "Inter, system-ui, sans-serif"
    : "Georgia, 'Times New Roman', serif";
}

export interface Layer {
  name: string;
  pad: string;
  tag: string;
}

export function deriveLayers(state: ConsoleState): Layer[] {
  const pal = getPalette(state.colors);
  const lay = state.layout === "auto" ? "auto layout" : "absolute";
  const accentTag =
    state.vars === "figma"
      ? state.colors === "website"
        ? "--color-primary"
        : "color/accent"
      : pal.accent.toUpperCase();
  return [
    { name: `Landing — ${state.viewport}`, pad: "12px", tag: "frame" },
    { name: "nav", pad: "22px", tag: lay },
    { name: "hero", pad: "22px", tag: lay },
    { name: "heading", pad: "34px", tag: state.text === "website" ? "text · h1" : "text" },
    { name: "paragraph", pad: "34px", tag: "text" },
    { name: "button", pad: "34px", tag: accentTag },
    { name: "media", pad: "22px", tag: state.assets === "real" ? "image · fill" : "placeholder" },
    { name: "cards", pad: "22px", tag: `${lay} · 3` },
  ];
}

export function deriveLayerNote(layout: LayoutMode): string {
  return layout === "auto"
    ? "Sections, rows and columns arrive as auto layout frames with the spacing they had on the page."
    : "Every layer keeps the exact x/y it was captured at — a faithful snapshot that won't reflow.";
}

export function deriveSummary(state: ConsoleState): string {
  return [
    `${state.viewport}px`,
    state.layout === "auto" ? "auto layout" : "absolute",
    state.colors === "plugin" ? "plugin palette" : "site palette",
    state.vars === "figma" ? "figma variables" : "direct values",
  ].join("  ·  ");
}

export interface PriceInfo {
  monthly: string;
  annual: string;
  perMonth: string;
  savePct: string;
  big: string;
  unit: string;
  note: string;
  badge: string;
}

export function derivePrice(
  billing: BillingMode,
  monthly = 16,
  annual = 144,
): PriceInfo {
  const perMonth = Math.round((annual / 12) * 100) / 100;
  const savePct = `${Math.round((1 - annual / (monthly * 12)) * 100)}%`;
  return {
    monthly: `$${monthly}`,
    annual: `$${annual}`,
    perMonth: `$${perMonth}`,
    savePct,
    big: billing === "annual" ? `$${perMonth}` : `$${monthly}`,
    unit: billing === "annual" ? "per month, paid once a year" : "per month",
    // One-time payment model — no subscription, no auto-renewal.
    note:
      billing === "annual"
        ? `$${annual} once for 365 days — ${savePct} off the monthly rate. One-time payment, no auto-renewal.`
        : `$${monthly} once for 30 days, unlimited imports. One-time payment, no auto-renewal.`,
    badge: billing === "annual" ? `save ${savePct}` : "unlimited",
  };
}
