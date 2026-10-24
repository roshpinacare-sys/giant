/* ═══ issue-forge · probe-runner.ts — the real-execution probe (Mode A core) ════
 * Invoked by the authoring phase in a bounded child process:
 *   bun probe-runner.ts <absModulePath> <preferredFnName|">
 *
 * What it does (all real, no invention):
 *  1. dynamically imports the audited module (side-effect-free modules only
 *     survive — an import failure is an honest {ok:false})
 *  2. enumerates exported functions
 *  3. characterizes the first candidate that survives: ≥3 calls with
 *     synthesized deterministic inputs, each call run TWICE to prove
 *     determinism AT AUTHORING TIME; outputs must be serializable
 *  4. prints exactly one JSON result line: {ok, name, cases, async} | {ok:false, reason}
 *
 * The captured cases become the literal assertions of the generated
 * characterization suite — assertions computed from real execution, never invented.
 */

function canon(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "undefined";
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  const o = v as Record<string, unknown>;
  return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + canon(o[k])).join(",") + "}";
}

/* deterministic input pools — rotated per (position, pattern) */
const NUMS: unknown[] = [1, 0, 2, 5, -3, 100];
const STRS: unknown[] = ["", "hello", "A-B", "x y", "0"];
const BOOLS: unknown[] = [true, false];
const ARRAYS: unknown[] = [[1, 2, 3], []];
const OBJS: unknown[] = [{}, { a: 1 }];
const POOLS: unknown[][] = [NUMS, STRS, BOOLS, ARRAYS, OBJS];

function argValue(pos: number, pattern: number): unknown {
  const pool = POOLS[(pos + pattern) % POOLS.length];
  return pool[(pattern * 2 + pos) % pool.length];
}

function isThenable(v: unknown): v is Promise<unknown> {
  return !!v && typeof (v as { then?: unknown }).then === "function";
}

interface CallOutcome {
  ok: boolean;
  out?: string;
  isAsync?: boolean;
  err?: string;
}

async function callOnce(fn: (...a: unknown[]) => unknown, args: unknown[]): Promise<CallOutcome> {
  try {
    const r = fn(...args);
    if (isThenable(r)) {
      const v = await Promise.race([
        r,
        new Promise((_rej_v, rej) => setTimeout(() => rej(new Error("probe-call-timeout")), 3000)),
      ]);
      return { ok: true, out: canon(v), isAsync: true };
    }
    return { ok: true, out: canon(r), isAsync: false };
  } catch (e) {
    return { ok: false, err: e instanceof Error ? e.message : String(e) };
  }
}

interface ProbeCase {
  args: unknown[];
  out: string;
  isAsync: boolean;
}

async function main(): Promise<void> {
  const [modulePath, prefer] = process.argv.slice(2);
  const fail = (reason: string): void => {
    console.log(JSON.stringify({ ok: false, reason }));
  };
  if (!modulePath) return fail("missing-module-arg");

  let mod: Record<string, unknown>;
  try {
    mod = (await import(modulePath)) as Record<string, unknown>;
  } catch (e) {
    return fail("import-failed: " + (e instanceof Error ? e.message.slice(0, 200) : String(e)));
  }

  const names = Object.keys(mod).filter((k) => typeof mod[k] === "function" && !k.startsWith("__"));
  const ordered = prefer ? [prefer, ...names.filter((n) => n !== prefer)] : names;

  for (const name of ordered.slice(0, 12)) {
    const fn = mod[name] as (...a: unknown[]) => unknown;
    if (typeof fn !== "function") continue;
    const cases: ProbeCase[] = [];
    for (let pattern = 0; pattern < 8 && cases.length < 3; pattern++) {
      const args = [0, 1, 2].map((pos) => argValue(pos, pattern));
      const a = await callOnce(fn, args);
      if (!a.ok || a.out === undefined) continue;
      const b = await callOnce(fn, args); // determinism proof at authoring time
      if (!b.ok || b.out !== a.out) continue;
      cases.push({ args, out: a.out, isAsync: !!a.isAsync });
    }
    if (cases.length >= 3) {
      console.log(JSON.stringify({ ok: true, name, cases, async: cases[0].isAsync }));
      return;
    }
  }
  fail("no-characterizable-function");
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, reason: "runner-crash: " + String(e).slice(0, 200) }));
});
