/**
 * CSS property extraction constants and pre-capture style injection.
 *
 * 70+ CSS properties captured via getComputedStyle(),
 * with pre-capture styles injected to freeze animations and hide UI artifacts.
 */

// ---------------------------------------------------------------------------
// CSS Properties to extract (camelCase matching CSSStyleDeclaration)
// ---------------------------------------------------------------------------

/**
 * Properties extracted via getComputedStyle().
 * Only non-default values are stored in the output.
 */
export const CSS_PROPERTIES: readonly string[] = [
  // Layout
  'display', 'flexDirection', 'flexWrap', 'flexGrow', 'flexShrink',
  'flexBasis', 'alignItems', 'alignSelf', 'justifyContent', 'gap', 'order',

  // Grid
  'gridTemplateColumns', 'gridTemplateRows', 'gridAutoFlow', 'gridArea',

  // Size
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'aspectRatio', 'boxSizing',

  // Position
  'position', 'left', 'top', 'right', 'bottom', 'zIndex',

  // Spacing (individual padding — getComputedStyle returns these, not shorthand)
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'rowGap', 'columnGap',

  // Background
  'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition',
  'backgroundRepeat', 'backgroundClip', 'backgroundOrigin', 'backgroundBlendMode',

  // Border
  'borderWidth', 'borderStyle', 'borderColor',
  'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',

  // Typography
  'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
  'textAlign', 'textDecoration', 'textDecorationLine', 'textOverflow',
  'whiteSpace', 'color', 'webkitTextFillColor', 'webkitTextStrokeColor',
  'webkitTextStrokeWidth', 'listStyleType',

  // Visual
  'opacity', 'boxShadow', 'filter', 'backdropFilter', 'clipPath',
  'transform', 'transformOrigin', 'overflow', 'overflowX', 'overflowY',
  'objectFit', 'objectPosition', 'mixBlendMode', 'visibility',

  // Outline
  'outlineColor', 'outlineStyle', 'outlineWidth', 'outlineOffset',

  // Content (pseudo-elements)
  'content',

  // SVG
  'fill',

  // Direction
  'direction', 'writingMode',
];

/**
 * Properties that should be stored as numbers, not strings.
 */
export const NUMERIC_PROPERTIES = new Set([
  'opacity', 'flexGrow', 'flexShrink', 'order',
  // zIndex: intentionally NOT numeric — stored as string
]);

/**
 * Properties where `computedStyleMap()` should be used to detect `auto` keyword.
 * getComputedStyle() resolves these to pixel values, losing the `auto` distinction.
 */
export const AUTO_DETECT_PROPERTIES = new Set([
  'width', 'height', 'left', 'top', 'right', 'bottom',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'gridTemplateColumns', 'gridTemplateRows',
]);

/**
 * Default values for common CSS properties.
 * Used to filter out properties that match their user-agent default.
 */
/**
 * Default values for common CSS properties.
 * Used to filter out properties that match their user-agent default.
 *
 * NOTE: Some properties are intentionally OMITTED to force "always-on" emission
 * (always-on): opacity, order, flexGrow, flexShrink, textDecoration,
 * left, top, right, bottom, borderTopStyle, borderRightStyle, borderBottomStyle,
 * borderLeftStyle, borderStyle, display, backgroundColor.
 * These are emitted on every node regardless of value.
 */
export const DEFAULT_VALUES: Record<string, string | number> = {
  // NOT filtered (always-on): display, backgroundColor, opacity, order,
  // flexGrow, flexShrink, textDecoration, left, top, right, bottom,
  // borderTopStyle, borderRightStyle, borderBottomStyle, borderLeftStyle, borderStyle
  flexDirection: 'row',
  flexWrap: 'nowrap',
  flexBasis: 'auto',
  alignItems: 'normal',
  alignSelf: 'auto',
  justifyContent: 'normal',
  gap: 'normal',
  position: 'static',
  zIndex: 'auto',
  overflow: 'visible',
  overflowX: 'visible',
  overflowY: 'visible',
  visibility: 'visible',
  // backgroundColor — always-on (not filtered)
  backgroundImage: 'none',
  backgroundSize: 'auto',
  backgroundPosition: '0% 0%',
  backgroundRepeat: 'repeat',
  backgroundClip: 'border-box',
  backgroundOrigin: 'padding-box',
  backgroundBlendMode: 'normal',
  borderWidth: '0px',
  // borderStyle, borderTopStyle, etc — always-on (not filtered)
  borderColor: 'rgb(0, 0, 0)',
  borderTopLeftRadius: '0px',
  borderTopRightRadius: '0px',
  borderBottomRightRadius: '0px',
  borderBottomLeftRadius: '0px',
  boxShadow: 'none',
  filter: 'none',
  backdropFilter: 'none',
  clipPath: 'none',
  transform: 'none',
  transformOrigin: '50% 50%',
  // textDecoration — always-on (not filtered)
  textDecorationLine: 'none',
  textOverflow: 'clip',
  whiteSpace: 'normal',
  objectFit: 'fill',
  objectPosition: '50% 50%',
  mixBlendMode: 'normal',
  content: 'normal',
  direction: 'ltr',
  writingMode: 'horizontal-tb',
  listStyleType: 'disc',
  margin: '0px',
  marginTop: '0px',
  marginRight: '0px',
  marginBottom: '0px',
  marginLeft: '0px',
  padding: '0px',
  paddingTop: '0px',
  paddingRight: '0px',
  paddingBottom: '0px',
  paddingLeft: '0px',
  rowGap: 'normal',
  columnGap: 'normal',
  // minWidth/minHeight: NOT filtered — emits "0px" on all nodes
  maxWidth: 'none',
  maxHeight: 'none',
  aspectRatio: 'auto',
  boxSizing: 'border-box',
  gridTemplateColumns: 'none',
  gridTemplateRows: 'none',
  gridAutoFlow: 'row',
  gridArea: 'auto / auto / auto / auto',
  fontWeight: '400',
  letterSpacing: 'normal',
  textAlign: 'start',
  fill: 'rgb(0, 0, 0)',
  outlineColor: 'rgb(0, 0, 0)',
  outlineStyle: 'none',
  outlineWidth: '0px',
  outlineOffset: '0px',
  webkitTextStrokeWidth: '0px',
};

// ---------------------------------------------------------------------------
// Pre-capture style injection
// ---------------------------------------------------------------------------

const PRECAPTURE_STYLE_ID = 'w2w-precapture-styles';

/**
 * CSS injected before capture to freeze animations and hide UI artifacts.
 * Pre-capture injection approach.
 */
const PRECAPTURE_CSS = `
*, *::before, *::after {
  animation-play-state: paused !important;
  transition-duration: 0s !important;
  caret-color: transparent !important;
}
body::-webkit-scrollbar {
  display: none !important;
}
body {
  scrollbar-width: none !important;
}
`;

/**
 * Inject pre-capture styles into the page.
 * Must be called before DOM extraction and removed after.
 */
export function injectPreCaptureStyles(): void {
  if (document.getElementById(PRECAPTURE_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = PRECAPTURE_STYLE_ID;
  style.textContent = PRECAPTURE_CSS;
  document.head.appendChild(style);
}

/**
 * Remove pre-capture styles from the page.
 */
export function removePreCaptureStyles(): void {
  const style = document.getElementById(PRECAPTURE_STYLE_ID);
  if (style) style.remove();
}
