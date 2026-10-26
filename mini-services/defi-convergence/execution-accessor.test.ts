// G76-h · feat/defi-convergence · deterministic zero-dep tests for the canonical
// SAOS-EXECUTION-LEDGER/1 accessor (read + validate + recover + locked atomic write).
// Law: every expectation is derived from the measured Domain/execution-state.json
// schema (commit a9e461615, cycle-31). Injected clocks — no sleeps, no network.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, utimesSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EXECUTION_LEDGER_SCHEMA,
  DEFAULT_STALE_AFTER_HOURS,
  validateExecutionState,
  isStaleLedger,
  boundedDefaultLedger,
  readExecutionState,
  recoverExecutionState,
  writeExecutionState,
  withLedgerLock,
  LockTimeoutError,
  type ExecutionStateDoc,
} from "./execution-accessor.ts";

const T0 = new Date("2026-10-26T15:00:00.000Z").getTime();

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), "g76h-accessor-"));
}

function validDoc(at: string = new Date(T0 - 3600_000).toISOString()): ExecutionStateDoc {
  return {
    schema: EXECUTION_LEDGER_SCHEMA,
    at,
    generator: "test-generator (measured)",
    sourceWorklog: "worklog (measured)",
    law: "test-law",
    freshness: { howToVerify: "git log", staleAfterHours: DEFAULT_STALE_AFTER_HOURS, renewedBy: "agent cycle" },
    measuredSnapshot: { externalProfit24hUsd: 0.0321 },
    done: ["d1"],
    partial: ["p1"],
    gaps: ["g1"],
    next: ["n1"],
  };
}

let root: string;
beforeEach(() => {
  root = tempRoot();
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("validateExecutionState", () => {
  test("accepts the measured Domain cycle-31 shape", () => {
    const v = validateExecutionState(validDoc());
    expect(v.valid).toBe(true);
  });

  test("rejects schema drift", () => {
    const v = validateExecutionState({ ...validDoc(), schema: "OTHER/9" } as ExecutionStateDoc);
    expect(v.valid).toBe(false);
    expect(v.reason).toContain("schema");
  });

  test("rejects missing core fields (at, generator, freshness, measuredSnapshot, arrays)", () => {
    for (const key of ["at", "generator", "freshness", "measuredSnapshot", "done", "partial", "gaps", "next"] as const) {
      const doc: any = { ...validDoc() };
      delete doc[key];
      const v = validateExecutionState(doc);
      expect(v.valid).toBe(false);
      expect(v.reason).toContain(key);
    }
  });

  test("rejects non-ISO `at` and negative staleAfterHours (schema drift class)", () => {
    expect(validateExecutionState({ ...validDoc(), at: "not-a-date" } as any).valid).toBe(false);
    expect(
      validateExecutionState({
        ...validDoc(),
        freshness: { staleAfterHours: -1 },
      } as any).valid,
    ).toBe(false);
  });

  test("rejects non-object input", () => {
    expect(validateExecutionState(null as any).valid).toBe(false);
    expect(validateExecutionState("nope" as any).valid).toBe(false);
  });
});

describe("isStaleLedger", () => {
  test("fresh within 48h window", () => {
    expect(isStaleLedger(validDoc(), T0)).toBe(false);
  });

  test("stale after staleAfterHours (48h) — measured Domain freshness law", () => {
    const doc = validDoc(new Date(T0 - 49 * 3600_000).toISOString());
    expect(isStaleLedger(doc, T0)).toBe(true);
  });

  test("exactly at boundary is stale (>= window)", () => {
    const doc = validDoc(new Date(T0 - 48 * 3600_000).toISOString());
    expect(isStaleLedger(doc, T0)).toBe(true);
  });
});

describe("boundedDefaultLedger — deterministic, never invents state", () => {
  test("stable output for identical clock (determinism)", () => {
    const a = boundedDefaultLedger(T0, "test");
    const b = boundedDefaultLedger(T0, "test");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("passes its own schema validation and carries honest-empty measured fields", () => {
    const doc = boundedDefaultLedger(T0, "test-recovery");
    const v = validateExecutionState(doc);
    expect(v.valid).toBe(true);
    // zero invented numbers: measuredSnapshot holds only the honest note
    expect(Object.keys(doc.measuredSnapshot)).toEqual(["note"]);
    expect(String(doc.measuredSnapshot.note)).toContain("no measured snapshot");
    expect(doc.done).toEqual([]);
    expect(doc.partial).toEqual([]);
    expect(doc.gaps).toEqual([]);
    expect(doc.next).toEqual([]);
    expect(doc.freshness.staleAfterHours).toBe(DEFAULT_STALE_AFTER_HOURS);
  });
});

describe("readExecutionState", () => {
  test("ok: valid ledger at first candidate", () => {
    const p = join(root, "execution-state.json");
    writeFileSync(p, JSON.stringify(validDoc(), null, 1));
    const r = readExecutionState({ candidates: [p], now: T0 });
    expect(r.status).toBe("ok");
    expect(r.doc?.schema).toBe(EXECUTION_LEDGER_SCHEMA);
    expect(r.path).toBe(p);
  });

  test("missing: no candidates exist — never throws", () => {
    const r = readExecutionState({ candidates: [join(root, "absent.json")], now: T0 });
    expect(r.status).toBe("missing");
    expect(r.doc).toBeNull();
  });

  test("invalid: corrupt JSON is reported with reason, never thrown", () => {
    const p = join(root, "torn.json");
    writeFileSync(p, '{"schema": "SAOS-EXEC'); // torn mid-write
    const r = readExecutionState({ candidates: [p], now: T0 });
    expect(r.status).toBe("invalid");
    expect(r.reason).toBeTruthy();
  });

  test("invalid: schema drift is reported", () => {
    const p = join(root, "drift.json");
    writeFileSync(p, JSON.stringify({ ...validDoc(), schema: "SAOS-EXECUTION-LEDGER/0" }));
    const r = readExecutionState({ candidates: [p], now: T0 });
    expect(r.status).toBe("invalid");
  });

  test("stale: valid schema older than freshness window is flagged stale with doc retained", () => {
    const p = join(root, "old.json");
    writeFileSync(p, JSON.stringify(validDoc(new Date(T0 - 96 * 3600_000).toISOString())));
    const r = readExecutionState({ candidates: [p], now: T0 });
    expect(r.status).toBe("stale");
    expect(r.doc).not.toBeNull();
  });

  test("falls back through candidates in measured order", () => {
    const bad = join(root, "bad.json");
    const good = join(root, "good.json");
    writeFileSync(bad, "}{");
    writeFileSync(good, JSON.stringify(validDoc()));
    const r = readExecutionState({ candidates: [bad, good], now: T0 });
    expect(r.status).toBe("ok");
    expect(r.path).toBe(good);
  });
});

describe("recoverExecutionState — deterministic recovery from measured history", () => {
  test("none: healthy primary is left untouched (byte-identical)", () => {
    const p = join(root, "execution-state.json");
    const bytes = JSON.stringify(validDoc(), null, 1);
    writeFileSync(p, bytes);
    const r = recoverExecutionState({ candidates: [p], mirrorCandidates: [], now: T0 });
    expect(r.action).toBe("none");
    expect(readFileSync(p, "utf8")).toBe(bytes);
    expect(r.wroteTo).toBeNull();
  });

  test("recovered-from-mirror: missing primary rebuilt byte-true from last-good mirror", () => {
    const p = join(root, "execution-state.json");
    const m = join(root, "mirror", "execution-state.json");
    mkdirSync(join(root, "mirror"), { recursive: true });
    const bytes = JSON.stringify(validDoc(), null, 1);
    writeFileSync(m, bytes);
    const r = recoverExecutionState({ candidates: [p], mirrorCandidates: [m], now: T0 });
    expect(r.action).toBe("recovered-from-mirror");
    expect(r.wroteTo).toBe(p);
    expect(readFileSync(p, "utf8")).toBe(bytes); // byte-true, no re-serialization drift
  });

  test("corrupt primary: quarantined as *.corrupt-* and replaced from mirror", () => {
    const p = join(root, "execution-state.json");
    writeFileSync(p, '{"schema": torn');
    const m = join(root, "mirror.json");
    const bytes = JSON.stringify(validDoc(), null, 1);
    writeFileSync(m, bytes);
    const r = recoverExecutionState({ candidates: [p], mirrorCandidates: [m], now: T0 });
    expect(r.action).toBe("recovered-from-mirror");
    const quarantine = readdirSync(root).filter((f) => f.includes(".corrupt-"));
    expect(quarantine.length).toBe(1);
    expect(readFileSync(join(root, quarantine[0]), "utf8")).toBe('{"schema": torn'); // evidence preserved
    expect(readFileSync(p, "utf8")).toBe(bytes);
  });

  test("bootstrapped: no history at all → bounded default with zero invented numbers", () => {
    const p = join(root, "execution-state.json");
    const r = recoverExecutionState({ candidates: [p], mirrorCandidates: [], now: T0 });
    expect(r.action).toBe("bootstrapped");
    const back = JSON.parse(readFileSync(p, "utf8"));
    expect(back.schema).toBe(EXECUTION_LEDGER_SCHEMA);
    expect(back.measuredSnapshot.note).toContain("no measured snapshot");
    expect(back.done).toEqual([]);
    // re-read through the accessor: healthy
    const rr = readExecutionState({ candidates: [p], now: T0 });
    expect(rr.status).toBe("ok");
  });

  test("bootstrapped default is deterministic across recoveries with the same clock", () => {
    const p1 = join(root, "a", "execution-state.json");
    const p2 = join(root, "b", "execution-state.json");
    recoverExecutionState({ candidates: [p1], mirrorCandidates: [], now: T0 });
    recoverExecutionState({ candidates: [p2], mirrorCandidates: [], now: T0 });
    expect(readFileSync(p1, "utf8")).toBe(readFileSync(p2, "utf8"));
  });

  test("skips mirror candidates that are themselves invalid", () => {
    const p = join(root, "execution-state.json");
    const badMirror = join(root, "bad-mirror.json");
    writeFileSync(badMirror, "garbage");
    const r = recoverExecutionState({ candidates: [p], mirrorCandidates: [badMirror], now: T0 });
    expect(r.action).toBe("bootstrapped");
  });
});

describe("writeExecutionState — locked atomic writes", () => {
  test("writes valid doc atomically: no tmp residue, content round-trips", async () => {
    const p = join(root, "execution-state.json");
    await writeExecutionState(validDoc(), p, { now: T0 });
    const back = JSON.parse(readFileSync(p, "utf8"));
    expect(back.at).toBe(validDoc().at);
    const residue = readdirSync(root).filter((f) => f.startsWith("execution-state.json.tmp-"));
    expect(residue).toEqual([]);
    expect(existsSync(p + ".lock")).toBe(false);
  });

  test("refuses invalid schema (fail-closed) and leaves target unchanged", async () => {
    const p = join(root, "execution-state.json");
    const original = JSON.stringify(validDoc(), null, 1);
    writeFileSync(p, original);
    await expect(writeExecutionState({ schema: "BOGUS" } as any, p, { now: T0 })).rejects.toThrow(/schema/i);
    expect(readFileSync(p, "utf8")).toBe(original);
  });

  test("concurrent writers cannot tear the file — final bytes are exactly one writer's payload", async () => {
    const p = join(root, "execution-state.json");
    const payloads = Array.from({ length: 8 }, (_, i) =>
      validDoc(new Date(T0 - (i + 1) * 1000).toISOString()),
    );
    await Promise.all(payloads.map((doc) => writeExecutionState(doc, p, { now: T0 })));
    const finalText = readFileSync(p, "utf8");
    const finalDoc = JSON.parse(finalText);
    expect(finalDoc.schema).toBe(EXECUTION_LEDGER_SCHEMA);
    // file is not torn: it must byte-match exactly one of the writers' serializations
    const matched = payloads.filter((d) => JSON.stringify(d, null, 2) + "\n" === finalText).length;
    expect(matched).toBe(1);
    const residue = readdirSync(root).filter((f) => f.startsWith("execution-state.json.tmp-"));
    expect(residue).toEqual([]);
    expect(existsSync(p + ".lock")).toBe(false);
  });

  test("stale lock is taken over, not waited on forever", async () => {
    const p = join(root, "execution-state.json");
    const lock = p + ".lock";
    writeFileSync(lock, '{"pid":1,"at":"old"}');
    const old = new Date(T0 - 10 * 60_000);
    utimesSync(lock, old, old); // 10 minutes old > 30s stale window (injected clock below)
    await writeExecutionState(validDoc(), p, { now: T0, lockStaleMs: 30_000, clock: () => T0 });
    expect(JSON.parse(readFileSync(p, "utf8")).schema).toBe(EXECUTION_LEDGER_SCHEMA);
  });

  test("fresh foreign lock times out fail-closed (LockTimeoutError), target untouched", async () => {
    const p = join(root, "execution-state.json");
    writeFileSync(p + ".lock", '{"pid":999999,"at":"now"}');
    let err: unknown = null;
    try {
      await withLedgerLock(p, { timeoutMs: 120, retryMs: 20, staleMs: 60_000 }, async () => {});
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(LockTimeoutError);
    expect(existsSync(p)).toBe(false);
  });

  test("withLedgerLock releases on success and on thrown error", async () => {
    const p = join(root, "x.json");
    await withLedgerLock(p, { timeoutMs: 2000, retryMs: 10 }, async () => "ok");
    expect(existsSync(p + ".lock")).toBe(false);
    try {
      await withLedgerLock(p, { timeoutMs: 2000, retryMs: 10 }, async () => {
        throw new Error("boom");
      });
    } catch {}
    expect(existsSync(p + ".lock")).toBe(false);
  });
});
