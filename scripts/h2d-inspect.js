/**
 * h2d / W2W Figma file inspection script.
 *
 * Run inside Figma's plugin sandbox console (Plugins → Development → Open
 * Console while ANY plugin is running). Walks the current page and reports:
 *   1. All Local TextStyles (name, font, style, size, lineHeight)
 *   2. Every unique font family used by text nodes + node count per family
 *   3. Every plugin-data key found on text/frame nodes + sample value
 *   4. "Missing font" warnings — where the rendered family ≠ font family
 *      requested by a TextStyle (heuristic: TextStyle name "FontX-..." but
 *      node font family is "Inter")
 *
 * Output is a single console.table per section so you can scan it visually
 * and copy/paste comparison data between h2d and W2W runs.
 */
(async () => {
  // ---- 1. Local TextStyles ----
  const styles = figma.getLocalTextStyles();
  const styleRows = styles.map((s) => ({
    name: s.name,
    family: s.fontName.family,
    style: s.fontName.style,
    size: s.fontSize,
    lineHeight:
      typeof s.lineHeight === "object" && "value" in s.lineHeight
        ? `${s.lineHeight.value}${s.lineHeight.unit === "PERCENT" ? "%" : "px"}`
        : "AUTO",
    description: s.description || "",
  }));
  console.log(`%c[INSPECT] Local TextStyles: ${styleRows.length}`, "color:#4caf50;font-weight:bold");
  console.table(styleRows);

  // ---- 2. Walk text nodes ----
  const allText = figma.currentPage.findAll((n) => n.type === "TEXT");
  console.log(`%c[INSPECT] Text nodes on current page: ${allText.length}`, "color:#4caf50;font-weight:bold");

  const familyCounts = new Map();
  const styleIdCounts = new Map();
  let mixedNodes = 0;

  for (const t of allText) {
    if (t.fontName === figma.mixed) {
      mixedNodes++;
      continue;
    }
    const fam = t.fontName.family;
    familyCounts.set(fam, (familyCounts.get(fam) || 0) + 1);
    const sid = String(t.textStyleId || "(no style)");
    styleIdCounts.set(sid, (styleIdCounts.get(sid) || 0) + 1);
  }

  const familyRows = [...familyCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([family, count]) => ({ family, count }));
  console.log(`%c[INSPECT] Unique families (mixed-style nodes: ${mixedNodes}):`, "color:#2196f3");
  console.table(familyRows);

  // ---- 3. Plugin data dump ----
  // Figma offers no "list all keys" API, so we probe a curated set covering
  // common patterns from h2d, W2W, and other plugins. Add to PROBE_KEYS as
  // discoveries surface.
  const PROBE_KEYS = [
    // h2d candidates (educated guesses — h2d is closed-source)
    "h2d_font", "h2d_original_font", "h2d_meta", "h2d_id", "h2d_node_id",
    "h2d_style", "h2d_link", "h2d:font", "h2d:original",
    // W2W keys
    "w2w_original_font", "w2w_position_fixed", "w2w_sticky_spacer",
    "w2w_css_top", "w2w_css_left", "w2w_hover_diff",
    // generic
    "originalFont", "original-font", "missing-font", "fontFallback",
  ];

  const pluginDataHits = [];
  // Sample first 80 nodes — cheaper than full walk and usually catches every
  // key h2d might write at least once.
  const sampleSize = Math.min(80, allText.length);
  for (let i = 0; i < sampleSize; i++) {
    const t = allText[i];
    for (const key of PROBE_KEYS) {
      try {
        const val = t.getPluginData(key);
        if (val) {
          pluginDataHits.push({
            nodeId: t.id,
            family: t.fontName === figma.mixed ? "(mixed)" : t.fontName.family,
            key,
            value: val.length > 60 ? val.slice(0, 60) + "…" : val,
          });
        }
      } catch (_) { /* getPluginData rarely throws */ }
    }
  }
  console.log(`%c[INSPECT] Plugin-data hits (first ${sampleSize} text nodes, ${PROBE_KEYS.length} keys probed):`, "color:#ff9800;font-weight:bold");
  if (pluginDataHits.length === 0) {
    console.log("%c  (none) — no probed keys carried data on the sampled nodes", "color:#999");
  } else {
    console.table(pluginDataHits);
  }

  // ---- 4. Missing-font heuristic ----
  // If a TextStyle is named like "PSA-Medium-12.8" but its current font is
  // Inter, the original isn't installed and the style is showing a fallback.
  // Same heuristic for direct-value text nodes.
  const FALLBACK_FAMILIES = new Set(["Inter", "Roboto", "Helvetica", "Arial"]);
  const styleMismatches = styles
    .filter((s) => {
      // Look for a font name token in the style name (split by - or _)
      const m = s.name.match(/[A-Z][A-Za-z0-9]+/);
      if (!m) return false;
      return FALLBACK_FAMILIES.has(s.fontName.family) && !FALLBACK_FAMILIES.has(m[0]);
    })
    .map((s) => ({
      styleName: s.name,
      currentFont: s.fontName.family,
      probableOriginal: s.name.match(/[A-Z][A-Za-z0-9]+/)?.[0] || "?",
    }));
  console.log(`%c[INSPECT] TextStyles likely showing a fallback (heuristic):`, "color:#f44336;font-weight:bold");
  if (styleMismatches.length === 0) {
    console.log("%c  (none detected)", "color:#999");
  } else {
    console.table(styleMismatches);
  }

  // ---- 5. Frame-level plugin data sample ----
  const allFrames = figma.currentPage.findAll((n) => n.type === "FRAME");
  const frameHits = [];
  const FRAME_KEYS = [
    "h2d_meta", "h2d_root", "h2d_url", "h2d_options", "h2d_link",
    "w2w_position_fixed", "w2w_sticky_spacer",
  ];
  for (let i = 0; i < Math.min(20, allFrames.length); i++) {
    const f = allFrames[i];
    for (const key of FRAME_KEYS) {
      try {
        const val = f.getPluginData(key);
        if (val) frameHits.push({ frameName: f.name, key, value: val.length > 80 ? val.slice(0, 80) + "…" : val });
      } catch (_) { /* */ }
    }
  }
  console.log(`%c[INSPECT] Frame-level plugin-data hits:`, "color:#9c27b0;font-weight:bold");
  if (frameHits.length === 0) {
    console.log("%c  (none) — no frame-level metadata found", "color:#999");
  } else {
    console.table(frameHits);
  }

  console.log(`%c[INSPECT] Done.`, "color:#4caf50;font-weight:bold");
})();
