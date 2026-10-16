"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AZIMUTH_SPAN,
  COIN_SEGS,
  DRAWER_SLOTS,
  HEIGHT,
  LIQUID_Z0,
  LIQUID_Z1,
  REST_AZIMUTH,
  WIDTH,
  buildMachine,
  computeBuild,
  liquidPaths,
  needlePath,
  projectionAt,
  type MachineData,
} from "@/lib/iso/machine";
import { iso } from "@/components/iso/iso-kit";
import { follow, spring, useInView, useLoop, useStillness, type Spring } from "@/components/iso/live";
import "@/components/iso/machine.css";

/* ═══ מכונת-האמת של SAOS — anatomy-grade isometric figure ═════════════════
 * "האובייקט הוא ההסבר": מכונה אמיתית מ-45+ חלקים מוצקים שמסבירה איך הדקס עובד.
 * כל מספר ב-readout מגיע מ-/api/giant/dex בלבד — כשל = "לא נמדד", אפס סינתזה.
 * תנועה: follow/spring רגועים; attrs נכתבים על refs (אין re-render לפריים);
 * reduced-motion = הצמדה ישירה; עצירה מחוץ-למסך ובטאב-נסתר. */

interface DexPayload {
  ok?: boolean;
  savedAt?: string | null;
  height?: number | null;
  feeMeter?: number | null;
  ordersOpen?: number | null;
  treasuryProfit?: number | null;
  metrics?: Array<{ day?: string; fills?: number; swaps?: number }> | null;
  pairs?: Array<{ name?: string; candles?: Array<{ vMu?: number }> | null }> | null;
  grid?: { verdict?: string | null; armed?: boolean | null } | null;
  supply?: {
    totalSaosHuman?: number | null;
    capSaosHuman?: number | null;
    genesisMintSaosHuman?: number | null;
    pctOfCap?: number | null;
  } | null;
  truthMeta?: { sha16?: string | null; ageMinutes?: number | null } | null;
}

interface MachineLive {
  data: MachineData;
  savedAt: string | null;
  sha16: string | null;
  ageMinutes: number | null;
  verdict: string | null;
  fills: number | null;
  swaps: number | null;
  totalHuman: number | null;
  capHuman: number | null;
  genesisHuman: number | null;
  pctOfCap: number | null;
  treasuryMu: number | null;
  feeMeterMu: number | null;
}

const EMPTY: MachineLive = {
  data: { ok: false, height: null, feeMeter: null, fills: null, swaps: null, treasuryMu: null, ordersOpen: null, supply: null, drawers: [], halted: null, savedAt: null, sha16: null },
  savedAt: null, sha16: null, ageMinutes: null, verdict: null, fills: null, swaps: null,
  totalHuman: null, capHuman: null, genesisHuman: null, pctOfCap: null, treasuryMu: null, feeMeterMu: null,
};

function mapDex(d: DexPayload): MachineLive {
  const metrics = Array.isArray(d.metrics) ? d.metrics : [];
  const today = metrics.find((m) => typeof m?.day === "string" && m.day === "") ?? metrics[0] ?? null;
  const pairs = Array.isArray(d.pairs) ? d.pairs : [];
  const drawers = pairs
    .map((p) => ({
      pair: String(p?.name ?? "?"),
      volumeMu: Array.isArray(p?.candles)
        ? (p.candles ?? []).slice(-30).reduce((s, c) => s + (c?.vMu ?? 0), 0)
        : 0,
    }))
    .sort((a, b) => b.volumeMu - a.volumeMu)
    .slice(0, DRAWER_SLOTS);
  const verdict = typeof d.grid?.verdict === "string" ? d.grid.verdict : null;
  const supply = d.supply ?? null;
  return {
    data: {
      ok: d.ok !== false,
      height: typeof d.height === "number" ? d.height : null,
      feeMeter: typeof d.feeMeter === "number" ? d.feeMeter : null,
      fills: typeof today?.fills === "number" ? today.fills : null,
      swaps: typeof today?.swaps === "number" ? today.swaps : null,
      treasuryMu: typeof d.treasuryProfit === "number" ? d.treasuryProfit : null,
      ordersOpen: typeof d.ordersOpen === "number" ? d.ordersOpen : null,
      supply: {
        genesisHuman: typeof supply?.genesisMintSaosHuman === "number" ? supply.genesisMintSaosHuman : null,
        totalHuman: typeof supply?.totalSaosHuman === "number" ? supply.totalSaosHuman : null,
        capHuman: typeof supply?.capSaosHuman === "number" ? supply.capSaosHuman : null,
        pctOfCap: typeof supply?.pctOfCap === "number" ? supply.pctOfCap : null,
      },
      drawers,
      halted: verdict ? verdict !== "ARMED-LIVE" : null,
      savedAt: d.savedAt ?? null,
      sha16: d.truthMeta?.sha16 ?? null,
    },
    savedAt: d.savedAt ?? null,
    sha16: d.truthMeta?.sha16 ?? null,
    ageMinutes: typeof d.truthMeta?.ageMinutes === "number" ? d.truthMeta.ageMinutes : null,
    verdict,
    fills: typeof today?.fills === "number" ? today.fills : null,
    swaps: typeof today?.swaps === "number" ? today.swaps : null,
    totalHuman: typeof supply?.totalSaosHuman === "number" ? supply.totalSaosHuman : null,
    capHuman: typeof supply?.capSaosHuman === "number" ? supply.capSaosHuman : null,
    genesisHuman: typeof supply?.genesisMintSaosHuman === "number" ? supply.genesisMintSaosHuman : null,
    pctOfCap: typeof supply?.pctOfCap === "number" ? supply.pctOfCap : null,
    treasuryMu: typeof d.treasuryProfit === "number" ? d.treasuryProfit : null,
    feeMeterMu: typeof d.feeMeter === "number" ? d.feeMeter : null,
  };
}

/* ── formatting (human units) ── */
const fmtInt = (n: number | null) => (typeof n === "number" ? Math.round(n).toLocaleString("en-US") : "—");
const fmtMu3 = (n: number | null) => (typeof n === "number" ? (n / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 }) : "—");
const fmtHuman = (n: number | null) => (typeof n === "number" ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—");
const fmtPct = (n: number | null) => (typeof n === "number" ? n.toFixed(3) + "%" : "—");

/* assembly hover chips: anchor world point + Hebrew label */
const ASSEMBLIES: Array<{ key: string; label: string; anchor: [number, number, number] }> = [
  { key: "tanks", label: "קופות-האמת: מינט-פתיחה · ספר-המנוע · התקרה כולה", anchor: [-53, -26, 40] },
  { key: "flag", label: "דגל-עצירה — מונף רק כשהמנוע עצור", anchor: [136, -58, 40] },
  { key: "gauge", label: "מד-העמלות (מנוע-הכיול)", anchor: [64, 14, 34] },
  { key: "chute", label: "תעלת-הביצועים: מילוי → קופסה", anchor: [-74, 56, 14] },
  { key: "odo", label: "מונה-הגובה (גובה-השרשרת)", anchor: [4, 47, 15] },
  { key: "chest", label: "ספר-הזמנות: מגירות לפי ווליום-חלון", anchor: [117, -2, 15] },
];

/* coin segment timeline: COIN_WAY 6 screen pts, COIN_SEGS 5 durations (Σ=0.94) */
function coinPos(pts: Array<[number, number]>, t: number): [number, number] {
  const total = COIN_SEGS.reduce((s, x) => s + x, 0);
  const s = Math.max(0, Math.min(1, t)) * total;
  let acc = 0;
  for (let i = 0; i < COIN_SEGS.length; i++) {
    const seg = COIN_SEGS[i]!;
    if (s <= acc + seg || i === COIN_SEGS.length - 1) {
      const a = pts[i] ?? [0, 0];
      const b = pts[i + 1] ?? a;
      const local = seg > 0 ? (s - acc) / seg : 1;
      return [a[0] + (b[0] - a[0]) * local, a[1] + (b[1] - a[1]) * local];
    }
    acc += seg;
  }
  return pts[pts.length - 1] ?? [0, 0];
}

export function MachineView() {
  const [live, setLive] = useState<MachineLive>(EMPTY);
  const [err, setErr] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [buildQ, setBuildQ] = useState(REST_AZIMUTH);

  /* refs written per-frame (anatomy law: no re-render per frame) */
  const stageRef = useRef<HTMLDivElement>(null);
  const needleRef = useRef<SVGPathElement>(null);
  const liqRefs = useRef<Array<Array<SVGPathElement | null>>>([[], []]); // [fill, top, edge, band0..3]
  const coinRef = useRef<SVGGElement>(null);
  const drawerRefs = useRef<Array<SVGGElement | null>>([]);

  const azRef = useRef(REST_AZIMUTH);
  const targetAzRef = useRef(REST_AZIMUTH);
  const needleSt = useRef<Spring>({ at: 0, rate: 0 });
  const levelSt = useRef<[number, number]>([0, 0]);
  const drawerSt = useRef<number[]>(Array.from({ length: DRAWER_SLOTS }, () => 0));
  const coinSt = useRef({ active: false, t: 0 });
  const lastInteract = useRef(0);
  const dragging = useRef(false);
  const fillsPrev = useRef<number | null>(null);
  const coinReq = useRef(false);
  const lastDrop = useRef(0);

  /* stable commit-phase writer for the liquid rigs (no ref access during render) */
  const setLiq = useCallback((i: number, slot: number) => (el: SVGPathElement | null) => {
    const arr = liqRefs.current[i] ?? (liqRefs.current[i] = []);
    arr[slot] = el;
  }, []);

  const still = useStillness();
  const inView = useInView(stageRef);

  /* ── data: /api/giant/dex every 60s, fail-honest ── */
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/giant/dex", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as DexPayload;
        const m = mapDex(d);
        if (!alive) return;
        setLive(m);
        setErr(null);
        /* coin drop when the real fills counter ticks up (cooldown 4s) */
        if (fillsPrev.current !== null && m.fills !== null && m.fills > fillsPrev.current) coinReq.current = true;
        fillsPrev.current = m.fills;
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message.slice(0, 120) : "שגיאה");
      }
    };
    load();
    const iv = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  const targets = useMemo(() => buildMachine(live.data), [live.data]);
  const build = useMemo(() => computeBuild(buildQ), [buildQ]);
  const P = useMemo(() => projectionAt(buildQ), [buildQ]);

  /* assembly chip anchors in screen space (static per azimuth) */
  const chipAnchors = useMemo(
    () => Object.fromEntries(ASSEMBLIES.map((a): [string, [number, number]] => [a.key, iso(a.anchor, P)])),
    [P],
  );

  /* ── the motion loop ── */
  useLoop(
    (dt, calm) => {
      const now = performance.now();
      /* idle tour: gentle oscillation when untouched for 10s */
      if (!dragging.current && now - lastInteract.current > 10_000) {
        targetAzRef.current = REST_AZIMUTH + Math.sin((now / 1000) * (Math.PI * 2) / 24) * AZIMUTH_SPAN * 0.55;
      }
      azRef.current = follow(azRef.current, targetAzRef.current, dt, 0.28, calm);
      const q = Math.round(azRef.current * 2) / 2;
      if (q !== buildQ) setBuildQ(q);

      const needleTarget = targets.needle ?? 0;
      spring(needleSt.current, needleTarget, dt, 170, 22, calm);
      if (needleRef.current) {
        needleRef.current.setAttribute("d", needlePath(P, needleSt.current.at));
      }

      for (let i = 0; i < 2; i++) {
        levelSt.current[i] = follow(levelSt.current[i]!, targets.levels[i] ?? 0, dt, 0.45, calm);
        const rig = build.anchors.liquids[i];
        const paths = liqRefs.current[i] ?? [];
        if (rig && paths.length === 7) {
          const z = LIQUID_Z0 + levelSt.current[i]! * (LIQUID_Z1 - LIQUID_Z0);
          const lp = liquidPaths(rig, z);
          paths[0]?.setAttribute("d", lp.fill);
          paths[1]?.setAttribute("d", lp.top);
          paths[2]?.setAttribute("d", lp.edge);
          for (let b = 0; b < 4; b++) paths[3 + b]?.setAttribute("d", lp.bands[b] ?? "");
        }
      }

      for (let i = 0; i < DRAWER_SLOTS; i++) {
        drawerSt.current[i] = follow(drawerSt.current[i]!, targets.drawers[i] ?? 0, dt, 0.5, calm);
        const g = drawerRefs.current[i];
        if (g) {
          const ext = drawerSt.current[i]!;
          g.setAttribute("transform", `translate(${(build.anchors.drawerVec[0] * ext).toFixed(2)} ${(build.anchors.drawerVec[1] * ext).toFixed(2)})`);
        }
      }

      if (coinReq.current && !coinSt.current.active && now - lastDrop.current > 4_000) {
        coinSt.current = { active: true, t: 0 };
        coinReq.current = false;
        lastDrop.current = now;
      }
      let coinMoving = false;
      if (coinSt.current.active) {
        coinSt.current.t += dt / 1.7;
        if (coinSt.current.t >= 1) {
          coinSt.current = { active: false, t: 0 };
          coinMoving = true; /* one more frame to snap to rest */
        } else coinMoving = true;
      }
      if (coinRef.current) {
        const pts = build.anchors.coin.screen as Array<[number, number]>;
        const rest = build.anchors.coin.rest;
        const [x, y] = coinSt.current.active ? coinPos(pts, coinSt.current.t) : [rest[0], rest[1]];
        coinRef.current.setAttribute("transform", `translate(${(x - rest[0]).toFixed(2)} ${(y - rest[1]).toFixed(2)})`);
      }

      const settled =
        Math.abs(azRef.current - targetAzRef.current) < 0.02 &&
        Math.abs(needleSt.current.at - needleTarget) < 5e-4 &&
        Math.abs(levelSt.current[0]! - (targets.levels[0] ?? 0)) < 1e-3 &&
        Math.abs(levelSt.current[1]! - (targets.levels[1] ?? 0)) < 1e-3 &&
        targets.drawers.every((d, i) => Math.abs(drawerSt.current[i]! - d) < 1e-3) &&
        !coinMoving;
      return !settled || !calm;
    },
    inView && !hidden,
  );

  /* pointer drag: azimuth clamp ±AZIMUTH_SPAN around rest */
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    lastInteract.current = performance.now();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.dataset.drag = "";
  }, []);
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      lastInteract.current = performance.now();
      const prev = azRef.current;
      const dx = e.movementX || 0;
      targetAzRef.current = Math.max(REST_AZIMUTH - AZIMUTH_SPAN, Math.min(REST_AZIMUTH + AZIMUTH_SPAN, targetAzRef.current + dx * 0.18));
      void prev;
    },
    [],
  );
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    lastInteract.current = performance.now();
    delete e.currentTarget.dataset.drag;
  }, []);

  /* hover chip */
  const [chip, setChip] = useState<{ x: number; y: number; text: string } | null>(null);
  const onAssembly = useCallback((key: string) => (e: React.MouseEvent) => {
    const a = ASSEMBLIES.find((x) => x.key === key);
    if (!a) return;
    const rect = stageRef.current?.getBoundingClientRect();
    setChip({ x: chipAnchors[key]?.[0] ?? e.clientX, y: chipAnchors[key]?.[1] ?? e.clientY, text: a.label });
    void rect;
  }, [chipAnchors]);
  const onAssemblyLeave = useCallback(() => setChip(null), []);

  const digits = targets.digits;
  const na = (v: unknown) => v === null || v === undefined;
  const haltedChip = targets.halted === true;

  return (
    <section className="w-full" aria-label="מכונת-האמת של SAOS">
      <div className="mx-auto max-w-4xl">
        <figure className="sm-figure">
          <div className="sm-plate">
            <div className="sm-plate-corners" dir="ltr">
              <span className="sm-corner" data-corner="fig">Fig 1</span>
              <span className="sm-corner" data-corner="title">מכונת-האמת של SAOS</span>
              <span className="sm-corner" data-corner="hint">גרור לסיבוב · השהה על חלק לבחינה</span>
              <span className="sm-corner" data-corner="readout">
                <div className="sm-readout" dir="rtl">
                  {err ? (
                    <span className="sm-chip-na"><i />המדידה נכשלה: {err} — המכונה קפאה, כלום לא הומצא</span>
                  ) : (
                    <>
                      <div className="sm-readout-row"><span className="u">גובה</span><b>{fmtInt(live.data.height)}</b><span className="u">· מילויים-היום</span><b>{fmtInt(live.fills)}</b></div>
                      <div className="sm-readout-row"><span className="u">ספר</span><b>{fmtHuman(live.totalHuman)}</b><span className="u">SAOS</span><span className="u">מהתקרה</span><b>{fmtPct(live.pctOfCap)}</b></div>
                      <div className="sm-readout-row"><span className="u">עמלה</span><b>{fmtMu3(live.feeMeterMu)}</b><span className="u">/ 10 USDS · אוצר</span><b>{fmtMu3(live.treasuryMu)}</b></div>
                      <div className="meta">
                        {live.sha16 ? <span>sha16:{live.sha16} </span> : null}
                        {live.savedAt ? <span>· נמדד {live.savedAt.slice(11, 19)}Z</span> : <span>· לא נמדד</span>}
                      </div>
                    </>
                  )}
                </div>
              </span>
            </div>

            <div
              ref={stageRef}
              className="sm-stage"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              role="img"
              aria-label="מכונת-האמת של SAOS: קופות-אמת, מד-עמלות, מונה-גובה, תעלת-ביצועים, ספר-הזמנות ודגל-עצירה"
            >
              <svg className="sm-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ direction: "ltr" }} aria-hidden focusable="false">
                {/* base — painter order per computeBuild */}
                <g dangerouslySetInnerHTML={{ __html: build.chunks.base }} />
                {/* tanks + liquids (the lit amber = book) */}
                <g className="sm-assembly" onMouseEnter={onAssembly("tanks")} onMouseLeave={onAssemblyLeave}>
                  <g dangerouslySetInnerHTML={{ __html: build.chunks.tanks }} />
                  {[0, 1].map((i) => {
                    const rig = build.anchors.liquids[i];
                    if (!rig) return null;
                    const cls = rig.amber ? "sm-liq-amber" : "sm-liq-zinc";
                    return (
                      <g key={i} className={cls}>
                        <path className="sm-liq-deep" ref={setLiq(i, 0)} />
                        <path className="sm-liq-top" ref={setLiq(i, 1)} />
                        <path className="sm-liq-edge" ref={setLiq(i, 2)} />
                        {[0, 1, 2, 3].map((b) => (
                          <path key={b} className="sm-liq-band" data-band={b} ref={setLiq(i, 3 + b)} />
                        ))}
                      </g>
                    );
                  })}
                </g>
                {/* halt flag (pennant only when halted) */}
                <g className="sm-assembly" onMouseEnter={onAssembly("flag")} onMouseLeave={onAssemblyLeave}>
                  <g dangerouslySetInnerHTML={{ __html: build.chunks.flag }} />
                  <path className="sm-pennant" d={build.anchors.pennant} style={{ opacity: haltedChip ? 1 : 0 }} />
                </g>
                {/* fee gauge */}
                <g className="sm-assembly" onMouseEnter={onAssembly("gauge")} onMouseLeave={onAssemblyLeave}>
                  <g dangerouslySetInnerHTML={{ __html: build.chunks.gauge }} />
                  <path ref={needleRef} className="sm-needle" d={needlePath(P, 0)} />
                </g>
                {/* fills chute */}
                <g className="sm-assembly" onMouseEnter={onAssembly("chute")} onMouseLeave={onAssemblyLeave}>
                  <g dangerouslySetInnerHTML={{ __html: build.chunks.chuteA }} />
                  <g dangerouslySetInnerHTML={{ __html: build.chunks.chuteB }} />
                  <g ref={coinRef}>
                    <path className="iso-fill" d={build.anchors.coin.paths.fill} />
                    {[0, 1, 2, 3].map((s) => (
                      <path key={s} className="iso-shade" data-shade={s} d={(build.anchors.coin.paths.bands[s] ?? "")} />
                    ))}
                    <path className="iso-top" d={build.anchors.coin.paths.top} />
                    <path className="iso-line sm-coin-edge" data-tone="mid" d={build.anchors.coin.paths.edge} />
                  </g>
                </g>
                {/* height odometer */}
                <g className="sm-assembly" onMouseEnter={onAssembly("odo")} onMouseLeave={onAssemblyLeave}>
                  <g dangerouslySetInnerHTML={{ __html: build.chunks.odo }} />
                  <g clipPath="url(#sm-odo-win)">
                    {(digits ?? []).map((d, i) => (
                      <text
                        key={i}
                        className="sm-digit"
                        transform={build.anchors.drums[i]}
                        fontSize={5.4}
                        textAnchor="middle"
                        dominantBaseline="central"
                      >
                        {d}
                      </text>
                    ))}
                  </g>
                  <g dangerouslySetInnerHTML={{ __html: build.chunks.odoFront }} />
                </g>
                {/* order-book chest */}
                <g className="sm-assembly" onMouseEnter={onAssembly("chest")} onMouseLeave={onAssemblyLeave}>
                  <g dangerouslySetInnerHTML={{ __html: build.chunks.chest }} />
                  {Array.from({ length: DRAWER_SLOTS }, (_, i) => (
                    <g
                      key={i}
                      ref={(el) => { drawerRefs.current[i] = el; }}
                      dangerouslySetInnerHTML={{ __html: build.drawers[i] ?? "" }}
                    />
                  ))}
                </g>
              </svg>
              {chip ? (
                <div className="sm-chip" style={{ left: chip.x, top: chip.y }} data-amber>
                  <b>{chip.text}</b>
                </div>
              ) : null}
            </div>

            <div className="sm-legend">
              <span className="sm-key">
                <svg data-mark="lit" viewBox="0 0 16 10" aria-hidden><path d="M1.5 5h13" /></svg>
                נוזל-ענבר = הספר בפועל (מול התקרה כולה)
              </span>
              <span className="sm-key">
                <svg data-mark="flat" viewBox="0 0 16 10" aria-hidden><path d="M1.5 5h13" /></svg>
                קופות-מדידה: מינט 126,682 · תקרה 21,000,000
              </span>
              <span className="sm-key">
                <svg data-mark="red" viewBox="0 0 16 10" aria-hidden><path d="M1.5 5h13" /></svg>
                דגל-עצירה מונף = מנוע עצור
              </span>
            </div>
            <p className="sm-caption">
              המכונה היא ההסבר: שלוש קופות-מדידה מציגות את ההיצע מול התקרה כולה ({na(live.capHuman) ? "—" : "21M"} — הספר מלא פחות מ-1% ממנו, וזו-האמת);
              מונה-הגובה הוא גובה-השרשרת; מד-העמלות הוא מנוע-הכיול; כל מילוי מגלגל מטבע-אמת מהממוט אל הקופסה;
              ספר-הזמנות נפתח לפי ווליום. כל-מספר כאן נמדד מ-/api/giant/dex בלבד.
            </p>
          </div>
        </figure>
      </div>
    </section>
  );
}
