import { readdirSync, readFileSync } from "node:fs";

/**
 * singleflight.ts — /proc-scan authority (G62 lesson: disk locks are not
 * authority; the wipe deletes lock files but not live processes).
 */
export function detectSiblings(io: {
  selfPid: number;
  cmdlines: Map<number, string>;
  tag?: string;
}): number[] {
  const tag = io.tag ?? "organ-commander";
  const sibs: number[] = [];
  for (const [pid, cmd] of io.cmdlines) {
    if (pid === io.selfPid) continue;
    if (cmd.includes(tag)) sibs.push(pid);
  }
  return sibs.sort((a, b) => a - b);
}

/** Real /proc scan (runtime). Offline tests inject cmdlines. */
export function liveSiblings(selfPid: number): number[] {
  const cmdlines = new Map<number, string>();
  try {
    for (const d of readdirSync("/proc")) {
      if (!/^\d+$/.test(d)) continue;
      try {
        cmdlines.set(Number(d), readFileSync(`/proc/${d}/cmdline`, "utf8").replace(/\0/g, " "));
      } catch { /* vanished between calls — honest skip */ }
    }
  } catch { /* no /proc — honest empty */ }
  return detectSiblings({ selfPid, cmdlines });
}
