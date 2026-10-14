"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/* ═══ ארנק — מאזני-20-החשבונות האמיתיים ממצב-המנוע ═══════════════════════
 * treasury · operator · arena · soldiers · bots · vaults — הכל מדיד מהסנאפשוט.
 * אפס-הבטחות; מספר שלא נמדד לא מוצג. */

interface AccountRow { name: string; balances: Record<string, number> }
interface DexPayload {
  ok: boolean; note?: string; accounts: AccountRow[]; assets: string[];
  height: number | null; savedAt: string | null; fetchedAt: string;
}

const HE: Record<string, string> = {
  treasury: "אוצר", operator: "מפעיל-מנוע", arena: "זירה", save: "כיס-חיסכון",
  "save-pot": "כיס-חיסכון", "ve-vault": "כספת-VE", "ve-pot": "כיס-VE", "lend-pot": "כיס-הלוואות",
  rail: "מסילה", "reserve-vault": "כספת-רזרבה", sweeper: "סוויפר", wash: "ווש",
  "vault-pot": "כיס-כספת",
};
function heName(n: string): string {
  if (HE[n]) return HE[n];
  if (n.startsWith("soldier-")) return `חייל ${n.split("-")[1]}`;
  if (n.startsWith("bot-")) return `בוט ${n.split("-")[1].toUpperCase()}`;
  return n;
}
function fmt(v: number): string {
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toLocaleString("en-US");
}
function timeHe(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

export function WalletView() {
  const [dex, setDex] = useState<DexPayload | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/giant/dex", { cache: "no-store" });
      const d = (await res.json()) as DexPayload;
      setDex(d);
      setErr(d.ok ? "" : d.note ?? "לא נמדד");
    } catch {
      setErr("השרת לא נגיש כרגע");
    }
  }, []);

  useEffect(() => {
    const t0 = setTimeout(load, 0);
    const iv = setInterval(load, 45_000);
    return () => { clearTimeout(t0); clearInterval(iv); };
  }, [load]);

  const tokens = useMemo(() => {
    const set = new Set<string>();
    for (const a of dex?.accounts ?? []) for (const k of Object.keys(a.balances)) set.add(k);
    return [...set].sort((x, y) => {
      const w = (t: string) => (t.startsWith("LP|") ? 2 : t === "SAOS" ? 0 : t === "USDS" ? 1 : 3);
      return w(x) - w(y) || x.localeCompare(y);
    });
  }, [dex]);

  const filtered = useMemo(() => {
    const rows = dex?.accounts ?? [];
    if (!q.trim()) return rows;
    const s = q.trim().toLowerCase();
    return rows.filter((a) => a.name.toLowerCase().includes(s) || heName(a.name).includes(s));
  }, [dex, q]);

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const a of dex?.accounts ?? []) for (const [k, v] of Object.entries(a.balances)) t[k] = (t[k] ?? 0) + v;
    return t;
  }, [dex]);

  return (
    <div className="space-y-4" dir="rtl">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-zinc-900/60 px-4 py-3">
        <div>
          <h2 className="text-sm font-black text-zinc-100">ארנק-הריבונות — {dex?.accounts.length ?? "—"} חשבונות מהמנוע</h2>
          <p className="mt-0.5 text-[10px] text-zinc-500">מאזני-אמת מ-state-snapshot · גובה {dex?.height?.toLocaleString("en-US") ?? "—"} · snapshot {timeHe(dex?.savedAt ?? null)}</p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש חשבון…"
          aria-label="חיפוש חשבון"
          className="h-10 w-48 rounded-lg border border-white/15 bg-zinc-900 px-3 text-xs text-zinc-100 outline-none focus:border-amber-500/70"
        />
      </section>
      {err && <p className="text-xs text-red-400">{err}</p>}

      {/* סיכום-סה"כ */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {tokens.slice(0, 6).map((t) => (
          <article key={t} className="rounded-xl border border-white/10 bg-zinc-900/60 p-3 text-center">
            <p className="truncate font-mono text-[10px] text-zinc-500">{t.startsWith("LP|") ? t.replace("LP|", "") : t}</p>
            <p className="mt-1 font-mono text-sm font-black text-zinc-100">{fmt(totals[t] ?? 0)}</p>
            <p className="text-[9px] text-zinc-600">סה"כ בכל-החשבונות</p>
          </article>
        ))}
      </section>

      {/* טבלת-חשבונות */}
      <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
        <div className="max-h-[480px] overflow-auto pr-1">
          <table className="w-full min-w-[720px] text-right text-xs">
            <thead className="sticky top-0 z-10 bg-zinc-900/95 text-[10px] uppercase text-zinc-500 backdrop-blur">
              <tr>
                <th className="px-2 py-2">חשבון</th>
                {tokens.map((t) => (
                  <th key={t} className="px-2 py-2 font-mono">{t.replace("LP|", "")}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.name} className="border-t border-white/5 transition hover:bg-white/[0.02]">
                  <td className="px-2 py-2">
                    <span className="font-semibold text-zinc-200">{heName(a.name)}</span>
                    <span className="mr-1.5 font-mono text-[9px] text-zinc-600">{a.name}</span>
                  </td>
                  {tokens.map((t) => {
                    const v = a.balances[t] ?? 0;
                    return (
                      <td key={t} className={`px-2 py-2 font-mono ${v > 0 ? "text-zinc-300" : "text-zinc-700"}`}>
                        {v > 0 ? fmt(v) : "·"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {dex && filtered.length === 0 && <p className="py-4 text-center text-xs text-zinc-500">לא נמצא חשבון</p>}
        </div>
      </section>
    </div>
  );
}
