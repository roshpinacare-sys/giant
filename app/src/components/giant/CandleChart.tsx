"use client";

/* גרף-נרות — SVG טהור (אפס-תלות) · נרות-מחיר + עמודות-ווליום · נתוני-מנוע-אמת
 * קנון-יחידות: כל-הערכים ב-µ — הציר והתוויות מציגים ביחידות (µ÷1000). */

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  vMu: number;
  qMu: number;
  n: number;
}

const UP = "#10b981";
const DOWN = "#ef4444";

/* µ → יחידה-שלמה, תווית-ציר */
function fmtAxis(mu: number, unit: "mu" | "plain"): string {
  const u = unit === "mu" ? mu / 1000 : mu;
  if (u >= 1e6) return `$${(u / 1e6).toFixed(2)}M`;
  if (u >= 1000) return `$${(u / 1e3).toFixed(1)}K`;
  return unit === "mu" ? u.toFixed(u < 10 ? 2 : 1) : `$${u.toFixed(u < 10 ? 4 : 2)}`;
}

function computeView(candles: Candle[], H: number) {
  const W = 1000;
  const padL = 8, padR = 62, padT = 10;
  const priceH = Math.round(H * 0.72);
  const volTop = priceH + 14;
  const volH = H - volTop - 18;
  if (!candles.length) return null;
  const cs = candles.slice(-120);
  let min = Infinity, max = -Infinity, maxV = 0;
  for (const c of cs) {
    if (c.l < min) min = c.l;
    if (c.h > max) max = c.h;
    if (c.vMu > maxV) maxV = c.vMu;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const span = max - min || max * 0.01 || 1;
  min -= span * 0.05;
  max += span * 0.05;
  const step = (W - padL - padR) / cs.length;
  const bw = Math.max(1.5, step * 0.62);
  const y = (p: number) => padT + priceH - ((p - min) / (max - min)) * priceH;
  const vh = (v: number) => (maxV > 0 ? (v / maxV) * volH : 0);
  return { W, padL, padR, priceH, volTop, volH, cs, min, max, step, bw, y, vh, maxV, gridLines: 4 };
}

export function CandleChart({
  candles,
  height = 320,
  unit = "mu",
}: {
  candles: Candle[];
  height?: number;
  /** "mu" = קנון-המנוע (÷1000 להצגה) · "plain" = יחידות-שוק-אמת (USD מלא) */
  unit?: "mu" | "plain";
}) {
  const H = height;
  const view = computeView(candles, H);

  if (!view) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-zinc-600" style={{ height }}>
        אין נרות להצגה
      </div>
    );
  }
  const { W, padL, padR, volTop, volH, cs, min, max, step, bw, y, vh, maxV, gridLines } = view;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" style={{ direction: "ltr" }} role="img" aria-label="גרף-נרות מחיר">
      {/* רשת + ציר-מחיר */}
      {Array.from({ length: gridLines + 1 }).map((_, i) => {
        const p = min + ((max - min) * i) / gridLines;
        const yy = y(p);
        return (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={yy} y2={yy} stroke="#27272a" strokeWidth="1" />
            <text x={W - padR + 6} y={yy + 3.5} fill="#71717a" fontSize="11" fontFamily="monospace">
              {fmtAxis(p, unit)}
            </text>
          </g>
        );
      })}
      {/* עמודות-ווליום */}
      {cs.map((c, i) => {
        const x = padL + i * step + (step - bw) / 2;
        const h = vh(c.vMu);
        return (
          <rect
            key={`v${i}`}
            x={x}
            y={volTop + volH - h}
            width={bw}
            height={Math.max(0.5, h)}
            fill={c.c >= c.o ? UP : DOWN}
            opacity="0.35"
          />
        );
      })}
      {/* נרות */}
      {cs.map((c, i) => {
        const x = padL + i * step + (step - bw) / 2;
        const up = c.c >= c.o;
        const color = up ? UP : DOWN;
        const bodyTop = y(Math.max(c.o, c.c));
        const bodyH = Math.max(1, Math.abs(y(c.o) - y(c.c)));
        return (
          <g key={`c${i}`}>
            <line x1={x + bw / 2} x2={x + bw / 2} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth="1" />
            <rect x={x} y={bodyTop} width={bw} height={bodyH} fill={color} />
          </g>
        );
      })}
      {/* קו-מחיר-אחרון */}
      {(() => {
        const last = cs[cs.length - 1];
        const yy = y(last.c);
        return (
          <g>
            <line x1={padL} x2={W - padR} y1={yy} y2={yy} stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 3" opacity="0.8" />
            <rect x={W - padR + 2} y={yy - 9} width={58} height={18} rx="3" fill="#f59e0b" />
            <text x={W - padR + 8} y={yy + 4} fill="#18181b" fontSize="11" fontWeight="bold" fontFamily="monospace">
              {fmtAxis(last.c, unit)}
            </text>
          </g>
        );
      })()}
      {/* תווית-ווליום */}
      <text x={padL + 2} y={volTop - 2} fill="#52525b" fontSize="10">
        VOL max {unit === "mu" ? (maxV / 1000 >= 1000 ? `${((maxV / 1000) / 1e3).toFixed(1)}K` : `${Math.round(maxV / 1000)}`) : maxV >= 1000 ? `${(maxV / 1e3).toFixed(1)}K` : maxV.toFixed(1)}
      </text>
    </svg>
  );
}
