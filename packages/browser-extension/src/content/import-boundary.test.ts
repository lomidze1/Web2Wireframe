/**
 * The extractor's import graph stays inside `src/content`.
 *
 * The API ships this code too: `packages/api/Dockerfile` copies ONLY
 * `packages/browser-extension/src/content` (plus `@w2w/shared`) into the image
 * and bundles `extractor.ts` from there (`scripts/bundle-content-script.mjs`).
 * A relative import that climbs out of the folder resolves fine on a laptop and
 * fails the image build — which is how a dev-only `../shared/devLog` import
 * broke `docker compose build api` on 2026-09-13 ("Could not resolve
 * ../shared/devLog"), and would have failed the next Render deploy the same way.
 *
 * Only what `extractor.ts` reaches is bundled for the API; the extension-only
 * entry (`index.ts`) may import from `../shared`.
 */
import { describe, expect, it } from 'vitest';

const sources = import.meta.glob(['./*.ts', '!./*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function specifiers(source: string): string[] {
  return [
    ...source.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g),
    ...source.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g),
    ...source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((m) => m[1]);
}

/** Every content file `extractor.ts` reaches through `./` imports. */
function extractorGraph(): string[] {
  const seen = new Set<string>();
  const queue = ['./extractor.ts'];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file) || !(file in sources)) continue;
    seen.add(file);
    for (const spec of specifiers(sources[file])) {
      if (spec.startsWith('./')) queue.push(spec.endsWith('.ts') ? spec : `${spec}.ts`);
    }
  }
  return [...seen];
}

describe('content-script import boundary (the API image ships only src/content)', () => {
  it('walks the extractor graph', () => {
    const graph = extractorGraph();
    expect(graph).toContain('./extractor.ts');
    expect(graph).toContain('./visibility.ts');
    expect(graph).not.toContain('./index.ts');
  });

  it.each(extractorGraph())('%s imports only from ./ or @w2w/shared', (file) => {
    const outside = specifiers(sources[file]).filter((s) => s.startsWith('..') || s.startsWith('@/'));
    expect(outside).toEqual([]);
  });
});
