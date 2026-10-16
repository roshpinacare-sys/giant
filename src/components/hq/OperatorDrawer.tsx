"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ═══ עמדת-המפעיל של המשרד הריבוני (מוטמעת במודול-המשרד של GIANT) ════════
 * חוקי-אפס-חשיפה (הבעלים): המפתח מתרוקן מיד; רק טוקן-סשן (sessionStorage);
 * אין רמז לזהות-המנהל; כל תשובה כנה — כשל מדידה מוצג ככשל, לעולם לא ירוק-מזויף.
 * שער-אחד להכל: אותו מפתח-מנהל (headcorner) פותח גם את ערוץ-הבעלים. */

interface FeedAge {
  key: string;
  he: string;
  ageMin: number | null;
  capMin: number;
  state: "fresh" | "aging" | "stale" | "unknown";
}
interface StasisState {
  active: boolean | null;
  mode: string | null;
  allowCount: number;
  allOpen: boolean;
  label: string;
}
interface OrdersState {
  total: number;
  open: number;
  openIds: string[];
}
interface RunRow {
  name: string;
  event: string;
  status: string;
  conclusion: string | null;
  createdAt: string;
  ageMin: number | null;
}
interface OpsState {
  ok: boolean;
  feeds: FeedAge[];
  stasis: StasisState;
  orders: OrdersState;
  runs: RunRow[] | null;
  servedAt: string;
}

const QUICK = ["מצב כללי", "דופק הזנות", "מסילות-הון", "פקודות פתוחות", "רענן דופק"];

type Msg = { from: "me" | "sys"; text: string; at: string };

function dot(state: FeedAge["state"]) {
  return state === "fresh"
    ? "bg-emerald-600"
    : state === "aging"
      ? "bg-amber-500"
      : state === "stale"
        ? "bg-red-500"
        : "bg-stone-400";
}

export function OperatorDrawer() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"chat" | "board">("chat");
  const [token, setToken] = useState<string | null>(null);
  const [keyField, setKeyField] = useState("");
  const [authErr, setAuthErr] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      from: "sys",
      text: "עמדת-המפעיל חיה. הזן מפתח מנהל כדי להתחבר. המפתח לעולם לא נשמר ולא נשלח לשום מקום פרט לבדיקה מקומית בשרת.",
      at: new Date().toISOString(),
    },
  ]);
  const [cmd, setCmd] = useState("");
  const [cmdBusy, setCmdBusy] = useState(false);
  const [board, setBoard] = useState<OpsState | null>(null);
  const [boardErr, setBoardErr] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const tok = sessionStorage.getItem("soffice.ops");
      if (tok) setToken(tok);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [msgs, open]);

  const loadBoard = useCallback(async (tok: string) => {
    setBoardErr("");
    try {
      const res = await fetch("/api/office/ops/state", {
        headers: { authorization: `Bearer ${tok}` },
        cache: "no-store",
      });
      if (res.status === 401) {
        sessionStorage.removeItem("soffice.ops");
        setToken(null);
        return;
      }
      const d = (await res.json()) as OpsState;
      setBoard(d.ok ? d : null);
      if (!d.ok) setBoardErr("הלוח לא נמדד כרגע — נסה שוב");
    } catch {
      setBoardErr("רשת לא זמינה כרגע");
    }
  }, []);

  useEffect(() => {
    if (!token || !open) return;
    const t0 = window.setTimeout(() => void loadBoard(token), 0);
    const iv = setInterval(() => loadBoard(token), 30000);
    return () => {
      window.clearTimeout(t0);
      clearInterval(iv);
    };
  }, [token, open, loadBoard]);

  async function login() {
    if (!keyField.trim() || authBusy) return;
    setAuthBusy(true);
    setAuthErr("");
    const k = keyField;
    setKeyField(""); // השדה מתרוקן מיד — המפתח לא נשאר בזיכרון-הדף
    try {
      const res = await fetch("/api/office/ops/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: k }),
      });
      const d = (await res.json()) as { ok: boolean; token?: string; note?: string };
      if (d.ok && d.token) {
        sessionStorage.setItem("soffice.ops", d.token);
        setToken(d.token);
        setMsgs((m) => [...m, { from: "sys", text: "חוברת כמפעיל ✔ — הסשן חי 8 שעות. שלח פקודה או פתח את הלוח.", at: new Date().toISOString() }]);
      } else {
        setAuthErr(d.note ?? "מפתח לא מאומת — שום דבר לא נשמר");
      }
    } catch {
      setAuthErr("השרת לא נגיש כרגע");
    } finally {
      setAuthBusy(false);
    }
  }

  async function send(text: string) {
    if (!text.trim() || !token || cmdBusy) return;
    setCmdBusy(true);
    setMsgs((m) => [...m, { from: "me", text, at: new Date().toISOString() }]);
    setCmd("");
    try {
      const res = await fetch("/api/office/ops/command", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ text }),
      });
      if (res.status === 401) {
        sessionStorage.removeItem("soffice.ops");
        setToken(null);
        setMsgs((m) => [...m, { from: "sys", text: "הסשן פג — התחבר מחדש.", at: new Date().toISOString() }]);
        return;
      }
      const d = (await res.json()) as { ok: boolean; reply?: string };
      setMsgs((m) => [...m, { from: "sys", text: d.reply ?? "תשובה ריקה", at: new Date().toISOString() }]);
      loadBoard(token);
    } catch {
      setMsgs((m) => [...m, { from: "sys", text: "השרת לא נגיש כרגע — נסה שוב.", at: new Date().toISOString() }]);
    } finally {
      setCmdBusy(false);
    }
  }

  function logout() {
    sessionStorage.removeItem("soffice.ops");
    setToken(null);
    setBoard(null);
    setMsgs([{ from: "sys", text: "נותקת. הסשן נמחק.", at: new Date().toISOString() }]);
  }

  return (
    <>
      {/* כפתור-המפעיל — דיסקרטי, בפינת-המשרד */}
      <button
        onClick={() => setOpen(true)}
        aria-label="פתח עמדת מפעיל"
        className="absolute bottom-3 left-3 z-30 flex h-11 min-w-[44px] items-center gap-1.5 rounded-full border border-white/15 bg-zinc-900/85 px-3 text-xs font-semibold text-zinc-100 shadow-md backdrop-blur transition hover:border-amber-500/60 hover:text-amber-400"
      >
        <span aria-hidden className={`h-2 w-2 rounded-full ${token ? "bg-emerald-500" : "bg-stone-500"}`} />
        מפעיל
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-start" role="dialog" aria-label="עמדת מפעיל">
          <button aria-label="סגור" className="flex-1 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="flex w-full max-w-[520px] flex-col bg-zinc-950 shadow-2xl ring-1 ring-white/10" dir="rtl">
            <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-zinc-100">עמדת-המפעיל</span>
                {token && (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">מחובר · 8h</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {token && (
                  <button onClick={logout} className="h-9 rounded-md px-3 text-xs font-semibold text-zinc-400 transition hover:bg-white/5">
                    ניתוק
                  </button>
                )}
                <button onClick={() => setOpen(false)} aria-label="סגור עמדת מפעיל" className="h-9 w-9 rounded-md text-lg text-zinc-500 transition hover:bg-white/5">
                  ×
                </button>
              </div>
            </header>

            {!token ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8">
                <p className="text-center text-sm leading-6 text-zinc-400">
                  כניסת מנהל. הזן <b className="text-zinc-200">מפתח מנהל</b> — הוא נבדק מקומית בשרת, מתרוקן מיד, ולעולם לא נשמר.
                </p>
                <input
                  type="password"
                  value={keyField}
                  onChange={(e) => setKeyField(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && login()}
                  placeholder="מפתח מנהל"
                  autoComplete="off"
                  autoFocus
                  aria-label="מפתח מנהל"
                  className="h-11 w-full max-w-[320px] rounded-lg border border-white/15 bg-zinc-900 px-3 text-sm tracking-wide text-zinc-100 outline-none focus:border-amber-500/70"
                />
                <button
                  onClick={login}
                  disabled={authBusy || !keyField.trim()}
                  className="h-11 w-full max-w-[320px] rounded-lg bg-amber-600 text-sm font-semibold text-zinc-950 transition hover:bg-amber-500 disabled:opacity-40"
                >
                  {authBusy ? "בודק…" : "התחברות"}
                </button>
                {authErr && <p className="max-w-[320px] text-center text-xs leading-5 text-red-400">{authErr}</p>}
              </div>
            ) : (
              <>
                <nav className="flex border-b border-white/10 text-sm">
                  {(["chat", "board"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`h-11 flex-1 font-semibold transition ${tab === t ? "border-b-2 border-amber-500 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
                    >
                      {t === "chat" ? "שיחה" : "לוח-חי"}
                    </button>
                  ))}
                </nav>

                {tab === "chat" ? (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <div ref={logRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3" style={{ maxHeight: "52vh" }}>
                      {msgs.map((m, i) => (
                        <div key={i} className={`flex ${m.from === "me" ? "justify-start" : "justify-end"}`}>
                          <div
                            className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-[13px] leading-6 ${
                              m.from === "me" ? "bg-amber-600 text-zinc-950" : "border border-white/10 bg-zinc-900 text-zinc-200"
                            }`}
                          >
                            {m.text}
                          </div>
                        </div>
                      ))}
                      {cmdBusy && <div className="text-center text-xs text-zinc-500">מבצע…</div>}
                    </div>
                    <div className="flex flex-wrap gap-1.5 border-t border-white/10 px-3 py-2">
                      {QUICK.map((q) => (
                        <button
                          key={q}
                          onClick={() => send(q)}
                          disabled={cmdBusy}
                          className="h-9 rounded-full border border-white/15 bg-zinc-900 px-3 text-xs font-medium text-zinc-300 transition hover:border-amber-500/60 hover:text-amber-400 disabled:opacity-40"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2 border-t border-white/10 p-3">
                      <input
                        value={cmd}
                        onChange={(e) => setCmd(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && send(cmd)}
                        placeholder="פקודה לאוטונומיה… (עזרה לרשימה)"
                        aria-label="פקודה לאוטונומיה"
                        className="h-11 flex-1 rounded-lg border border-white/15 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none focus:border-amber-500/70"
                      />
                      <button
                        onClick={() => send(cmd)}
                        disabled={cmdBusy || !cmd.trim()}
                        className="h-11 rounded-lg bg-amber-600 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-amber-500 disabled:opacity-40"
                      >
                        שלח
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3" style={{ maxHeight: "62vh" }}>
                    {boardErr && <p className="text-xs text-red-400">{boardErr}</p>}
                    {!board && !boardErr && <p className="text-xs text-zinc-500">מודד…</p>}
                    {board && (
                      <>
                        <section
                          className={`rounded-xl border p-3 text-sm font-semibold ${
                            board.stasis.allOpen ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400" : "border-amber-500/40 bg-amber-500/5 text-amber-400"
                          }`}
                        >
                          🔓/🔒 מסילות-הון: {board.stasis.label}
                          <span className="mt-0.5 block text-[11px] font-normal text-zinc-400">
                            active={String(board.stasis.active)} · mode={board.stasis.mode} · מסילות-פתוחות {board.stasis.allowCount}/7 · בלם-חירום חמוש
                          </span>
                        </section>

                        <section>
                          <h3 className="mb-1.5 text-xs font-bold text-zinc-500">9 הזנות-החדר (חיות)</h3>
                          <div className="grid grid-cols-3 gap-1.5">
                            {board.feeds.map((f) => (
                              <div key={f.key} className="rounded-lg border border-white/10 bg-zinc-900 px-2 py-2 text-center" title={`${f.he}: ${f.ageMin ?? "?"} דק' מול מכסה ${f.capMin}`}>
                                <span className={`mx-auto mb-1 block h-2 w-2 rounded-full ${dot(f.state)}`} />
                                <div className="text-[12px] font-semibold text-zinc-200">{f.he}</div>
                                <div className="text-[10px] text-zinc-500">{f.ageMin === null ? "לא-נמדד" : `${f.ageMin}ד'/${f.capMin}`}</div>
                              </div>
                            ))}
                          </div>
                        </section>

                        <section className="rounded-xl border border-white/10 bg-zinc-900 p-3 text-sm text-zinc-200">
                          פקודות-עבודה:{" "}
                          <b className={board.orders.open ? "text-amber-400" : "text-emerald-400"}>
                            {board.orders.total - board.orders.open}/{board.orders.total} סגורות
                          </b>
                          {board.orders.open > 0 && <span className="text-xs text-zinc-400"> · פתוחות: {board.orders.openIds.join(", ")}</span>}
                        </section>

                        <section>
                          <h3 className="mb-1.5 text-xs font-bold text-zinc-500">ריצות אחרונות (Domain)</h3>
                          {board.runs ? (
                            <ul className="space-y-1">
                              {board.runs.map((r, i) => (
                                <li key={i} className="flex items-center justify-between rounded-lg border border-white/5 bg-zinc-900 px-2.5 py-1.5 text-[12px]">
                                  <span className="font-medium text-zinc-200">{r.name}</span>
                                  <span className="flex items-center gap-2 text-zinc-500">
                                    <span>{r.ageMin ?? "?"}ד'</span>
                                    <span className={`h-2 w-2 rounded-full ${r.conclusion === "success" ? "bg-emerald-500" : r.conclusion === null ? "bg-amber-500" : "bg-red-500"}`} />
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-zinc-500">לא-נמדד</p>
                          )}
                        </section>

                        <p className="text-[10px] text-zinc-600">
                          כל-הנתונים נמדדים חי מהגיט ומ-API · מוגש {new Date(board.servedAt).toLocaleTimeString("he-IL")}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
