/**
 * h2d Hover Audit — Figma Plugin Console Script
 *
 * Purpose: Reverse-engineer how html.to.design handles :hover states.
 *
 * How to run:
 *   1. Open Figma desktop app
 *   2. Open the h2d-imported file (web2wireframe.design/pricing)
 *   3. Plugins → Development → New plugin → Default (no UI, main.ts only)
 *   4. Replace code.js contents with THIS file
 *   5. Plugins → Development → Show/Hide Console (⌘⌥I on Mac)
 *   6. Plugins → Development → [your plugin] → Run
 *   7. Copy console output, paste back here
 *
 * Alternative (faster): in an existing plugin sandbox (e.g. Plugins →
 * Development → Open Console), paste the IIFE version below.
 */

(async () => {
  const page = figma.currentPage;

  // ─── 1. ComponentSet inventory ──────────────────────────────────────────
  const sets = page.findAllWithCriteria({ types: ['COMPONENT_SET'] });
  console.log(`\n=== [1] COMPONENT SETS: ${sets.length} ===\n`);

  const setReport = sets.map((cs, i) => {
    const variants = cs.children.filter((c) => c.type === 'COMPONENT');
    const pluginKeys = cs.getPluginDataKeys?.() || [];
    const pluginData = {};
    pluginKeys.forEach((k) => {
      pluginData[k] = cs.getPluginData(k);
    });
    const sharedKeys = cs.getSharedPluginDataKeys?.('h2d') || [];
    const sharedData = {};
    sharedKeys.forEach((k) => {
      sharedData[k] = cs.getSharedPluginData('h2d', k);
    });
    return {
      i: i + 1,
      id: cs.id,
      name: cs.name,
      variantCount: variants.length,
      variantNames: variants.map((v) => v.name),
      size: `${Math.round(cs.width)}x${Math.round(cs.height)}`,
      parent: cs.parent?.name,
      componentPropertyDefinitions: cs.componentPropertyDefinitions,
      pluginData,
      sharedPluginData_h2d: sharedData,
    };
  });
  console.log(JSON.stringify(setReport, null, 2));

  // ─── 2. Reactions (Figma's native :hover interaction) ───────────────────
  const withReactions = page.findAll(
    (n) => 'reactions' in n && Array.isArray(n.reactions) && n.reactions.length > 0
  );
  console.log(`\n=== [2] NODES WITH REACTIONS: ${withReactions.length} ===\n`);

  const reactionReport = withReactions.map((n) => ({
    id: n.id,
    type: n.type,
    name: n.name,
    reactionCount: n.reactions.length,
    triggers: n.reactions.map((r) => r.trigger?.type || 'unknown'),
    reactions: n.reactions,
  }));
  console.log(JSON.stringify(reactionReport, null, 2));

  // Count by trigger type
  const triggerCounts = {};
  withReactions.forEach((n) =>
    n.reactions.forEach((r) => {
      const t = r.trigger?.type || 'unknown';
      triggerCounts[t] = (triggerCounts[t] || 0) + 1;
    })
  );
  console.log('\nTriggers by type:', triggerCounts);

  // ─── 3. Hover-only ComponentSets (variants named "Hover") ───────────────
  const hoverSets = sets.filter((cs) =>
    cs.children.some((c) => /hover/i.test(c.name))
  );
  console.log(`\n=== [3] HOVER ComponentSets: ${hoverSets.length} / ${sets.length} ===\n`);

  // ─── 4. Diff default vs hover variant ───────────────────────────────────
  const diffs = hoverSets
    .map((cs) => {
      const def =
        cs.children.find((c) => /default/i.test(c.name) || /^(Property 1=)?Default/i.test(c.name)) ||
        cs.children[0];
      const hov = cs.children.find((c) => /hover/i.test(c.name));
      if (!def || !hov) return null;

      const stringify = (v) => {
        try {
          return JSON.stringify(v);
        } catch {
          return String(v);
        }
      };

      return {
        name: cs.name,
        default: {
          fills: stringify(def.fills),
          strokes: stringify(def.strokes),
          effects: stringify(def.effects),
          opacity: def.opacity,
          x: def.x,
          y: def.y,
          w: def.width,
          h: def.height,
        },
        hover: {
          fills: stringify(hov.fills),
          strokes: stringify(hov.strokes),
          effects: stringify(hov.effects),
          opacity: hov.opacity,
          x: hov.x,
          y: hov.y,
          w: hov.width,
          h: hov.height,
        },
        diffs: {
          fills: stringify(def.fills) !== stringify(hov.fills),
          strokes: stringify(def.strokes) !== stringify(hov.strokes),
          effects: stringify(def.effects) !== stringify(hov.effects),
          opacity: def.opacity !== hov.opacity,
          position: def.x !== hov.x || def.y !== hov.y,
          size: def.width !== hov.width || def.height !== hov.height,
        },
      };
    })
    .filter(Boolean);

  console.log(`\n=== [4] DEFAULT vs HOVER DIFFS ===\n`);
  console.log(JSON.stringify(diffs, null, 2));

  // ─── 5. Total node inventory ────────────────────────────────────────────
  const totals = {
    all: page.findAll().length,
    frames: page.findAll((n) => n.type === 'FRAME').length,
    components: page.findAll((n) => n.type === 'COMPONENT').length,
    componentSets: sets.length,
    instances: page.findAll((n) => n.type === 'INSTANCE').length,
    text: page.findAll((n) => n.type === 'TEXT').length,
    vectors: page.findAll((n) => n.type === 'VECTOR').length,
  };
  console.log(`\n=== [5] NODE TOTALS ===\n`, totals);

  // ─── 6. Instance reuse — how many instances per master? ─────────────────
  const instanceMap = {};
  page.findAll((n) => n.type === 'INSTANCE').forEach((inst) => {
    const key = inst.mainComponent?.id || 'unknown';
    instanceMap[key] = instanceMap[key] || {
      mainName: inst.mainComponent?.name || 'unknown',
      count: 0,
    };
    instanceMap[key].count += 1;
  });
  const instanceStats = Object.values(instanceMap).sort((a, b) => b.count - a.count);
  console.log(`\n=== [6] INSTANCE REUSE (top 20) ===\n`);
  console.log(JSON.stringify(instanceStats.slice(0, 20), null, 2));

  // ─── 7. Plugin data on page/document ────────────────────────────────────
  const pagePluginKeys = page.getPluginDataKeys?.() || [];
  const docPluginKeys = figma.root.getPluginDataKeys?.() || [];
  const pageShared = page.getSharedPluginDataNamespaces?.() || [];
  const docShared = figma.root.getSharedPluginDataNamespaces?.() || [];
  console.log(`\n=== [7] PLUGIN DATA NAMESPACES ===`);
  console.log('page plugin keys:', pagePluginKeys);
  console.log('doc plugin keys:', docPluginKeys);
  console.log('page shared namespaces:', pageShared);
  console.log('doc shared namespaces:', docShared);

  // ─── 8. Summary ─────────────────────────────────────────────────────────
  console.log(`\n=== SUMMARY ===`);
  console.log(`ComponentSets total:     ${sets.length}`);
  console.log(`ComponentSets w/ hover:  ${hoverSets.length}`);
  console.log(`Nodes with reactions:    ${withReactions.length}`);
  console.log(`Instances total:         ${totals.instances}`);
  console.log(`Unique instance masters: ${Object.keys(instanceMap).length}`);
  console.log(`\nDone. Copy the entire console output and send back.`);

  figma.closePlugin('h2d audit complete — see console');
})();
