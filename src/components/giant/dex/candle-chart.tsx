"use client";

// giant DEX · גרף-נרות מקצועי (קנבס): נרות + מנפח + צלב-עקיבה + זום-גלגלת + גרירה
// רספונסיבי, HiDPI — בתקן-הטרמינלים של הענקים.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Candle } from "@/lib/dex-types";

interface Props {
  candles: Candle[];
  loading?: boolean;
  base?: string;
  quote?: string;
  height?: number;
}

interface ViewRange {
  start: number;
  count: number;
}

const UP = "#34d399";
const DOWN = "#f87171";
const GRID = "rgba(255,255,255,0.05)";
const TEXT = "rgba(255,255,255,0.45)";
const CROSS = "rgba(255,255,255,0.35)";

export function CandleChart({ candles, loading, base = "", quote = "USDS", height = 380 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [range, setRange] = useState<ViewRange>({ start: 0, count: 90 });
  const followRef = useRef(true); // עוקב-אחר-הנר-האחרון עד-לגרירת-משתמש
  const [hover, setHover] = useState<{ y: number; idx: number } | null>(null);
  const dragRef = useRef<{ x: number; start: number } | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || candles.length === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = wrap.clientWidth;
    const h = height;
    sizeRef.current = { w, h };
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const padRight = 64;
    const padTop = 8;
    const volH = Math.round(h * 0.18);
    const priceH = h - volH - padTop - 22;
    const plotW = w - padRight - 8;

    // חלון-צפייה: בעקיבה-אוטומטית מציגים-את-הנרות-האחרונים; אחרת-הטווח-הנבחר
    const count0 = Math.min(range.count || 90, candles.length);
    const start = followRef.current
      ? Math.max(0, candles.length - count0)
      : Math.max(0, Math.min(range.start, Math.max(0, candles.length - count0)));
    const end = Math.min(candles.length, start + count0);
    const view = candles.slice(start, end);
    if (view.length === 0) return;

    let hi = -Infinity;
    let lo = Infinity;
    let vMax = 0;
    for (const c of view) {
      if (c.h > hi) hi = c.h;
      if (c.l < lo) lo = c.l;
      if (c.v > vMax) vMax = c.v;
    }
    const pad = (hi - lo) * 0.08 || hi * 0.01 || 1;
    hi += pad;
    lo -= pad;

    const bw = plotW / view.length;
    const bodyW = Math.max(1, Math.min(14, bw * 0.62));
    const yOf = (p: number) => padTop + ((hi - p) / (hi - lo)) * priceH;
    const xOf = (i: number) => 8 + i * bw + bw / 2;

    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const p = lo + ((hi - lo) * i) / steps;
      const y = yOf(p);
      ctx.strokeStyle = GRID;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(8, y);
      ctx.lineTo(w - padRight, y);
      ctx.stroke();
      ctx.fillStyle = TEXT;
      ctx.fillText(fmtAxis(p), w - padRight + 6, y);
    }

    for (let i = 0; i < view.length; i++) {
      const c = view[i];
      const x = xOf(i);
      const vh = vMax > 0 ? (c.v / vMax) * (volH - 6) : 0;
      ctx.fillStyle = c.c >= c.o ? "rgba(52,211,153,0.28)" : "rgba(248,113,113,0.28)";
      ctx.fillRect(x - bodyW / 2, h - 22 - vh, bodyW, vh);
    }

    for (let i = 0; i < view.length; i++) {
      const c = view[i];
      const x = xOf(i);
      const col = c.c >= c.o ? UP : DOWN;
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = Math.max(1, Math.min(2, bodyW * 0.14));
      ctx.beginPath();
      ctx.moveTo(x, yOf(c.h));
      ctx.lineTo(x, yOf(c.l));
      ctx.stroke();
      const yO = yOf(c.o);
      const yC = yOf(c.c);
      const top = Math.min(yO, yC);
      const bh = Math.max(1, Math.abs(yC - yO));
      ctx.fillRect(bodyW <= 2 ? x - 0.5 : x - bodyW / 2, top, bodyW <= 2 ? 1.5 : bodyW, bh);
    }

    const last = view[view.length - 1];
    const yLast = yOf(last.c);
    const lastCol = last.c >= last.o ? UP : DOWN;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = lastCol;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(8, yLast);
    ctx.lineTo(w - padRight, yLast);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = lastCol;
    ctx.fillRect(w - padRight + 2, yLast - 9, padRight - 4, 18);
    ctx.fillStyle = "#0b0f0e";
    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillText(fmtAxis(last.c), w - padRight + 6, yLast);

    ctx.fillStyle = TEXT;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    const tickEvery = Math.max(1, Math.floor(view.length / 6));
    for (let i = 0; i < view.length; i += tickEvery) {
      const d = new Date(view[i].t * 1000);
      const label = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      const x = xOf(i);
      ctx.fillText(label, Math.max(18, Math.min(w - padRight - 18, x)), h - 8);
    }

    if (hover && hover.idx >= start && hover.idx < end) {
      const c = candles[hover.idx];
      const x = xOf(hover.idx - start);
      ctx.strokeStyle = CROSS;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, h - 22);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(8, hover.y);
      ctx.lineTo(w - padRight, hover.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const txt = `${base}/${quote}  O ${fmtP(c.o)}  H ${fmtP(c.h)}  L ${fmtP(c.l)}  C ${fmtP(c.c)}  Vol ${fmtVol(c.v)}`;
      ctx.font = "11px ui-monospace, monospace";
      const tw = ctx.measureText(txt).width + 16;
      const bx = Math.max(8, Math.min(w - padRight - tw, x - tw / 2));
      ctx.fillStyle = "rgba(10,14,13,0.92)";
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(bx, padTop + 2, tw, 24, 6);
      else ctx.rect(bx, padTop + 2, tw, 24);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = c.c >= c.o ? UP : DOWN;
      ctx.textAlign = "left";
      ctx.fillText(txt, bx + 8, padTop + 14);
    }
  }, [candles, range, hover, height, base, quote]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  const onMove = (e: React.MouseEvent) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    if (dragRef.current) {
      const dx = e.clientX - dragRef.current.x;
      const bw = (sizeRef.current.w - 72) / range.count;
      const shift = Math.round(dx / bw);
      if (shift !== 0) followRef.current = false;
      const ns = Math.max(0, Math.min(Math.max(0, candles.length - range.count), dragRef.current.start + shift));
      setRange((r) => ({ ...r, start: ns }));
      return;
    }
    const plotW = sizeRef.current.w - 72;
    const rel = e.clientX - rect.left - 8;
    const i = Math.floor((rel / plotW) * range.count);
    const idx = Math.max(0, Math.min(candles.length - 1, range.start + i));
    setHover({ y: e.clientY - rect.top, idx });
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    followRef.current = false;
    setRange((r) => {
      const factor = e.deltaY > 0 ? 1.18 : 0.85;
      const count = Math.max(20, Math.min(500, Math.round(r.count * factor)));
      const mid = r.start + r.count / 2;
      const start = Math.max(0, Math.min(Math.max(0, candles.length - count), Math.round(mid - count / 2)));
      return { start, count };
    });
  };

  if (loading) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-white/5 bg-white/[0.02]"
        style={{ height }}
      >
        <span className="text-sm text-zinc-500">טוען נרות…</span>
      </div>
    );
  }

  if (candles.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-white/5 bg-white/[0.02]"
        style={{ height }}
      >
        <span className="text-sm text-zinc-500">אין נתוני-גרף</span>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="relative cursor-crosshair select-none"
      onMouseMove={onMove}
      onMouseLeave={() => {
        setHover(null);
        dragRef.current = null;
      }}
      onMouseDown={(e) => {
        dragRef.current = { x: e.clientX, start: range.start };
      }}
      onMouseUp={() => {
        dragRef.current = null;
      }}
      onWheel={onWheel}
      role="img"
      aria-label={`גרף-נרות ${base}/${quote}`}
    >
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}

function fmtAxis(p: number): string {
  const a = Math.abs(p);
  const d = a >= 10000 ? 0 : a >= 100 ? 1 : a >= 1 ? 3 : 5;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(p);
}
function fmtP(p: number): string {
  const a = Math.abs(p);
  const d = a >= 1000 ? 2 : a >= 1 ? 4 : 6;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: d }).format(p);
}
function fmtVol(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}
