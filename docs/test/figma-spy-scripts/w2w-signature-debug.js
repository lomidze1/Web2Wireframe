// W2W Hover Signature Debug — Scripter script
// Paste everything into Scripter → Run (⌘↵)
// Copy entire console output, send back.

const page = figma.currentPage;

const sections = page.findAll(n => n.type === "SECTION");
const w2wSection = sections.find(s => /Components\s*—\s*web2wireframe\.design/i.test(s.name));

if (!w2wSection) {
  console.log("W2W Components section not found. Sections on page:", sections.map(s => s.name));
} else {
  console.log("Found section:", w2wSection.name);

  const sets = w2wSection.findAll(n => n.type === "COMPONENT_SET");
  console.log("Found", sets.length, "ComponentSets inside W2W section\n");

  function stableStringify(v) {
    if (v === null || v === undefined) return JSON.stringify(v);
    if (typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
    const keys = Object.keys(v).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
  }

  function extract(n) {
    return {
      fills: n.fills,
      strokes: n.strokes,
      effects: n.effects,
      opacity: n.opacity,
      cornerRadius: n.cornerRadius,
      strokeWeight: n.strokeWeight,
      strokeAlign: n.strokeAlign,
      width: n.width,
      height: n.height,
      childCount: Array.isArray(n.children) ? n.children.length : 0,
    };
  }

  function computeSig(n) {
    const e = extract(n);
    return [
      stableStringify(e.fills),
      stableStringify(e.strokes),
      stableStringify(e.effects),
      String(e.opacity),
      String(e.cornerRadius),
      String(e.strokeWeight),
      e.strokeAlign,
      "children:" + e.childCount,
    ].join("|");
  }

  const reports = [];
  for (let i = 0; i < sets.length; i++) {
    const cs = sets[i];
    const variants = cs.children.filter(c => c.type === "COMPONENT");
    let def = variants.find(v => /default/i.test(v.name));
    if (!def) def = variants[0];
    const hov = variants.find(v => /hover/i.test(v.name));

    const defProps = def ? extract(def) : null;
    const hovProps = hov ? extract(hov) : null;
    const signature = def ? computeSig(def) : "<no default>";

    reports.push({
      i: i + 1,
      name: cs.name,
      size: Math.round(cs.width) + "x" + Math.round(cs.height),
      variants: variants.map(v => v.name),
      defaultProps: defProps,
      hoverProps: hovProps,
      signatureLength: signature.length,
      signature: signature,
    });
  }

  console.log("═══════════════════════════════════════════════════");
  console.log("FULL REPORTS");
  console.log("═══════════════════════════════════════════════════");

  for (let k = 0; k < reports.length; k++) {
    const r = reports[k];
    console.log("");
    console.log("### [" + r.i + "] " + r.name + "  (" + r.size + ")");
    console.log("  variants:", r.variants);
    console.log("  default props:");
    console.log("    fills:       ", JSON.stringify(r.defaultProps && r.defaultProps.fills));
    console.log("    strokes:     ", JSON.stringify(r.defaultProps && r.defaultProps.strokes));
    console.log("    effects:     ", JSON.stringify(r.defaultProps && r.defaultProps.effects));
    console.log("    cornerRadius:", r.defaultProps && r.defaultProps.cornerRadius);
    console.log("    strokeWeight:", r.defaultProps && r.defaultProps.strokeWeight);
    console.log("    strokeAlign: ", r.defaultProps && r.defaultProps.strokeAlign);
    console.log("    opacity:     ", r.defaultProps && r.defaultProps.opacity);
    console.log("    childCount:  ", r.defaultProps && r.defaultProps.childCount);
    console.log("  signature length:", r.signatureLength);
    console.log("  signature:", r.signature);
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════");
  console.log("PAIRWISE DIFF");
  console.log("═══════════════════════════════════════════════════");

  const fields = ["fills", "strokes", "effects", "cornerRadius", "strokeWeight", "strokeAlign", "opacity", "childCount"];

  for (let i = 0; i < reports.length; i++) {
    for (let j = i + 1; j < reports.length; j++) {
      const a = reports[i];
      const b = reports[j];
      if (!a.defaultProps || !b.defaultProps) continue;
      const diffs = [];
      for (let f = 0; f < fields.length; f++) {
        const field = fields[f];
        const av = stableStringify(a.defaultProps[field]);
        const bv = stableStringify(b.defaultProps[field]);
        if (av !== bv) diffs.push(field);
      }
      console.log("");
      console.log("[" + a.i + "] \"" + a.name + "\" vs [" + b.i + "] \"" + b.name + "\": diffs in [" + diffs.join(", ") + "]");
      for (let d = 0; d < diffs.length; d++) {
        const f = diffs[d];
        console.log("  - " + f + ":");
        console.log("      [" + a.i + "]", JSON.stringify(a.defaultProps[f]));
        console.log("      [" + b.i + "]", JSON.stringify(b.defaultProps[f]));
      }
    }
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════");
  console.log("EXPECTED DEDUPES THAT FAILED");
  console.log("═══════════════════════════════════════════════════");

  const byName = {};
  for (let k = 0; k < reports.length; k++) {
    const r = reports[k];
    if (!byName[r.name]) byName[r.name] = [];
    byName[r.name].push(r);
  }
  const names = Object.keys(byName);
  for (let n = 0; n < names.length; n++) {
    const name = names[n];
    const group = byName[name];
    if (group.length > 1) {
      console.log("");
      console.log(group.length, "ComponentSets share name \"" + name + "\" — should have deduped:");
      for (let g = 0; g < group.length; g++) {
        console.log("   [" + group[g].i + "] " + group[g].size);
      }
    }
  }

  console.log("");
  console.log("DONE — copy all output.");
}
