/**
 * SPY SCRIPT 5: Figma Node Tree Exporter
 *
 * გამოყენება: Figma DevTools Console-ში (Plugins → Development → Open Console)
 *
 * რას აკეთებს:
 * - h2d-ის import-ის შემდეგ, exported Figma node tree-ს აფიქსირებს
 * - ჩვენი W2W import-ის შემდეგაც იგივე
 * - ორივეს JSON-ად exports
 * - შემდეგ side-by-side comparison შეიძლება
 *
 * ინსტრუქცია:
 * 1. h2d-ით import ქენი ვებსაიტი
 * 2. Select imported frame
 * 3. Run: exportSelectedTree('h2d')
 * 4. W2W-ით import ქენი იგივე ვებსაიტი
 * 5. Select imported frame
 * 6. Run: exportSelectedTree('w2w')
 * 7. Run: downloadComparison()
 */

function exportNodeTree(node, depth = 0, maxDepth = 50) {
  if (depth > maxDepth) return { name: node.name, type: node.type, note: 'MAX_DEPTH' };

  const result = {
    name: node.name,
    type: node.type,
    x: Math.round(node.x * 10) / 10,
    y: Math.round(node.y * 10) / 10,
    width: Math.round(node.width * 10) / 10,
    height: Math.round(node.height * 10) / 10
  };

  // Layout properties
  if ('layoutMode' in node && node.layoutMode !== 'NONE') {
    result.layoutMode = node.layoutMode;
    result.itemSpacing = node.itemSpacing;
    result.paddingTop = node.paddingTop;
    result.paddingRight = node.paddingRight;
    result.paddingBottom = node.paddingBottom;
    result.paddingLeft = node.paddingLeft;
    result.primaryAxisAlignItems = node.primaryAxisAlignItems;
    result.counterAxisAlignItems = node.counterAxisAlignItems;
    result.layoutWrap = node.layoutWrap;
  }

  // Sizing
  if ('layoutSizingHorizontal' in node) {
    result.layoutSizingHorizontal = node.layoutSizingHorizontal;
    result.layoutSizingVertical = node.layoutSizingVertical;
  }

  // Visual properties
  if ('fills' in node && node.fills.length > 0) {
    result.fills = node.fills.map(f => ({
      type: f.type,
      color: f.type === 'SOLID' ? `rgba(${Math.round(f.color.r*255)},${Math.round(f.color.g*255)},${Math.round(f.color.b*255)},${f.opacity ?? 1})` : undefined,
      imageHash: f.type === 'IMAGE' ? f.imageHash?.slice(0, 8) : undefined,
      gradientStops: f.gradientStops?.length
    }));
  }

  if ('strokes' in node && node.strokes.length > 0) {
    result.strokes = node.strokes.map(s => ({
      type: s.type,
      color: s.type === 'SOLID' ? `rgba(${Math.round(s.color.r*255)},${Math.round(s.color.g*255)},${Math.round(s.color.b*255)},${s.opacity ?? 1})` : undefined
    }));
    result.strokeWeight = node.strokeWeight;
  }

  if ('effects' in node && node.effects.length > 0) {
    result.effects = node.effects.map(e => ({
      type: e.type,
      radius: e.radius,
      visible: e.visible
    }));
  }

  // Corner radius
  if ('cornerRadius' in node && node.cornerRadius > 0) {
    result.cornerRadius = node.cornerRadius;
  }
  if ('topLeftRadius' in node && (node.topLeftRadius > 0 || node.topRightRadius > 0)) {
    result.radii = {
      tl: node.topLeftRadius,
      tr: node.topRightRadius,
      br: node.bottomRightRadius,
      bl: node.bottomLeftRadius
    };
  }

  // Text properties
  if (node.type === 'TEXT') {
    result.characters = node.characters?.slice(0, 100);
    result.fontSize = node.fontSize;
    result.fontName = node.fontName;
    result.lineHeight = node.lineHeight;
    result.textAlignHorizontal = node.textAlignHorizontal;
    result.letterSpacing = node.letterSpacing;
  }

  // Opacity & blend
  if (node.opacity !== undefined && node.opacity < 1) {
    result.opacity = node.opacity;
  }
  if (node.blendMode && node.blendMode !== 'PASS_THROUGH') {
    result.blendMode = node.blendMode;
  }

  // Overflow
  if ('clipsContent' in node) {
    result.clipsContent = node.clipsContent;
  }

  // Rotation
  if (node.rotation && node.rotation !== 0) {
    result.rotation = Math.round(node.rotation * 100) / 100;
  }

  // Children
  if ('children' in node && node.children.length > 0) {
    result.children = node.children.map(child => exportNodeTree(child, depth + 1, maxDepth));
    result.childCount = node.children.length;
  }

  return result;
}

// Store exports
const exports = {};

function exportSelectedTree(label) {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    console.error('No node selected! Select the imported frame first.');
    return;
  }

  const node = selection[0];
  const tree = exportNodeTree(node);
  exports[label] = tree;

  // Count nodes
  function countNodes(n) {
    let count = 1;
    if (n.children) n.children.forEach(c => count += countNodes(c));
    return count;
  }

  console.log(`[EXPORT] "${label}" exported: ${countNodes(tree)} nodes from "${node.name}"`);
  return tree;
}

function downloadExport(label) {
  if (!exports[label]) {
    console.error(`No export found for "${label}". Run exportSelectedTree('${label}') first.`);
    return;
  }
  // In Figma console, just copy to clipboard
  console.log(JSON.stringify(exports[label], null, 2));
}

function downloadComparison() {
  const comparison = {
    timestamp: new Date().toISOString(),
    exports
  };
  console.log(JSON.stringify(comparison, null, 2));
}

console.log(`
[FIGMA-SPY] Node exporter loaded.

Usage:
1. Select h2d imported frame → exportSelectedTree('h2d')
2. Select W2W imported frame → exportSelectedTree('w2w')
3. downloadComparison() → copy JSON output
`);
