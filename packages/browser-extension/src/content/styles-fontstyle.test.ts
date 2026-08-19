import { describe, it, expect } from 'vitest';
import { CSS_PROPERTIES, DEFAULT_VALUES } from './styles';

// fontStyle must be captured for normal elements so italic text survives to the
// plugin (css-converter reads s.fontStyle). Before this, italic was inferred
// only from CDP platform font names, which the font-display:swap sentinel and
// synthesized italics both defeat.
describe('fontStyle capture', () => {
  it('is in the CSS_PROPERTIES capture list', () => {
    expect(CSS_PROPERTIES).toContain('fontStyle');
  });

  it('filters the default "normal" so only italic/oblique is emitted', () => {
    expect(DEFAULT_VALUES.fontStyle).toBe('normal');
  });
});
