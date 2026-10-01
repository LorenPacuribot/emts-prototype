/**
 * Lead sources (2 Oct 2026, D6). Pure.
 *
 * The organisation manages its own list in Settings › Pipeline Stages ›
 * Lead sources. Eight are built in and can't be deleted: Website, Facebook,
 * Instagram, Google, Referral, Repaint alert, Manual and Other. Admins add,
 * rename and deactivate the rest. A name is required, at most 30 characters
 * and unique. A source with leads can be deactivated, not deleted.
 *
 * Tracked links pick from the active sources; a link's tag (?src=) and the
 * Source filter and Group by Source on the board resolve against this list.
 */

export interface SourceDef {
  id: string;
  name: string;
  builtIn: boolean;
  active: boolean;
  /** Names it had before a rename, so leads that carry them keep their source. */
  aliases?: string[];
}

export const BUILT_IN_SOURCES = ["Website", "Facebook", "Instagram", "Google", "Referral", "Repaint alert", "Manual", "Other"] as const;
/** Added by an admin in the demo organisation. */
export const SEEDED_SOURCES = ["Nextdoor", "Thumbtack", "Angi", "Yard Sign"] as const;
export const MAX_SOURCE_NAME = 30;
export const OTHER_SOURCE = "Other";

/** "Yard Sign", "yard-sign" and "yard_sign" are the same source. */
export const sourceKey = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, "");

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** Short tags websites use for the built-in sources. */
const ALIASES: Record<string, string> = { fb: "Facebook", ig: "Instagram", repaint: "Repaint alert" };

export function defaultSources(): SourceDef[] {
  return [
    ...BUILT_IN_SOURCES.map((name) => ({ id: `src_${slug(name)}`, name, builtIn: true, active: true })),
    ...SEEDED_SOURCES.map((name) => ({ id: `src_${slug(name)}`, name, builtIn: false, active: true })),
  ];
}

/** Why this name can't be saved, or undefined. `exceptId` is the source being renamed. */
export function validateSourceName(name: string, list: Pick<SourceDef, "id" | "name">[], exceptId?: string): string | undefined {
  const n = name.trim();
  if (!n) return "Enter a name.";
  if (n.length > MAX_SOURCE_NAME) return `Keep the name to ${MAX_SOURCE_NAME} characters or fewer.`;
  if (list.some((s) => s.id !== exceptId && sourceKey(s.name) === sourceKey(n))) return "That source already exists.";
  return undefined;
}

/** Why this source can't be deleted, or undefined. */
export function deleteBlocker(source: Pick<SourceDef, "builtIn">, leadCount: number): string | undefined {
  if (source.builtIn) return "Built-in sources can't be deleted.";
  if (leadCount > 0) return "This source has leads. Deactivate it instead.";
  return undefined;
}

/** Built-in sources stay active (Other and Website catch everything else). */
export function deactivateBlocker(source: Pick<SourceDef, "builtIn">): string | undefined {
  return source.builtIn ? "Built-in sources stay active." : undefined;
}

/** A rename keeps the old name as an alias (leads and links that carry it still resolve). */
export function renamed<T extends SourceDef>(source: T, name: string): T {
  const aliases = [...new Set([...(source.aliases ?? []), source.name])].filter((a) => sourceKey(a) !== sourceKey(name));
  return { ...source, name: name.trim(), aliases };
}

/** Active source names, in list order: what tracked links offer. */
export const activeSourceNames = (list: SourceDef[]) => list.filter((s) => s.active).map((s) => s.name);

/**
 * The list's name for a lead's source label, or Other when the list doesn't
 * have it. Inactive sources still resolve, so their leads keep their source.
 */
export function resolveSource(label: string | undefined, list: Pick<SourceDef, "name" | "aliases">[]): string {
  const key = sourceKey(label ?? "");
  if (!key) return OTHER_SOURCE;
  const alias = ALIASES[key];
  const hit = list.find((s) => sourceKey(s.name) === key)
    ?? list.find((s) => s.aliases?.some((a) => sourceKey(a) === key))
    ?? (alias ? list.find((s) => s.name === alias) : undefined);
  return hit?.name ?? OTHER_SOURCE;
}

/**
 * The lead source for a website enquiry, in this order:
 *  1. the tracked link's tag (?src=), resolved against the active sources
 *     (an unknown or inactive tag is Other);
 *  2. the referring site: facebook.com → Facebook, instagram.com → Instagram, google → Google;
 *  3. otherwise Website.
 */
export function leadSourceFor({ src, referrer }: { src?: string; referrer?: string }, list: SourceDef[] = defaultSources()): string {
  const tag = (src ?? "").trim();
  if (tag) return resolveSource(tag, list.filter((s) => s.active));
  let host = "";
  try {
    host = referrer ? new URL(referrer).hostname.toLowerCase() : "";
  } catch {
    host = "";
  }
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(host)) return "Facebook";
  if (/(^|\.)instagram\.com$/.test(host)) return "Instagram";
  if (/(^|\.)google\./.test(host)) return "Google";
  return "Website";
}
