"use client";

/* ═══ מכונת-הריבונות · הדמות-האמת של המערכת ═══════════════════════════════
 * נבנה-על-פי-תורת ה-anatomy (wheresryan22/anatomy — MIT, נבחן-ואומץ):
 * · המערכת מוסברת כמכונה פיזית אמיתית — חלקים-מוצקים, סדר-צייר, הצללה-ארבע-גונית.
 * · כל-מספר-על-הכרטיס מגיע מאותו-מקור-מדידה שמזיז את חלקי-המכונה — אפס-קישוט.
 * · כשל-מדידה מוצג ככשל ("—") — לעולם לא מספר-מזויף.
 * · כל-חלק הוא דלת: לחיצה פותחת את המודול האמיתי שלו בממשק-המאוחד. */

import { useCallback, useEffect, useMemo, useState } from "react";
import * as K from "@/lib/anatomy/iso-kit";
import { Solid, Line, Wire, Dots, FaceText, IsoFigure, Plate } from "@/lib/anatomy/react/draw";
import { useReadout, useEased } from "@/lib/anatomy/react/live";

/* ─── מדידה: מבני-ה-API האמיתיים ─── */
interface Candle { t: number; c: number }
interface DayMetrics { day: string; vol24QuoteMu: number | null; trades24: number | null }
interface AccountRow { name: string; balances: Record<string, number> }
interface DexPayload {
  ok: boolean; note?: string; height: number | null;
  pairs?: { name: string; candles: Candle[] }[];
  accounts?: AccountRow[];
  metrics?: DayMetrics[];
  treasuryProfitEver?: number | null;
  grid?: { armed?: boolean; real?: boolean; filledTotal?: number | null; inventory?: Record<string, number | undefined> | null; externalFlowUsd?: number | null } | null;
}
interface ChannelPayload { ok: boolean; directives?: { id: string; title: string; status: string }[] }
interface PulsePayload {
  ok: boolean; truth?: { verdict: string | null } | null;
  channel?: { directives: number; requestsOpen: number; requestsCanonical: number };
}

interface MachineData {
  price: number | null; priceLow: number | null; priceHigh: number | null;
  vol24: number | null; trades24: number | null; height: number | null;
  treasuryEver: number | null; walletSaos: number | null; accounts: number | null;
  gridArmed: boolean | null; gridReal: boolean | null; gridFilled: number | null; gridFlow: number | null;
  directives: number | null; lastDirective: string | null;
  truthVerdict: string | null; reqOpen: number | null; reqTotal: number | null;
  at: string; notes: string[];
}

const MU = 1000; /* חוק-היחידות (Task-42): כל-הספרים ב-µ — התצוגה תמיד ביחידות-אמת */

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch { return null; }
}

function derive(dex: DexPayload | null, ch: ChannelPayload | null, pulse: PulsePayload | null): MachineData {
  const notes: string[] = [];
  const pair = dex?.pairs?.[0];
  const closes = (pair?.candles ?? []).slice(-48).map((c) => c.c / MU).filter((v) => Number.isFinite(v));
  const price = closes.length ? closes[closes.length - 1] : null;
  if (!dex?.ok) notes.push("מדידת-הדקס נכשלה — מוצג כשל, לא מספר");
  if (!ch?.ok) notes.push("מדידת-הערוץ נכשלה — מוצג כשל");
  if (!pulse?.ok) notes.push("מדידת-הדופק נכשלה — מוצג כשל");
  const metrics = dex?.metrics?.[dex.metrics.length - 1] ?? null;
  const accounts = dex?.accounts ?? [];
  const walletSaos = accounts.length
    ? accounts.reduce((sum, a) => sum + (a.balances?.SAOS ?? 0), 0) / MU
    : null;
  const directives = pulse?.channel?.directives ?? ch?.directives?.length ?? null;
  return {
    price,
    priceLow: closes.length ? Math.min(...closes) : null,
    priceHigh: closes.length ? Math.max(...closes) : null,
    vol24: metrics?.vol24QuoteMu != null ? metrics.vol24QuoteMu / MU : null,
    trades24: metrics?.trades24 ?? null,
    height: dex?.height ?? null,
    treasuryEver: dex?.treasuryProfitEver != null ? dex.treasuryProfitEver / MU : null,
    walletSaos,
    accounts: dex?.accounts?.length ?? null,
    gridArmed: dex?.grid?.armed ?? null,
    gridReal: dex?.grid?.real ?? null,
    gridFilled: dex?.grid?.filledTotal ?? null,
    gridFlow: dex?.grid?.externalFlowUsd ?? null,
    directives,
    lastDirective: ch?.directives?.[ch.directives.length - 1]?.title ?? null,
    truthVerdict: pulse?.truth?.verdict ?? null,
    reqOpen: pulse?.channel?.requestsOpen ?? null,
    reqTotal: pulse?.channel?.requestsCanonical ?? null,
    at: new Date().toISOString(),
    notes,
  };
}

const fmt = (v: number | null | undefined, digits = 0) =>
  v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: digits });

/* ─── גיאומטריה: עולם-המכונה ─── */
const BASE = { x: -180, y: -150, w: 370, d: 305, r: 10 };
const TOP = 10; /* גובה-פני-השולחן */
const VIEW_W = 940;
const VIEW_H = 560;

/* מעגל-אנכי על-מישור x-z (נורמלה y) — פני-השעון */
function dialRing(center: K.Point3, r: number, P: K.Projection, steps = 48): string {
  const pts: K.Point3[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push([center[0] + r * Math.cos(a), center[1], center[2] + r * Math.sin(a)]);
  }
  return K.pathOf(pts.map((p) => K.iso(p, P)), true);
}
function dialPt(center: K.Point3, r: number, a: number): K.Point3 {
  return [center[0] + r * Math.cos(a), center[1], center[2] + r * Math.sin(a)];
}
/* זווית-המחוג: t∈[0,1] ← 210°…-30° דרך-הפסגה */
const t2a = (t: number) => ((210 - 240 * t) * Math.PI) / 180;

type ViewId = "dex" | "channel" | "wallet" | "pulse";

export function MachineView({ onNavigate }: { onNavigate: (v: "dex" | "channel" | "wallet" | "desk" | "ledger" | "products" | "pulse" | "office") => void }) {
  const [data, setData] = useState<MachineData | null>(null);
  const { anchor, say } = useReadout<HTMLDivElement>();

  useEffect(() => {
    let dead = false;
    const load = async () => {
      const [dex, ch, pulse] = await Promise.all([
        getJson<DexPayload>("/api/giant/dex"),
        getJson<ChannelPayload>("/api/giant/channel"),
        getJson<PulsePayload>("/api/giant/pulse"),
      ]);
      if (!dead) setData(derive(dex, ch, pulse));
    };
    load();
    const iv = setInterval(load, 60_000);
    return () => { dead = true; clearInterval(iv); };
  }, []);

  /* יעדי-המחוגים (0…1) — מהמדידה-האמיתית */
  const priceT = data?.price != null && data.priceLow != null && data.priceHigh != null && data.priceHigh > data.priceLow
    ? Math.min(1, Math.max(0, (data.price - data.priceLow) / (data.priceHigh - data.priceLow)))
    : 0;
  const pulseT = data?.reqOpen != null && data.reqTotal ? Math.min(1, data.reqOpen / data.reqTotal) : 0;
  const carT = data?.height != null ? (data.height % 10_000) / 10_000 : 0;

  const ePrice = useEased(priceT, 0.9);
  const ePulse = useEased(pulseT, 0.9);
  const eCar = useEased(carT, 0.9);

  /* המצלמה והחלקים-המוצקים נבנים-פעם-אחת */
  const G = useMemo(() => {
    const P = K.fitProjection(
      K.boxCorners({ x: BASE.x - 4, y: BASE.y - 4, w: BASE.w + 8, d: BASE.d + 8 }, -6, 104),
      VIEW_W, VIEW_H, { pad: 30 },
    );
    /* בסיס */
    const base = K.slabOf(BASE, 0, TOP, P, 10, 0.8);
    const feet = K.corners(BASE, 10).map((c) => K.cylinder(c[0], c[1], 5, -6, 6, P, 16));
    const screws = K.dotGrid(BASE.x + 16, BASE.y + 16, 9, 8, 42, TOP, P);
    const ruler = K.topTicks(BASE.x + 30, BASE.x + BASE.w - 30, 10, 50, BASE.y + BASE.d - 12, TOP, [4, 8], P, "x");
    /* מסילת-הגובה (שמאל-אחורי) */
    const railP1: K.Plane = [-158, -126]; const railP2: K.Plane = [-122, -126];
    const post1 = K.cylinder(railP1[0], railP1[1], 2.5, TOP, 92, P, 12);
    const post2 = K.cylinder(railP2[0], railP2[1], 2.5, TOP, 92, P, 12);
    const rungs = Array.from({ length: 9 }, (_, i) => {
      const z = TOP + 12 + i * 8.8;
      const long = i % 2 === 0;
      const y = -126 + (long ? 0 : 3);
      return K.segment([railP1[0] + (long ? -1 : 2), y, z], [railP2[0] - (long ? -1 : 2), y, z], P);
    });
    /* עמדת-הערוץ (ימין-אחורי) */
    const chC: K.Plane = [0, -105];
    const post = K.cylinder(chC[0], chC[1], 9, TOP, 76, P, 24);
    const cap = K.cylinder(chC[0], chC[1], 11, TOP + 76, 4, P, 24);
    const slot = K.sideArc(chC[0], chC[1], 9, TOP + 60, P, 24);
    const lampPole = K.cylinder(chC[0], chC[1], 2, TOP + 80, 7, P, 8);
    const lamp = K.cylinder(chC[0], chC[1], 4.5, TOP + 87, 7, P, 14);
    /* הכספת (ימין) */
    const V: K.Plan = { x: 42, y: -122, w: 104, d: 88, r: 8 };
    const vault = K.slabOf(V, TOP, 68, P, 8, 0.8);
    const lid = K.sideSeam(V, TOP + 60, P, 8);
    const wheelC: K.Plane = [V.x + 52, V.y + 44];
    const wheel = K.cylinder(wheelC[0], wheelC[1], 10, TOP + 68, 8, P, 28);
    const wheelKnurl = K.knurl(wheelC[0], wheelC[1], 10, TOP + 68, TOP + 76, 12, P);
    /* הדסק (שמאל) */
    const D: K.Plan = { x: -142, y: -114, w: 90, d: 72, r: 6 };
    const desk = K.slabOf(D, TOP, 44, P, 8, 0.8);
    const keyb = K.slabOf({ x: D.x + 10, y: D.y + 34, w: 44, d: 26, r: 3 }, TOP + 44, 5, P, 4);
    const keys = K.dotGrid(D.x + 15, D.y + 39, 8, 4, 5.4, TOP + 49, P);
    const tape = K.topTicks(D.x + 8, D.x + 82, 6, 24, D.y + 22, TOP + 0.3, [3, 6], P, "x");
    /* שער-הדקס (שעון-אנכי קדמי-שמאל) */
    const pxC: K.Point3 = [-100, 22, TOP + 44];
    const pxBase = K.cylinder(-100, 22, 13, TOP, 6, P, 24);
    const pxPost1 = K.cylinder(-110, 22, 2, TOP + 6, 30, P, 10);
    const pxPost2 = K.cylinder(-90, 22, 2, TOP + 6, 30, P, 10);
    const pxFace = dialRing(pxC, 20, P);
    const pxTicks = Array.from({ length: 11 }, (_, i) => {
      const a = t2a(i / 10);
      return K.segment(dialPt(pxC, i % 5 === 0 ? 17.5 : 19, a), dialPt(pxC, 14.5, a), P);
    });
    /* דופק (שעון-אנכי קדמי-מרכז) */
    const plC: K.Point3 = [-8, 36, TOP + 44];
    const plBase = K.cylinder(-8, 36, 13, TOP, 6, P, 24);
    const plPost1 = K.cylinder(-18, 36, 2, TOP + 6, 30, P, 10);
    const plPost2 = K.cylinder(2, 36, 2, TOP + 6, 30, P, 10);
    const plFace = dialRing(plC, 20, P);
    const plTicks = Array.from({ length: 11 }, (_, i) => {
      const a = t2a(i / 10);
      return K.segment(dialPt(plC, i % 5 === 0 ? 17.5 : 19, a), dialPt(plC, 14.5, a), P);
    });
    /* מנורות-הגריד (קדמי-ימני) */
    const lampA = K.cylinder(62, 42, 6, TOP, 4, P, 18);
    const lampB = K.cylinder(88, 42, 6, TOP, 4, P, 18);
    const bulbA = K.cylinder(62, 42, 4, TOP + 4, 9, P, 14);
    const bulbB = K.cylinder(88, 42, 4, TOP + 4, 9, P, 14);
    return { P, base, feet, screws, ruler, post1, post2, rungs, railP1, railP2, post, cap, slot, lampPole, lamp, chC, vault, lid, wheel, wheelKnurl, wheelC, V, desk, keyb, keys, tape, D, pxC, pxBase, pxPost1, pxPost2, pxFace, pxTicks, plC, plBase, plPost1, plPost2, plFace, plTicks, lampA, lampB, bulbA, bulbB };
  }, []);

  const go = useCallback((v: ViewId) => onNavigate(v), [onNavigate]);

  const DEFAULT_READOUT = "רחף-מעל-חלק · כל-מספר נמדד-חי · לחיצה = פתיחת-מודול";
  const R = {
    wallet: `ארנק · ${fmt(data?.walletSaos)} SAOS · ${fmt(data?.accounts)} חשבונות · נמדד`,
    dex: `דקס · שער ${fmt(data?.price, 3)} USDS/SAOS · ווליום-24ש $${fmt(data?.vol24)} · ${fmt(data?.trades24)} עסקאות · נמדד`,
    channel: `ערוץ · ${fmt(data?.directives)} הוראות-בעלים בזרם-הקנון · נמדד`,
    pulse: `שער-האמת · ${data?.truthVerdict ?? "—"} · פניות-פתוחות ${fmt(data?.reqOpen)}/${fmt(data?.reqTotal)} · נמדד`,
    grid: `גריד-על-השרשרת · ${data?.gridArmed ? "ARMED" : "—"} · real:${data?.gridReal ? "true" : "—"} · מילויים ${fmt(data?.gridFilled)} · זרימה $${fmt(data?.gridFlow, 3)} · נמדד`,
    height: `גובה-השרשרת · ${fmt(data?.height)} · נמדד`,
  } as const;

  const part = (label: string, readout: string, v: ViewId, children: React.ReactNode) => (
    <g
      className="iso-part"
      role="button"
      tabIndex={0}
      aria-label={`${label} — פתיחת-המודול`}
      onPointerEnter={() => say(readout)}
      onPointerLeave={() => say(DEFAULT_READOUT)}
      onFocus={() => say(readout)}
      onBlur={() => say(DEFAULT_READOUT)}
      onClick={() => go(v)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(v); } }}
    >
      {children}
    </g>
  );

  /* המחוגים — נבנים-מחדש-בכל-פריים-מונפש (זול: שתי-נקודות) */
  const pxNeedle = K.pathOf([K.iso(G.pxC, G.P), K.iso(dialPt(G.pxC, 16, t2a(ePrice)), G.P)]);
  const plNeedle = K.pathOf([K.iso(G.plC, G.P), K.iso(dialPt(G.plC, 16, t2a(ePulse)), G.P)]);
  const hub = (c: K.Point3) => { const p = K.iso(c, G.P); return <circle cx={p[0]} cy={p[1]} r={2} className="iso-face-text" fill="currentColor" />; };
  const carZ = TOP + 12 + eCar * 70;
  const carriage = K.slabOf({ x: G.railP1[0] - 4, y: G.railP1[1] - 5, w: G.railP2[0] - G.railP1[0] + 8, d: 10, r: 2 }, carZ, 7, G.P, 4);
  const envelopes = Math.min(data?.directives ?? 0, 4);
  const gridOn = data?.gridArmed === true && data?.gridReal === true;

  return (
    <section className="flex flex-col gap-4" dir="rtl" aria-label="מכונת-הריבונות">
      <div className="iso" dir="ltr">
        <Plate
          fig="FIG 01 · MEASURED-LIVE"
          title="מכונת-הריבונות"
          hint="רחף · לחץ · כל-חלק הוא-דלת-למודול"
          readout={DEFAULT_READOUT}
          keys={[
            { mark: "raised" as K.KeyMark, label: "חלק-מוצק = מודול-אמיתי" },
            { mark: "green" as K.KeyMark, label: "ירוק = חי-ונמדד" },
            { mark: "red" as K.KeyMark, label: "אדום = כשל-מדידה" },
            { mark: "dashed" as K.KeyMark, label: "זרימה = פעולה-חיה" },
          ]}
          caption={`כל-המספרים מהמקורות-הקנוניים (saos-dex/db · directives.jsonl · GitHub) · חלון-המסילה: 10,000 בלוקים אחרונים · נמדד ${data ? new Date(data.at).toLocaleTimeString("he-IL") : "—"}`}
        >
          <div ref={anchor}>
            <IsoFigure width={VIEW_W} height={VIEW_H} label="מכונת-הריבונות: הבסיס הוא שכבת-הגיט; עליו הכספת, מסוף-הדקס עם שער-המחוג, עמדת-הערוץ עם מעטפות, מסילת-הגובה, שעון-הדופק ומנורות-הגריד">
            {/* ═══ הבסיס: שכבת-הקיום ═══ */}
            <g>
              {G.feet.map((f, i) => <Solid key={i} paths={f} tone="lo" crease="none" />)}
              <Solid paths={G.base} tone="hi" halo />
              <Line d={K.planOutline(K.insetPlan(BASE, 7), TOP, G.P, 10)} tone="faint" />
              <Line d={G.ruler.minor} tone="faint" /> <Line d={G.ruler.major} tone="mid" />
              <Dots points={G.screws} size={0.7} tone="faint" />
              <FaceText transform={K.topMatrix([30, -128], TOP, G.P, "x")} size={7} tone="faint">שכבת-הקיום · GIT</FaceText>
            </g>

            {/* ═══ מסילת-הגובה ═══ */}
            {part("מסילת-הגובה", R.height, "dex", (
              <g>
                <Solid paths={G.post1} tone="mid" crease="none" />
                <Solid paths={G.post2} tone="mid" crease="none" />
                <Line d={K.segment([G.railP1[0], G.railP1[1], TOP + 92], [G.railP2[0], G.railP2[1], TOP + 92], G.P)} tone="mid" />
                {G.rungs.map((d, i) => <Line key={i} d={d} tone={i % 2 === 0 ? "lo" : "faint"} />)}
                <Solid paths={carriage} tone="hi" />
                <FaceText transform={K.topMatrix([G.railP1[0] - 34, G.railP1[1] - 2], TOP, G.P, "x")} size={7} tone="mid">{fmt(data?.height)}</FaceText>
                <FaceText transform={K.topMatrix([G.railP1[0] - 34, G.railP1[1] + 8], TOP, G.P, "x")} size={5.5} tone="faint">גובה</FaceText>
              </g>
            ))}

            {/* ═══ עמדת-הערוץ ═══ */}
            {part("הערוץ", R.channel, "channel", (
              <g>
                <Solid paths={G.post} tone="mid" />
                <Line d={G.slot} tone="faint" />
                {Array.from({ length: envelopes }, (_, i) => (
                  <Solid key={i} paths={K.slabOf({ x: -42, y: -86, w: 30, d: 18, r: 2 }, TOP + i * 3.2, 2.6, G.P, 3)} tone="hi" />
                ))}
                <Solid paths={G.cap} tone="hi" />
                <Solid paths={G.lampPole} tone="lo" crease="none" />
                <Solid paths={G.lamp} tone="hi" crease="none" lit={data?.directives != null && data.directives > 0} />
                <Line d={K.ring(G.chC[0], G.chC[1], 3, TOP + 94.6, G.P, 14)} tone={data?.directives ? "green" : data == null ? "red" : "faint"} />
                <FaceText transform={K.topMatrix([-22, -92], TOP, G.P, "x")} size={6.5} tone="mid">ערוץ</FaceText>
                <FaceText transform={K.topMatrix([-22, -85], TOP, G.P, "x")} size={5.5} tone="faint">{fmt(data?.directives)} הוראות</FaceText>
              </g>
            ))}

            {/* ═══ הכספת ═══ */}
            {part("הארנק", R.wallet, "wallet", (
              <g>
                <Solid paths={G.vault} tone="hi" halo />
                <Line d={G.lid} tone="faint" />
                <Solid paths={G.wheel} tone="hi" />
                <Line d={G.wheelKnurl} tone="faint" />
                <Line d={K.ring(G.wheelC[0], G.wheelC[1], 6.5, TOP + 76.2, G.P, 20)} tone="mid" />
                <FaceText transform={K.topMatrix([G.V.x + 10, G.V.y + 16], TOP + 68.2, G.P, "x")} size={8} tone="hi">{fmt(data?.walletSaos)} SAOS</FaceText>
                <FaceText transform={K.topMatrix([G.V.x + 10, G.V.y + 7], TOP + 68.2, G.P, "x")} size={5.5} tone="mid">{fmt(data?.accounts)} חשבונות · ארנק</FaceText>
                <FaceText transform={K.topMatrix([G.V.x + 10, G.V.y - 2], TOP + 68.2, G.P, "x")} size={5.5} tone="faint">רווחי-אוצר מאז-החיים ${fmt(data?.treasuryEver)}</FaceText>
              </g>
            ))}

            {/* ═══ מסוף-הדקס ═══ */}
            {part("הדקס", R.dex, "dex", (
              <g>
                <Solid paths={G.desk} tone="hi" halo />
                <Line d={G.tape.minor} tone="faint" /> <Line d={G.tape.major} tone="faint" />
                <Line d={K.lineOnTop([G.D.x + 8, G.D.y + 22], [G.D.x + 82, G.D.y + 22], TOP + 0.3, G.P)} tone="mid" flow />
                <Solid paths={G.keyb} tone="mid" />
                <Dots points={G.keys} size={0.6} tone="mid" />
                <FaceText transform={K.topMatrix([G.D.x + 8, G.D.y + 12], TOP + 44.2, G.P, "x")} size={7} tone="hi">{fmt(data?.price, 3)} USDS/SAOS</FaceText>
                <FaceText transform={K.topMatrix([G.D.x + 8, G.D.y + 3], TOP + 44.2, G.P, "x")} size={5.5} tone="mid">דקס · $${fmt(data?.vol24)} · {fmt(data?.trades24)} עסקאות</FaceText>
              </g>
            ))}

            {/* ═══ שער-הדקס (המחוג) ═══ */}
            {part("שער-הדקס", R.dex, "dex", (
              <g>
                <Solid paths={G.pxBase} tone="mid" crease="none" />
                <Solid paths={G.pxPost1} tone="lo" crease="none" />
                <Solid paths={G.pxPost2} tone="lo" crease="none" />
                <path d={G.pxFace} fill="var(--anatomy-face)" stroke="none" />
                <Line d={G.pxFace} tone="hi" />
                {G.pxTicks.map((d, i) => <Line key={i} d={d} tone={i % 5 === 0 ? "mid" : "faint"} />)}
                <Line d={pxNeedle} tone="red" />
                {hub(G.pxC)}
                <FaceText transform={K.topMatrix([-116, 8], TOP, G.P, "x")} size={6.5} tone="mid">שער-הדקס</FaceText>
                <FaceText transform={K.topMatrix([-116, 1], TOP, G.P, "x")} size={5.5} tone="faint">חלון 48-נרות</FaceText>
              </g>
            ))}

            {/* ═══ דופק ═══ */}
            {part("שער-האמת", R.pulse, "pulse", (
              <g>
                <Solid paths={G.plBase} tone="mid" crease="none" />
                <Solid paths={G.plPost1} tone="lo" crease="none" />
                <Solid paths={G.plPost2} tone="lo" crease="none" />
                <path d={G.plFace} fill="var(--anatomy-face)" stroke="none" />
                <Line d={G.plFace} tone="hi" />
                {G.plTicks.map((d, i) => <Line key={i} d={d} tone={i % 5 === 0 ? "mid" : "faint"} />)}
                <Line d={plNeedle} tone="red" />
                {hub(G.plC)}
                <FaceText transform={K.topMatrix([-26, 52], TOP, G.P, "x")} size={6.5} tone="mid">שער-אמת</FaceText>
                <FaceText transform={K.topMatrix([-26, 45], TOP, G.P, "x")} size={5.5} tone="faint">פתוחות {fmt(data?.reqOpen)}/{fmt(data?.reqTotal)}</FaceText>
              </g>
            ))}

            {/* ═══ מנורות-הגריד ═══ */}
            {part("המסחר-האמיתי", R.grid, "dex", (
              <g>
                <Solid paths={G.lampA} tone="lo" crease="none" />
                <Solid paths={G.lampB} tone="lo" crease="none" />
                <Solid paths={G.bulbA} tone="hi" crease="none" lit={gridOn} />
                <Solid paths={G.bulbB} tone="hi" crease="none" lit={data?.truthVerdict?.includes("GREEN") === true} />
                <Line d={K.ring(62, 42, 3, TOP + 13.2, G.P, 14)} tone={gridOn ? "green" : data == null ? "red" : "faint"} />
                <Line d={K.ring(88, 42, 3, TOP + 13.2, G.P, 14)} tone={data?.truthVerdict?.includes("GREEN") ? "green" : data?.truthVerdict?.includes("FAIL") ? "red" : "faint"} />
                <FaceText transform={K.topMatrix([52, 56], TOP, G.P, "x")} size={6} tone="mid">גריד-חי</FaceText>
                <FaceText transform={K.topMatrix([52, 63], TOP, G.P, "x")} size={5.5} tone="faint">ARMED · real</FaceText>
              </g>
            ))}

            {/* ═══ חוטים — הפעולה-החיה ═══ */}
            <Wire from={K.iso([G.D.x + 45, G.D.y + 36, TOP + 44], G.P)} to={K.iso([0, -105, TOP + 90], G.P)} via={[K.iso([-30, -60, TOP + 60], G.P)]} tone="lo" flow />
            <Wire from={K.iso([-100, 22, TOP + 8], G.P)} to={K.iso([-8, 36, TOP + 8], G.P)} tone="faint" dotted />
            <Wire from={K.iso([75, 42, TOP + 8], G.P)} to={K.iso([42, -30, TOP + 4], G.P)} tone="faint" dotted />
          </IsoFigure>
          </div>
        </Plate>
      </div>

      {/* ═══ פס-האמת + הדלתות ═══ */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="navigation" aria-label="דלתות-המכונה">
        {([
          ["wallet", "הארנק", `${fmt(data?.walletSaos)} SAOS`],
          ["dex", "הדקס", `${fmt(data?.price, 3)} USDS`],
          ["channel", "הערוץ", `${fmt(data?.directives)} הוראות`],
          ["pulse", "שער-האמת", data?.truthVerdict ?? "—"],
          ["desk", "השולחן", "מנדט · equity"],
          ["ledger", "הרישום", "כל-ההחלטות"],
        ] as const).map(([v, label, val]) => (
          <button
            key={v}
            onClick={() => onNavigate(v)}
            className="min-h-[44px] rounded-xl border border-white/10 bg-zinc-900/50 px-3 py-2 text-right transition hover:border-amber-600/40 hover:bg-amber-500/[0.06]"
          >
            <span className="block text-xs font-bold text-zinc-200">{label}</span>
            <span className="mt-0.5 block font-mono text-[10px] text-zinc-500">{val}</span>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-white/5 bg-zinc-900/40 p-4 text-[11px] leading-5 text-zinc-500" aria-live="polite">
        <b className="text-zinc-300">פס-האמת:</b> אפס-סימולציות. ווליום/מחיר/גובה — נמדדים-חי מ-saos-dex/db · הוראות-הבעלים — מ-מסילת-ה-directives-הקנונית · הספרים — מ-GitHub-חי · הגריד הוא-המסחר-האמיתי-על-השרשרת (real:true) · {data?.notes.length ? <span className="text-red-400">{data.notes.join(" · ")}</span> : <span className="text-emerald-400">כל-המדידות-תקינות</span>}
      </div>
    </section>
  );
}
