/**
 * `flex-grow: 1` is not, on its own, a licence to stretch.
 *
 * CSS resolves flex-grow against the *available* space on one line. Figma's
 * `layoutGrow = 1` divides the whole container between the growing children.
 * The two agree only when the measured children already fill the container
 * exactly — otherwise Figma re-divides space CSS never handed out.
 *
 * stripe.com's bento is the case that exposed it: six cards measuring
 * 816 / 400 / 400 / 400 / 400 / 1232 all declare `flex: 1 1 …` inside a 1232px
 * row. They wrap onto three lines in the browser, so their widths sum to 3648
 * — three times the container. Given `layoutGrow = 1`, Figma packed all six
 * onto one line at (1232 − 5×16) / 6 = 191.67px each and left 1510px of the
 * captured 1834px height empty.
 *
 * h2d gates the same decision with an exact-fit test (`Hq`): padding + child
 * lengths + gaps must equal the container, and the growing children must all
 * be the same size. Otherwise nobody grows and every measured width stands.
 */
import { describe, it, expect } from "vitest";
import { growFitsContainer } from "../rendering/layout";

describe("growFitsContainer", () => {
  it("allows growth when the measured children fill the container exactly", () => {
    // 3 × 400 + 2 × 16 = 1232
    expect(
      growFitsContainer({
        parentLength: 1232,
        paddingStart: 0,
        paddingEnd: 0,
        childLengths: [400, 400, 400],
        itemSpacing: 16,
        growIndices: [0, 1, 2],
      })
    ).toBe(true);
  });

  it("refuses the stripe.com bento — the children need three lines", () => {
    // 816 + 400 + 400 + 400 + 400 + 1232 + 5 × 16 = 3728, container is 1232
    expect(
      growFitsContainer({
        parentLength: 1232,
        paddingStart: 0,
        paddingEnd: 0,
        childLengths: [816, 400, 400, 400, 400, 1232],
        itemSpacing: 16,
        growIndices: [0, 1, 2, 3, 4, 5],
      })
    ).toBe(false);
  });

  it("counts padding as part of the fit", () => {
    // 2 × 400 + 16 + 24 + 24 = 864
    const opts = {
      parentLength: 864,
      paddingStart: 24,
      paddingEnd: 24,
      childLengths: [400, 400],
      itemSpacing: 16,
      growIndices: [0, 1],
    };
    expect(growFitsContainer(opts)).toBe(true);
    // Same children in a container sized as if there were no padding.
    expect(growFitsContainer({ ...opts, parentLength: 816 })).toBe(false);
  });

  it("refuses when the growing children are not all the same size", () => {
    // 300 + 500 + 400 + 2 × 16 = 1232 — fits, but two grow candidates differ,
    // so Figma would even them out and destroy the measured proportions.
    expect(
      growFitsContainer({
        parentLength: 1232,
        paddingStart: 0,
        paddingEnd: 0,
        childLengths: [300, 500, 400],
        itemSpacing: 16,
        growIndices: [0, 1],
      })
    ).toBe(false);
  });

  it("allows a fitting row whose single grow candidate sits among fixed siblings", () => {
    expect(
      growFitsContainer({
        parentLength: 1232,
        paddingStart: 0,
        paddingEnd: 0,
        childLengths: [300, 500, 400],
        itemSpacing: 16,
        growIndices: [1],
      })
    ).toBe(true);
  });

  it("allows a lone child that fills its container", () => {
    expect(
      growFitsContainer({
        parentLength: 400,
        paddingStart: 0,
        paddingEnd: 0,
        childLengths: [400],
        itemSpacing: 16,
        growIndices: [0],
      })
    ).toBe(true);
  });

  it("tolerates sub-pixel rounding", () => {
    const within = growFitsContainer({
      parentLength: 1232,
      paddingStart: 0,
      paddingEnd: 0,
      childLengths: [400.2, 399.8, 400.4],
      itemSpacing: 16,
      growIndices: [],
    });
    expect(within).toBe(true);

    const beyond = growFitsContainer({
      parentLength: 1232,
      paddingStart: 0,
      paddingEnd: 0,
      childLengths: [400, 400, 405],
      itemSpacing: 16,
      growIndices: [],
    });
    expect(beyond).toBe(false);
  });

  it("treats an empty container as fitting — there is nothing to squeeze", () => {
    expect(
      growFitsContainer({
        parentLength: 1232,
        paddingStart: 0,
        paddingEnd: 0,
        childLengths: [],
        itemSpacing: 16,
        growIndices: [],
      })
    ).toBe(true);
  });
});
