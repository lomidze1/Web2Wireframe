# h2d Content Script Deobfuscation — Key Logic

## File Info
- Path: `assets/src/contentScript/index.js`
- Size: 315KB, 150 lines (minified)
- Libraries: SAT.js (collision detection), Buffer (Node.js polyfill), webext-bridge

## Main Entry Point

```javascript
// convertBody message handler
Zt("convertBody", async ({data: t}) => {
  let e = await pc(t);  // Pre-processing (pause animations, scrollbar hide)
  await Ui(document.documentElement, Do).finally(e);
});

// Do = serialize function from ey(Xe) factory
// Calls ty() which sets up global helper functions then calls J2()
```

## Architecture (Content Script)

```
convertBody message received
  → pc() — pre-processing:
    - Pause CSS animations (inject style #__h2d_anim_pause)
    - Hide scrollbar (body::-webkit-scrollbar{display:none})
    - Wait for transitions to finish (hc() measures max transition duration)
  → ty() — setup global CDP helper functions:
    - fetchShadowRoot, fetchBeforeAfter, getPlatformFontForNode
    - forcePseudoState, getBoxModel, getContentQuads
    - getAssetWithCDP, serializeIFrame
  → TreeWalker — add h2d-* classes to ALL elements (ea() function)
  → J2() ��� main conversion:
    - _2() with X2(options)
    - Recursive no() function for each node
  → storeSerializedFrame — send result to background
```

## Visibility Check: po() function

```javascript
function po(t, e, r) {
  // t = element, e = bounding rect, r = computed style

  // 1. Check Yi() — basic hidden check
  if (Yi(t, r)) return true;  // skip

  // 2. display:contents is NOT hidden
  if (r.display === "contents") return false;

  // 3. No offsetParent + zero size = hidden
  if (t) {
    let n = t;
    while (n && !He(n)) n = n?.parentElement;
    let o = n?.offsetParent;
    if (n && !o && !(e.width > 0 && e.height > 0)) {
      let a = getComputedStyle(n).position;
      let i = t.ownerDocument;
      // Exception: body, documentElement, fixed position
      if (n !== i.body && n !== i.documentElement && a !== "fixed")
        return true;  // skip
    }
  }

  // 4. Overflow clipping
  return !!(
    r.overflowX !== "visible" && e.width < 1 ||
    r.overflowY !== "visible" && e.height < 1 ||
    // Clip patterns
    Hi(r.position) && r.clip === "rect(0px, 0px, 0px, 0px)" ||
    r.clipPath === "inset(50%)" ||
    r.clipPath === "inset(0px 0px 99.9% 99.9%)" ||
    // ... more clip patterns
  );
}
```

## Node Type Decision: no() function

```javascript
async function no(t, e, r, n, o, a, i = false) {
  // t = DOM node, e = parent chain, r = context, n = options

  if (mo(t)) {
    // mo() = text node check (nodeType === 3)
    // → Create TEXT node
    let s = e[e.length - 1]; // parent element
    let l = getComputedStyle(s);
    if (l.visibility !== "visible") return [];
    // B2() gets text quads, handles ellipsis/truncation
    let u = await B2(r, t, l, e, n, o);
    // Zn() creates TEXT node with: value, font, platformFont, quad
    return Promise.all(u.map(({s, q, isEllipsis, isTruncated}) =>
      Zn({text: s, parent: s, rect: nl(q), node: t, computedStyle: l, ...})
    ));
  }

  else if (ar(t)) {
    // ar() = element node check (nodeType === 1)

    if (Wr(t)) {
      // Wr() = SVG element check
      // → Create SVG node with full markup
      let u = t.cloneNode(true);
      Ng(t, u); // set width/height attributes
      return [{ type: "SVG", svg: u.outerHTML, ...position }];
    }

    // For regular elements:
    let s = getComputedStyle(t);

    // ro() creates FRAME node
    let f = await ro(t, e, a, r, s, l, i);
    if (f) {
      // Recursively process children
      let children = await x2(t); // gets child nodes (handles shadow DOM, slots, iframes)
      for (let child of children.nodes) {
        let childResults = await no(child, [...e, t], r, n, o, a);
        f.children.push(...childResults);
      }
    }
    return f ? [f] : [];
  }
}
```

## Element → FRAME Conversion: Kl() function

```javascript
function Kl(t, e, r, n, o) {
  // t = element, e = computedStyle, r = bounding rect, n = context, o = options

  let a = {
    ...al(r, 100),    // x, y, width, height, quad (from bounding rect)
    type: "FRAME",
    tag: t?.tagName.toLowerCase(),
    classList: String(t?.classList || "").split(" ").filter(...)
  };

  let i = a.attr = {};  // HTML attributes
  let s = a.styles = {}; // CSS styles (filtered)

  // Style filtering logic:
  function l(p, g) {
    let w = rl[p];     // rl = default values map
    g !== w && (s[p] = g);  // Only store if NOT default!
  }

  // Process special attributes by tag
  if (In(t))  // img tag
    i.naturalHeight = t.naturalHeight, i.naturalWidth = t.naturalWidth, ...
  if (Ku(t))  // anchor tag
    i.href = Lg(t);  // get href

  // Map CSS properties via computedStyleMap() API
  let u = t.computedStyleMap(); // CSS Typed OM!
  for (let [p, g] of Kp) l(p, u ? u.get(g).toString() : e[p]);

  // Additional properties from getComputedStyle
  for (let p of td) l(p, e[p]);

  // Special: transform2 (preserve original CSS)
  if (u && s.transform !== "none") {
    let p = Array.from(u.get("transform")).filter(g => !cf(g)); // filter out matrices
    if (p.length) {
      s.transform2 = p.map(g => g.toString()).join(" ");
      s.transformOrigin2 = e.transformOrigin;
    }
  }

  return a;
}
```

## Complete CSS Property List (89 properties)

h2d reads these properties from `getComputedStyle()` and filters against defaults:

```javascript
const td = [
  "accentColor", "alignItems", "alignSelf", "aspectRatio", "appearance",
  "backdropFilter", "backgroundBlendMode", "backgroundClip", "backgroundColor",
  "backgroundImage", "backgroundOrigin", "backgroundPosition", "backgroundRepeat",
  "backgroundSize", "borderBottomLeftRadius", "borderBottomRightRadius",
  "borderBottomStyle", "borderColor", "borderLeftStyle", "borderRightStyle",
  "borderStyle", "borderTopLeftRadius", "borderTopRightRadius", "borderTopStyle",
  "borderWidth", "boxShadow", "boxSizing", "clip", "clipPath", "color", "content",
  "display", "direction", "fill", "filter", "flexBasis", "flexDirection", "flexWrap",
  "float", "fontFamily", "fontSize", "fontStretch", "fontStyle",
  "fontVariationSettings", "fontWeight", "gap", "gridArea", "gridAutoFlow",
  "gridTemplateAreas", "isolation", "justifyItems", "justifyContent", "justifySelf",
  "letterSpacing", "lineHeight", "listStyleType", "margin", "maxHeight", "maxWidth",
  "minHeight", "minWidth", "mixBlendMode", "objectFit", "objectPosition",
  "outlineColor", "outlineOffset", "outlineStyle", "outlineWidth", "overflow",
  "overflowX", "overflowY", "padding", "pointerEvents", "position", "rotate", "scale",
  "textAlign", "textDecoration", "textDecorationLine", "textOverflow", "textShadow",
  "textTransform", "transform", "verticalAlign", "visibility", "webkitMaskClip",
  "webkitMaskImage", "webkitMaskOrigin", "webkitMaskPosition", "webkitMaskRepeat",
  "webkitMaskSize", "webkitTextFillColor", "webkitTextStrokeColor",
  "webkitTextStrokeWidth", "whiteSpace", "writingMode", "zIndex"
];
```

Plus additional via `computedStyleMap()` API (Kp map):
- width, height, left, top, right, bottom
- flexGrow, flexShrink, order, opacity

## Default Values (filtering)

h2d only stores properties that differ from these defaults:

```javascript
const rl = {
  accentColor: "auto",
  alignItems: "normal",
  alignSelf: "auto",
  aspectRatio: "auto",
  appearance: "none",
  backdropFilter: "none",
  backgroundBlendMode: "normal",
  backgroundClip: "border-box",
  backgroundImage: "none",
  backgroundOrigin: "padding-box",
  backgroundPosition: "0% 0%",
  backgroundRepeat: "repeat",
  backgroundSize: "auto",
  borderBottomStyle: "solid",
  borderLeftStyle: "solid",
  borderRightStyle: "solid",
  borderStyle: "solid",
  borderTopStyle: "solid",
  borderWidth: "0px",
  borderBottomLeftRadius: "0px",
  borderBottomRightRadius: "0px",
  borderTopLeftRadius: "0px",
  borderTopRightRadius: "0px",
  boxSizing: "border-box",
  boxShadow: "none",
  clip: "auto",
  clipPath: "none",
  content: "normal",
  direction: "ltr",
  fill: "rgb(0, 0, 0)",
  filter: "none",
  flexBasis: "auto",
  flexDirection: "row",
  flexWrap: "nowrap",
  float: "none",
  fontStretch: "100%",
  fontWeight: "400",
  gap: "normal",
  gridAutoFlow: "row",
  gridArea: "auto",
  gridTemplateAreas: "none",
  gridTemplateColumns: "none",
  gridTemplateRows: "none",
  isolation: "auto",
  fontStyle: "normal",
  fontVariationSettings: "normal",
  justifyContent: "normal",
  justifyItems: "normal",
  justifySelf: "auto",
  letterSpacing: "normal",
  listStyleType: "disc",
  margin: "0px",
  marginBottom: "0px", marginLeft: "0px", marginRight: "0px", marginTop: "0px",
  maxHeight: "none",
  maxWidth: "none",
  minHeight: "auto",
  minWidth: "auto",
  mixBlendMode: "normal",
  objectFit: "fill",
  objectPosition: "50% 50%",
  outlineOffset: "0px",
  outlineStyle: "none",
  outlineWidth: "0px",
  overflow: "visible",
  overflowX: "visible",
  overflowY: "visible",
  padding: "0px",
  pointerEvents: "auto",
  position: "static",
  rotate: "none",
  scale: "none",
  textAlign: "start",
  textDecoration: "rgb(0, 0, 0)",
  textDecorationLine: "none",
  textOverflow: "clip",
  textShadow: "none",
  textTransform: "none",
  transform: "none",
  transformOrigin: "50% 50%",
  verticalAlign: "baseline",
  visibility: "visible",
  webkitMaskImage: "none",
  webkitMaskClip: "border-box",
  webkitMaskOrigin: "border-box",
  webkitMaskPosition: "0% 0%",
  webkitMaskRepeat: "repeat",
  webkitMaskSize: "auto",
  webkitTextFillColor: "rgb(0, 0, 0)",
  webkitTextStrokeColor: "rgb(0, 0, 0)",
  webkitTextStrokeWidth: "0px",
  whiteSpace: "normal",
  writingMode: "horizontal-tb",
  zIndex: "auto"
};
```

## Key Technical Details

### computedStyleMap() vs getComputedStyle()

h2d uses BOTH APIs:
- `computedStyleMap()` (CSS Typed OM) for: width, height, left, top, right, bottom, flexGrow, flexShrink, order, opacity
  - Gives typed values (CSSUnitValue, CSSKeywordValue) not just strings
  - Can detect "auto" vs "0px" accurately
- `getComputedStyle()` for: all other 89 properties
  - Returns resolved string values

### Fit-Content Detection (b2, w2)

h2d determines if width/height is "fit-content" by:
1. Temporarily removing parent padding
2. Checking if element width changes
3. If width doesn't change → it's not fitting to parent → "fit-content"

```javascript
function b2(t) {
  let e = getComputedStyle(t);
  let r = t.parentElement.style.paddingRight;
  let n = e.width;
  t.parentElement.style.paddingRight = "";
  let o = e.width !== n;
  t.parentElement.style.paddingRight = "1px";
  o ||= e.width !== n;
  t.parentElement.style.paddingRight = r;
  return !o; // true = fit-content
}
```

### Shadow DOM Support

- Uses `chrome.dom.openOrClosedShadowRoot()` for accessing shadow DOM
- Marks shadow hosts with `__h2d_shadowRoot` attribute
- Serializes shadow DOM content separately and merges

### iframe Support

- Iframes serialized via `serializeIFrame` message to background
- Background uses CDP to access cross-origin iframe content
- Result is compressed and merged into parent frame
