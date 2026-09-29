/**
 * US spelling for text that comes from stored data (activity log module names
 * and messages, seed records, correction field names) or from rule strings the
 * tests pin. The stored value is never changed; only what is shown (H9).
 */
const US: [RegExp, string][] = [
  [/\bColour/g, "Color"],
  [/\bcolour/g, "color"],
  [/\bLabour/g, "Labor"],
  [/\blabour/g, "labor"],
  [/\b([Cc])ancelled\b/g, "$1anceled"],
  [/\b([Cc])ancelling\b/g, "$1anceling"],
  [/\b([Ff])avourite/g, "$1avorite"],
  [/\b([Bb])ehaviour/g, "$1ehavior"],
  [/\b([Aa])uthoris(e|ed|es|er|ers|ing|ation)\b/g, "$1uthoriz$2"],
];

export function usText(text: string): string;
export function usText(text: string | undefined | null): string | undefined;
export function usText(text: string | undefined | null) {
  if (text == null) return undefined;
  return US.reduce((s, [re, to]) => s.replace(re, to), text);
}
