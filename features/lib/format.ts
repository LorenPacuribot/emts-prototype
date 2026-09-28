/** Display formatting. Never feed these outputs back into calculations (Rule 6). */

export function money(n: number | undefined, opts: { cents?: boolean } = {}): string {
  if (n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts.cents === false ? 0 : 2,
    maximumFractionDigits: opts.cents === false ? 0 : 2,
  });
}

export function gal(n: number | undefined): string {
  if (n === undefined) return "—";
  return `${n.toFixed(2)} gal`;
}

export function num(n: number, digits = 0): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function date(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

export function dateLong(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function dateTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function relDays(iso: string, nowIso: string): string {
  const days = Math.round((new Date(iso).getTime() - new Date(nowIso).getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days > 0) return `in ${days} day${days === 1 ? "" : "s"}`;
  return `${-days} day${days === -1 ? "" : "s"} ago`;
}

export function pct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
