/**
 * extractUrlsFromSrc — both shapes of an @font-face `src`.
 *
 * The value reaches this parser in two different shapes:
 *   - raw CSS, wrapped:   `url(https://a/f.woff2) format("woff2")`
 *   - w2w capture, bare:  `https://a/f.woff2 format("woff2")`
 *
 * The browser-extension capture deliberately strips the wrapper before storing
 * the face ("Clean src: strip url() wrapper for clean URL storage"), so a
 * parser that INSISTS on `url(...)` silently returns nothing for every
 * captured page.
 *
 * Real-world case: iwm.org.uk. With zero URLs parsed, the capture never asked
 * the content script to fetch the font bytes, and then deleted the font assets
 * it had — the plugin's "Download fonts (.zip)" produced a 22-byte empty
 * archive because it had no bytes and cannot fetch cross-origin itself.
 */

import { describe, it, expect } from "vitest";
import { extractUrlsFromSrc } from "../font-binary-extraction";

const IWM =
  "https://www.iwm.org.uk/themes/custom/iwm_theme/fonts/interface_standard_regular/if_std_rg-webfont.woff2";

describe("extractUrlsFromSrc", () => {
  it("reads a bare URL from a capture-cleaned src", () => {
    expect(extractUrlsFromSrc(`${IWM} format("woff2")`)).toEqual([IWM]);
  });

  it("reads every URL of a bulletproof face that was cleaned", () => {
    const src =
      'https://a.io/f.eot?#iefix format("embedded-opentype"), ' +
      'https://a.io/f.woff2 format("woff2"), ' +
      'https://a.io/f.woff format("woff"), ' +
      'https://a.io/f.ttf format("truetype")';
    expect(extractUrlsFromSrc(src)).toEqual([
      "https://a.io/f.eot?#iefix",
      "https://a.io/f.woff2",
      "https://a.io/f.woff",
      "https://a.io/f.ttf",
    ]);
  });

  it("still reads unquoted url() wrappers", () => {
    expect(extractUrlsFromSrc('url(https://a.io/f.woff2) format("woff2")')).toEqual([
      "https://a.io/f.woff2",
    ]);
  });

  it("still reads quoted url() wrappers", () => {
    expect(extractUrlsFromSrc(`url("https://a.io/f.woff2") format("woff2")`)).toEqual([
      "https://a.io/f.woff2",
    ]);
    expect(extractUrlsFromSrc(`url('https://a.io/f.woff2')`)).toEqual([
      "https://a.io/f.woff2",
    ]);
  });

  it("still reads every URL of a wrapped bulletproof face", () => {
    const src =
      'url(https://a.io/f.eot?#iefix) format("embedded-opentype"), ' +
      'url(https://a.io/f.woff2) format("woff2")';
    expect(extractUrlsFromSrc(src)).toEqual([
      "https://a.io/f.eot?#iefix",
      "https://a.io/f.woff2",
    ]);
  });

  it("never reports the same URL twice for one wrapped entry", () => {
    expect(extractUrlsFromSrc("url(https://a.io/f.woff2)")).toHaveLength(1);
  });

  it("ignores local() and data: sources", () => {
    expect(extractUrlsFromSrc('local("Interface"), url(https://a.io/f.woff2)')).toEqual([
      "https://a.io/f.woff2",
    ]);
    expect(extractUrlsFromSrc("url(data:font/woff2;base64,AAAA)")).toEqual([]);
  });

  it("returns nothing for an empty src", () => {
    expect(extractUrlsFromSrc("")).toEqual([]);
  });
});
