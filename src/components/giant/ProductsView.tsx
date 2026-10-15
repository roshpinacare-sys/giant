"use client";

import { useCallback, useEffect, useState } from "react";
import { FlowHeartbeat } from "@/components/giant/FlowHeartbeat";
import { useFlow } from "@/hooks/use-flow";

/* ═══ המוצרים — קטלוג-אמת מ-Domain/marketing/products.json (Task 40 גל-3) ═══
 * מהדורת-ענקים: כל-מוצר = כרטיס-מלא — שם-עברי · תיאור · מדידות-חיות ·
 * קבלות-משורשות (txid) · קישורי-משטח. אפס-הבטחות-תשואה; סטטוסים כנים.
 *
 * T63-b anti-gibberish (חוק-הבעלים): כל-קישור נמדד. ספר-המוצרים הוא התצוגה
 * הזאת — אין-דף-חוץ; דפי-ה-github.io הישנים (Domain/*.html) = גיבוב שנאסר.
 * קישור-חי נשאר רק לסיירי-שרשרת אמיתיים (קבלות-txid שאומתו על-השרשרת). */

interface Measured { label: string; value: string }
interface Receipt { label: string; url: string; block?: string }
interface ProductRaw {
  nameHe?: string; whatHe?: string; statusHe?: string;
  measured?: Measured[]; receipts?: Receipt[]; links?: string[];
}
interface ProductRow {
  id: string; name: string; status: string; blurb: string; repo: string; url: string;
  raw: ProductRaw;
}
interface ProductsPayload {
  ok: boolean; note?: string; wave: string | null; generatedAt: string | null;
  discipline: string | null; servedAt?: unknown; products: ProductRow[]; fetchedAt: string;
}

function statusChip(status: string, statusHe?: string): { cls: string; he: string } {
  const base = "rounded-full px-2.5 py-0.5 text-[10px] font-bold max-w-full truncate";
  if (statusHe) {
    const live = status.includes("live");
    return { cls: `${base} ${live ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`, he: statusHe };
  }
  if (status.includes("live-metered")) return { cls: `${base} bg-emerald-500/10 text-emerald-400`, he: "חי · מדוד" };
  if (status.includes("phase1-live")) return { cls: `${base} bg-amber-500/10 text-amber-400`, he: "פאזה-1 חיה" };
  if (status.includes("demo-live")) return { cls: `${base} bg-zinc-500/15 text-zinc-300`, he: "דמו-חי" };
  if (status.includes("live")) return { cls: `${base} bg-emerald-500/10 text-emerald-400`, he: "חי" };
  return { cls: `${base} bg-zinc-500/15 text-zinc-300`, he: status };
}

/* סיירי-שרשרת שנמדדו חי (T63-b: STEEM/HIVE/ETH/SOL txid אומתו מול RPC/API) —
 * רק-אליהם מותר לקשר כקבלה; כל-יתר-היעדים מוצגים כטקסט בלבד. */
const RECEIPT_EXPLORERS = [
  "etherscan.io",
  "steemscan.com",
  "hive.ausbit.dev",
  "solscan.io",
  "solscan.com",
  "blockscout.com",
];

function isRootedReceipt(u: string): boolean {
  try {
    const h = new URL(u).hostname;
    return RECEIPT_EXPLORERS.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/** נתיב-תצוגה ליעד-גיבוב — מוצג כטקסט-מונו בלבד (אין-דף-חי) */
function surfacePath(u: string): string {
  try {
    return new URL(u).pathname.replace(/^\//, "").replace(/\/$/, "") || u;
  } catch {
    return u;
  }
}

/** תווית-מדידה עברית לתצוגה — ה-labels בקנון הם מילים-אנגליות-טכניות */
const MEASURED_HE: Record<string, string> = {
  networks: "רשתות", milestones: "אבני-דרך", wrappedAssets: "נכסים-עטופים",
  mintLockTxid: "txid-הטבעה", costPerRecord: "עלות-לרשומה", payloadCompression: "דחיסת-payload",
  freeOpsMatrix: "מטריצת-חינם", tests: "מבחנים", kernelOps: "ops מנוע-ליבה",
  measuredSpread: "פישוק-נמדד", fees: "עמלות", chaosSuite: "סולמת-כאוס",
  invariants: "אינווריאנטות", anchors: "עיגונים", verification: "אימות",
  sdk: "SDK", latency: "השהיה", uptime: "זמינות", accuracy: "דיוק",
};

export function ProductsView() {
  const [data, setData] = useState<ProductsPayload | null>(null);
  const [err, setErr] = useState("");
  const { flow, trajectory } = useFlow(); // T70-המשך · דופק-הזרימה-החי גם-בקטלוג

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

  const live = (data?.products ?? []).filter((p) => p.status.includes("live"));

  return (
    <div className="space-y-4" dir="rtl">
      {/* כותרת-הקטלוג */}
      <section className="rounded-2xl border border-white/10 bg-zinc-900/60 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-black text-zinc-100">
            המוצרים הריבוניים — {data?.products.length ?? "—"} בקטלוג
            {data && <span className="mr-2 font-mono text-[10px] font-normal text-emerald-400">{live.length} חיים</span>}
          </h2>
          <span
            className="rounded-full border border-amber-600/40 bg-amber-500/[0.06] px-2.5 py-1 text-[10px] font-semibold text-amber-400"
            title="T63-b · חוק-הבעלים: אי אפשר להפנות לבורסה או למוצרים ואז לקבל דף-ישן מהעמודים המסורבלים"
          >
            המוצרים חיים כאן בלבד — אין-דף-חוץ · דפי-נחיתה-ישנים = גיבוב, נאסרו-על-ידי-הבעלים
          </span>
        </div>
        {data?.wave && <p className="mt-0.5 text-[10px] text-zinc-500">{data.wave} · עודכן {data.generatedAt?.slice(0, 10)}</p>}
        {data?.discipline && (
          <p className="mt-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2 text-[10px] leading-4 text-emerald-300/90">
            {data.discipline}
          </p>
        )}
      </section>
      {err && <p className="text-xs text-red-400">{err}</p>}

      {/* T70-המשך · דופק-הזרימה — המנוע-שמניע-את-הקטלוג (fail-honest) */}
      <FlowHeartbeat flow={flow} trajectory={trajectory} label="דופק-הזרימה — המנוע-שמניע-את-המוצרים" />

      {/* כרטיסי-מוצר מלאים */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(data?.products ?? []).map((p) => {
          const chip = statusChip(p.status, p.raw?.statusHe);
          const measured = p.raw?.measured ?? [];
          const receipts = p.raw?.receipts ?? [];
          const links = p.raw?.links ?? (p.url ? [p.url] : []);
          return (
            <article key={p.id} className="flex flex-col rounded-2xl border border-white/10 bg-zinc-900/60 p-5 transition hover:border-amber-600/30">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-base font-black leading-6 text-zinc-100">{p.raw?.nameHe || p.name || p.id}</h3>
                  <p className="mt-0.5 font-mono text-[10px] text-zinc-600">{p.repo || p.id}</p>
                </div>
                <span className={chip.cls}>{chip.he}</span>
              </div>

              {(p.raw?.whatHe || p.blurb) && (
                <p className="mt-2.5 text-xs leading-6 text-zinc-400">{p.raw?.whatHe || p.blurb}</p>
              )}

              {/* מדידות-חיות */}
              {measured.length > 0 && (
                <div className="mt-3.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {measured.map((m) => (
                    <div key={m.label} className="rounded-lg border border-white/5 bg-zinc-950 px-2.5 py-1.5">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-600">{MEASURED_HE[m.label] ?? m.label}</p>
                      <p className="mt-0.5 break-words font-mono text-[11px] font-semibold leading-4 text-zinc-300">{m.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* קבלות-משורשות (txid) */}
              {receipts.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-zinc-600">קבלות-משורשות</p>
                  {receipts.map((r) =>
                    isRootedReceipt(r.url) ? (
                      <a
                        key={r.url}
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`${r.url} — קבלה אומתה על-השרשרת (T63-b)`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-zinc-950 px-2.5 py-1.5 text-[11px] transition hover:border-amber-600/40"
                      >
                        <span className="font-semibold text-zinc-300">{r.label}</span>
                        <span className="flex items-center gap-1.5">
                          {r.block && <span className="font-mono text-[9px] text-zinc-600">block {r.block}</span>}
                          <span className="text-amber-500">↗</span>
                        </span>
                      </a>
                    ) : (
                      <div key={r.url} className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-zinc-950 px-2.5 py-1.5 text-[11px]">
                        <span className="min-w-0 truncate font-mono text-zinc-500" dir="ltr" title={r.url}>
                          {surfacePath(r.url)}
                        </span>
                        <span className="shrink-0 rounded-full border border-amber-600/40 bg-amber-500/[0.06] px-2 py-0.5 text-[9px] font-semibold text-amber-400">בלי-דף-חי</span>
                      </div>
                    ),
                  )}
                </div>
              )}

              {/* תחתית-הכרטיס: נתיבי-הפניה — כולם דפי-github.io ישנים שנאסרו (T63-b) →
                  מוצגים כטקסט-מונו בלבד, בלי-קישור, עם צ'יפ כנה */}
              <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
                {links.length > 0 ? (
                  links.map((l) => (
                    <span key={l} className="flex items-center gap-1.5 rounded-lg border border-white/5 bg-zinc-950 px-2.5 py-1.5" title={l}>
                      <span className="font-mono text-[10px] text-zinc-500" dir="ltr">
                        {surfacePath(l)}
                      </span>
                      <span className="shrink-0 rounded-full border border-amber-600/40 bg-amber-500/[0.06] px-2 py-0.5 text-[9px] font-semibold text-amber-400">בלי-דף-חי</span>
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] text-zinc-600">אין-דף-חוץ — המוצר חי כאן בלבד</span>
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
