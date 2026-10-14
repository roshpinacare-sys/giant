// giant DEX · עוזרי-עיצוב-מספרים משותפים (פרונט-בלבד, טהור)

const heNum = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 });
const heNum0 = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 });

/** נפח/נזילות ב-µ-USDS: 462,400 → "462.4K µ" */
export function fmtMicro(v: number): string {
  if (!isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B µ`;
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M µ`;
  if (a >= 1_000) return `${(v / 1_000).toFixed(1)}K µ`;
  return `${heNum0.format(v)} µ`;
}

/** מחיר עם דיוק-דינמי: BTC 67,418.2 · GNT 1.8420 · DOGE 0.1618 */
export function fmtPrice(p: number): string {
  if (!isFinite(p)) return "—";
  const a = Math.abs(p);
  let d = 2;
  if (a < 0.01) d = 6;
  else if (a < 0.1) d = 5;
  else if (a < 1) d = 4;
  else if (a < 10) d = 4;
  else if (a < 1000) d = 3;
  else if (a >= 10000) d = 1;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: Math.min(d, 2),
    maximumFractionDigits: d,
  }).format(p);
}

export function fmtPct(p: number): string {
  const s = p >= 0 ? "+" : "";
  return `${s}${p.toFixed(2)}%`;
}

export function fmtAmount(v: number): string {
  if (!isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (a >= 10_000) return heNum0.format(Math.round(v));
  return heNum.format(v);
}

export function fmtUsd(v: number): string {
  return `$${fmtAmount(v)}`;
}

const heClock = new Intl.DateTimeFormat("he-IL", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const heDay = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
});

export function fmtClock(iso: string | number | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  return heClock.format(d);
}

export function fmtDaySec(epochSec: number): string {
  return heDay.format(new Date(epochSec * 1000));
}

export function timeAgoHe(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `לפני ${s} שנ׳`;
  const m = Math.round(s / 60);
  if (m < 60) return `לפני ${m} דק׳`;
  const h = Math.round(m / 60);
  if (h < 24) return `לפני ${h} שע׳`;
  return `לפני ${Math.round(h / 24)} ימ׳`;
}

export const CHAIN_COLORS: Record<string, string> = {
  "Giant Chain": "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  Ethereum: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300",
  "BNB Chain": "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  Solana: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  Tron: "bg-red-500/15 text-red-700 dark:text-red-400",
  TON: "bg-teal-500/15 text-teal-700 dark:text-teal-400",
};

export function chainColor(chain: string): string {
  return CHAIN_COLORS[chain] ?? "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300";
}

/** צבע-כיוון מאוחד: עלייה=אמרלד, ירידה=אדום-רוז' */
export const upColor = "text-emerald-600 dark:text-emerald-400";
export const downColor = "text-red-600 dark:text-red-400";
export function trendColor(v: number): string {
  return v >= 0 ? upColor : downColor;
}
export function trendBg(v: number): string {
  return v >= 0
    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    : "bg-red-500/10 text-red-600 dark:text-red-400";
}
