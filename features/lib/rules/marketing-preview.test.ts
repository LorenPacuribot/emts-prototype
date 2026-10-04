/** Feature 34 — post preview rules. */
import { describe, expect, it } from "vitest";
import { CAPTION_CUT, captionParts, frameRatio, igHandle, truncateCaption } from "./marketing-preview";

describe("Feature 34 — post preview", () => {
  it("shows a crop at its format and holds other photos to Instagram's 4:5 – 1.91:1 range", () => {
    expect(frameRatio({ crop: { format: "vertical", template: "" } })).toBe(0.8);
    expect(frameRatio({ crop: { format: "square", template: "" } })).toBe(1);
    expect(frameRatio({ width: 3000, height: 4000 })).toBe(0.8);
    expect(frameRatio({ width: 4000, height: 1000 })).toBe(1.91);
    expect(frameRatio({ width: 1600, height: 1200 })).toBeCloseTo(1.333, 3);
    expect(frameRatio(undefined)).toBe(1);
  });

  it("cuts the caption at a word before the feed's limit, and keeps short captions whole", () => {
    const long = "Fresh coat on a craftsman bungalow in Lakewood. ".repeat(6);
    const ig = truncateCaption(long, CAPTION_CUT.instagram);
    expect(ig.cut).toBe(true);
    expect(ig.shown.length).toBeLessThanOrEqual(125);
    expect(long.startsWith(ig.shown)).toBe(true);
    expect(truncateCaption("Short and sweet.", CAPTION_CUT.facebook)).toEqual({ shown: "Short and sweet.", cut: false });
    expect(truncateCaption("one\ntwo\nthree", CAPTION_CUT.instagram)).toEqual({ shown: "one\ntwo", cut: true });
  });

  it("marks hashtags, mentions and links", () => {
    expect(captionParts("Done in Lakewood #painting by @crew see https://x.co/a")).toEqual([
      { text: "Done in Lakewood ", link: false }, { text: "#painting", link: true }, { text: " by ", link: false },
      { text: "@crew", link: true }, { text: " see ", link: false }, { text: "https://x.co/a", link: true },
    ]);
  });

  it("derives an Instagram handle from the account name", () => {
    expect(igHandle("@estimatemaster.test")).toBe("estimatemaster.test");
    expect(igHandle("Estimate Master Painting")).toBe("estimatemasterpainting");
  });
});
