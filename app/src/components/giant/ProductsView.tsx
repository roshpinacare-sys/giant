"use client";

import { useCallback, useEffect, useState } from "react";

/* ═══ המוצרים — קטלוג-אמת מ-Domain/marketing/products.json ═══════════════
 * חוק-הקטלוג: כל-טענה נושאת-קבלה משורשת; סטטוסים כנים; אפס-הבטחות-תשואה. */

interface ProductRow { id: string; name: string; status: string; blurb: string; repo: string; url: string }
interface ProductsPayload {
  ok: boolean; note?: string; wave: string | null; generatedAt: string | null;
  discipline: string | null; products: ProductRow[]; fetchedAt: string;
}

function statusChip(s: string): { cls: string; he: string } {
  const base = "rounded-full px-2.5 py-0.5 text-[10px] font-bold";
  if (s.includes("live-metered")) return { cls: `${base} bg-emerald-500/10 text-emerald-400`, he: "חי · מדוד" };
  if (s.includes("phase1-live")) return { cls: `${base} bg-amber-500/10 text-amber-400`, he: "פאזה-1 חיה" };
  if (s.includes("demo-live")) return { cls: `${base} bg-zinc-500/15 text-zinc-300`, he: "דמו-חי" };
  if (s.includes("live")) return { cls: `${base} bg-emerald-500/10 text-emerald-400`, he: "חי" };
  return { cls: `${base} bg-zinc-500/15 text-zinc-300`, he: s };
}

export function ProductsView() {
  const [data, setData] = useState<ProductsPayload | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/giant/products", { cache: "no-store" });
      const d = (await res.json()) as ProductsPayload;
      setData(d);
      setErr(d.ok ? "" : d.note ?? "לא נמדד");
    } catch {
      setErr("השרת לא נגיש כרגע");
    }
  }, []);

  useEffect(() => {
    const t0 = setTimeout(load, 0);
    return () => clearTimeout(t0);
  }, [load]);

  return (
    <div className="space-y-4" dir="rtl">
      <section className="rounded-2xl border border-white/10 bg-zinc-900/60 px-4 py-3">
        <h2 className="text-sm font-black text-zinc-100">המוצרים הריבוניים — {data?.products.length ?? "—"} בקטלוג</h2>
        {data?.wave && <p className="mt-0.5 text-[10px] text-zinc-500">{data.wave} · עודכן {data.generatedAt?.slice(0, 10)}</p>}
        {data?.discipline && <p className="mt-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2 text-[10px] leading-4 text-emerald-300/90">{data.discipline}</p>}
      </section>
      {err && <p className="text-xs text-red-400">{err}</p>}

      <div className="grid gap-3 md:grid-cols-2">
        {(data?.products ?? []).map((p) => {
          const chip = statusChip(p.status);
          return (
            <article key={p.id} className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4 transition hover:border-amber-600/30">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-mono text-sm font-bold text-zinc-100">{p.name || p.id}</h3>
                <span className={chip.cls}>{chip.he}</span>
              </div>
              {p.blurb && <p className="mt-2 text-xs leading-5 text-zinc-400">{p.blurb}</p>}
              <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2 text-[10px]">
                <span className="font-mono text-zinc-600">{p.repo || p.id}</span>
                {p.url && (
                  <a href={p.url} target="_blank" rel="noreferrer" className="font-semibold text-amber-500 transition hover:text-amber-400">
                    פתח משטח ↗
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {data && data.products.length === 0 && <p className="text-center text-xs text-zinc-500">הקטלוג לא נמדד כרגע</p>}
    </div>
  );
}
