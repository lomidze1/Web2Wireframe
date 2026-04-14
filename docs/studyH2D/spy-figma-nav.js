/**
 * Figma Console Spy — h2d nav structure audit
 *
 * Run in Figma Dev Console AFTER h2d imports apple.com
 *
 * What it captures:
 * - Full nav tree structure (names, types, sizes, layout, visibility)
 * - 0x0 elements detection
 * - display:contents handling
 * - Children count and hierarchy
 */

(function auditH2DNav() {
  const page = figma.currentPage;

  // Find the h2d imported frame (usually top-level section or frame)
  const topFrames = page.children;
  console.log(`[SPY] Page has ${topFrames.length} top-level nodes`);

  // Search for nav/globalnav recursively
  function findNavNodes(node, depth, path) {
    if (depth > 20) return [];
    const results = [];

    const name = node.name || '';
    const nameLower = name.toLowerCase();

    // Match globalnav or nav-related names
    if (nameLower.includes('globalnav') || nameLower.includes('nav') ||
        (nameLower === 'nav' || nameLower.startsWith('nav.'))) {
      results.push({ node, depth, path: path + '/' + name });
    }

    // Recurse into children
    if ('children' in node) {
      for (const child of node.children) {
        results.push(...findNavNodes(child, depth + 1, path + '/' + name));
      }
    }

    return results;
  }

  // Print node tree
  function printTree(node, depth, maxDepth) {
    if (depth > maxDepth) return;
    const indent = '  '.repeat(depth);
    const type = node.type;
    const name = node.name || '?';
    const w = Math.round(node.width * 100) / 100;
    const h = Math.round(node.height * 100) / 100;
    const visible = node.visible;
    const opacity = node.opacity !== undefined ? node.opacity : '?';

    let layoutInfo = '';
    if (type === 'FRAME' || type === 'COMPONENT' || type === 'INSTANCE') {
      layoutInfo = ` layout=${node.layoutMode || 'NONE'}`;
      if (node.layoutMode && node.layoutMode !== 'NONE') {
        layoutInfo += ` gap=${node.itemSpacing || 0}`;
        layoutInfo += ` pad=${node.paddingLeft || 0},${node.paddingTop || 0},${node.paddingRight || 0},${node.paddingBottom || 0}`;
      }
      layoutInfo += ` clip=${node.clipsContent}`;
    }

    const childCount = 'children' in node ? node.children.length : 0;

    // Flag issues
    let flags = '';
    if (w === 0 && h === 0) flags += ' ⚠️0x0';
    if (!visible) flags += ' 👻hidden';
    if (opacity === 0) flags += ' 👻opacity0';

    console.log(`${indent}${name} (${type}) ${w}x${h}${layoutInfo} vis=${visible} opacity=${opacity} [${childCount}]${flags}`);

    if ('children' in node) {
      for (const child of node.children) {
        printTree(child, depth + 1, maxDepth);
      }
    }
  }

  // Find all nav-related nodes
  const navNodes = [];
  for (const topNode of topFrames) {
    navNodes.push(...findNavNodes(topNode, 0, ''));
  }

  // Filter to globalnav specifically
  const globalnavNodes = navNodes.filter(n => n.node.name.toLowerCase().includes('globalnav'));

  if (globalnavNodes.length > 0) {
    // Find the topmost globalnav (shallowest depth)
    const topNav = globalnavNodes.reduce((a, b) => a.depth < b.depth ? a : b);
    console.log(`\n[SPY] ========= GLOBALNAV FOUND =========`);
    console.log(`[SPY] Path: ${topNav.path}`);
    console.log(`[SPY] Depth: ${topNav.depth}`);
    console.log(`[SPY] =====================================\n`);

    // Print full tree up to depth 8
    printTree(topNav.node, 0, 8);
  } else if (navNodes.length > 0) {
    console.log(`\n[SPY] No globalnav found, but found ${navNodes.length} nav-related nodes:`);
    navNodes.slice(0, 3).forEach(n => {
      console.log(`\n[SPY] Nav node: ${n.path}`);
      printTree(n.node, 0, 5);
    });
  } else {
    console.log(`[SPY] No nav nodes found. Dumping top-level structure:`);
    for (const topNode of topFrames) {
      printTree(topNode, 0, 3);
    }
  }

  // Count all 0x0 elements in the page
  let zeroCount = 0;
  function countZero(node) {
    if (node.width === 0 && node.height === 0) zeroCount++;
    if ('children' in node) node.children.forEach(countZero);
  }
  topFrames.forEach(countZero);
  console.log(`\n[SPY] Total 0x0 elements on page: ${zeroCount}`);

  return 'Audit complete';
})();
