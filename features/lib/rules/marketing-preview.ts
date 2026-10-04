/**
 * Feature 34 — post preview: pure rules for drawing a post the way the
 * Facebook and Instagram feeds show it. A close likeness only: Meta has no
 * preview service for organic posts, and the platform decides the final crop.
 */
import type { MediaAsset } from "@/features/types";

/** Feed shapes, as width ÷ height. Instagram takes 4:5 portrait to 1.91:1 landscape. */
export const PORTRAIT_4_5 = 0.8;
export const LANDSCAPE_191 = 1.91;

/** Where each feed cuts the caption off behind "See more" / "more". */
export const CAPTION_CUT = {
  facebook: { chars: 240, lines: 4 },
  instagram: { chars: 125, lines: 2 },
} as const;

/** The shape a photo is shown at: its crop format, else its own shape, held to the 4:5 – 1.91:1 range. */
export function frameRatio(a: Pick<MediaAsset, "crop" | "width" | "height"> | undefined): number {
  if (a?.crop) return a.crop.format === "vertical" ? PORTRAIT_4_5 : 1;
  const r = a?.width && a?.height ? a.width / a.height : 1;
  return Math.min(LANDSCAPE_191, Math.max(PORTRAIT_4_5, r));
}

/** The caption as first shown: cut at a word before the character or line limit. */
export function truncateCaption(text: string, cut: { chars: number; lines: number }): { shown: string; cut: boolean } {
  const lines = text.split("\n");
  let shown = lines.slice(0, cut.lines).join("\n");
  let wasCut = lines.length > cut.lines;
  if (shown.length > cut.chars) {
    const slice = shown.slice(0, cut.chars);
    const space = slice.lastIndexOf(" ");
    shown = (space > cut.chars * 0.6 ? slice.slice(0, space) : slice).trimEnd();
    wasCut = true;
  }
  return { shown, cut: wasCut };
}

/** Splits a caption so hashtags, @mentions and links can be coloured as the feeds do. */
export function captionParts(text: string): { text: string; link: boolean }[] {
  return text.split(/(#[\p{L}\p{N}_]+|@[\w.]+|https?:\/\/\S+)/u).filter(Boolean).map((t) => ({ text: t, link: /^[#@]|^https?:/.test(t) }));
}

/** An Instagram handle from the connected account's name. */
export function igHandle(name: string): string {
  return name.startsWith("@") ? name.slice(1) : name.toLowerCase().replace(/[^a-z0-9._]+/g, "");
}
