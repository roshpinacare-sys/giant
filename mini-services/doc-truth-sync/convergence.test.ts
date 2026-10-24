import { describe, expect, test } from "bun:test";
import {
  buildIsolationManifest,
  verifyIsolationManifest,
  type LegacyArtifact,
} from "./convergence.ts";

const T0 = "2026-10-24T18:00:00Z";
const T1 = "2026-10-24T19:00:00Z";

const SEED: readonly LegacyArtifact[] = [
  {
    key: "autonomy-giant-folder",
    repo: "Autonomy",
    path: "giant/",
    description: "CHARTER.md + FRONT-CONTRACT.md + STATE.md — the exec38 seed folder that predates the giant repo",
    supersededBy: "roshpinacare-sys/giant",
    decisionRef: "DECISIONS #43 (exec38/38-a)",
  },
  {
    key: "zip-archive",
    repo: "Zip",
    description: "legacy coordination/benchmark docs archive (2026-10-07 era)",
    supersededBy: "roshpinacare-sys/giant",
    decisionRef: "duplicates-audit-2026-10-15",
  },
  {
    key: "project-files-archive",
    repo: "Project-files",
    description: "legacy daily reports (2026-09-11 era)",
    supersededBy: "roshpinacare-sys/giant",
    decisionRef: "DECISIONS #42 (R360)",
  },
];

describe("doc-truth convergence — legacy-archive isolation manifest", () => {
  test("manifest shape: version constant, canonical trunk, ARCHIVED-LEGACY status everywhere", () => {
    const m = buildIsolationManifest(SEED, T0);
    expect(m.version).toBe("SAOS-DOC-TRUTH-ISOLATION/1");
    expect(m.canonicalTrunk).toBe("roshpinacare-sys/giant");
    expect(m.entries).toHaveLength(3);
    for (const e of m.entries) {
      expect(e.status).toBe("ARCHIVED-LEGACY");
      expect(e.decisionRef).toMatch(/^(DECISIONS #\d+|duplicates-audit-)/);
    }
  });

  test("idempotence: same artifacts + different generation time → identical manifestHash", () => {
    const a = buildIsolationManifest(SEED, T0);
    const b = buildIsolationManifest(SEED, T1);
    expect(a.manifestHash).toBe(b.manifestHash);
  });

  test("manifestHash is sensitive to content change (description edit detected)", () => {
    const mutated: LegacyArtifact[] = SEED.map((x) =>
      x.key === "zip-archive" ? { ...x, description: "changed" } : x,
    );
    expect(buildIsolationManifest(mutated, T0).manifestHash).not.toBe(
      buildIsolationManifest(SEED, T0).manifestHash,
    );
  });

  test("duplicate keys fail closed", () => {
    expect(() => buildIsolationManifest([...SEED, SEED[0]], T0)).toThrow(/duplicate/);
  });

  test("empty key fails closed", () => {
    const bad: LegacyArtifact[] = [{ ...SEED[0], key: "" }];
    expect(() => buildIsolationManifest(bad, T0)).toThrow(/key/);
  });

  test("unknown decision refs fail closed (no fabricated authority)", () => {
    const bad: LegacyArtifact[] = [{ ...SEED[0], decisionRef: "DECISIONS #999" }];
    expect(() => buildIsolationManifest(bad, T0)).toThrow(/decisionRef/);
  });

  test("wrong canonical trunk fails closed — the law IS DECISIONS #42/#43", () => {
    expect(() => buildIsolationManifest(SEED, T0, "some-other-repo")).toThrow(/canonicalTrunk/);
  });

  test("verify accepts a built manifest and rejects tampering", () => {
    const m = buildIsolationManifest(SEED, T0);
    expect(verifyIsolationManifest(m).ok).toBe(true);
    const tampered = { ...m, entries: [{ ...m.entries[0], description: "tampered" }, ...m.entries.slice(1)] };
    expect(verifyIsolationManifest(tampered).ok).toBe(false);
  });

  test("empty artifact set is a valid honest manifest", () => {
    const m = buildIsolationManifest([], T0);
    expect(m.entries).toHaveLength(0);
    expect(verifyIsolationManifest(m).ok).toBe(true);
  });

  test("null path and string path both survive canonical hashing roundtrip", () => {
    const m = buildIsolationManifest(SEED, T0);
    const withNull = m.entries.find((e) => e.key === "zip-archive");
    const withPath = m.entries.find((e) => e.key === "autonomy-giant-folder");
    expect(withNull?.path).toBeNull();
    expect(withPath?.path).toBe("giant/");
  });
});
