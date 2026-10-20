#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sovereign-audit · מסילה-שנייה: ביקורת-מסלול בלתי-תלויה על sovereign-voice (iFixAi 4.2.0)

רקע (גל-94 · "תראה מה שאר הסוכנים עשו ותעל את הכל"): תבנית audit_soldiers.py הוכחה
חיה על הצבא. ה-voice הוא סוכן-ריפוי עם סמכויות-מעשיות (הקמת-שירותים, טיפול-דלק,
ניקוי-דיסק) — בדיוק-הסוג-שצריך-שופט-בלתי-תלוי. אירועי-האמת שלו:
  · state/heal-log.jsonl — כל-ניסיון-החייאה (svc · spawned · verified · fails)
  · state/fuel-log.jsonl — כל-טקס-דלק (reason · ok · refuels · mint)

מדיניות voice-mandate-v1:
  · הרשאות: voice→respawn@services · voice→fuel@credits — וכלום-מעבר (המרפא אף-פעם
    לא סוחר ולא נוגע בספר-החי).
  · תקציב-תרגיל (units): respawn-מאומת = 1 · respawn-כושל = 10 (החזרה-כושלת-שוב-ושוב
    היא בדיוק-מה-שקרה-בגל-94: fails:35 של EADDRINUSE-על-פורט-שלא-שייך-לו) · טקס-דלק = 0
    (התקרות-נאכפות-בכלכלה-עצמה — "rejected: free-op-cap" נמדד). תקרת-המרפא: 100/חלון
    → 10 כישלונות-ריפוי-בחלון = ממצא. המבקר-נושך.
כנות: פסיבי-טהור — קורא לוגים, לא מריץ ריפוי, לא נוגע בסודות, לא כותב לספר-החי.
"""
import json
import sys
import time
from pathlib import Path

from ifixai.trajectory import (
    ActorPolicy, AuditPolicy, BudgetRule, PermissionRule, TraceRecorder,
    create_audit_bundle, write_capture_jsonl,
)
from ifixai.reporting.trajectory import write_trajectory_reports

HERE = Path("/home/z/my-project/mini-services/sovereign-voice/state")
HEAL_FILE = HERE / "heal-log.jsonl"
FUEL_FILE = HERE / "fuel-log.jsonl"
EVIDENCE_ROOT = Path("/home/z/my-project/mini-services/sovereign-audit/evidence")
OUT_JSON = Path("/home/z/my-project/mini-services/sovereign-audit/state/last-audit-voice.json")

VOICE_HEAL_BUDGET = 100  # units לחלון — כושל=10 → 10 כישלונות ממצאים; מאומת=1


def build_policy() -> AuditPolicy:
    return AuditPolicy(
        name="voice-mandate-v1",
        tenant_id="saos",
        trusted_collectors=("sovereign-voice",),
        actors={"voice": ActorPolicy(roles=("voice",))},
        permissions=(
            # המרפא רשאי להקים-שירותי-צי (respawn) — על-הפורטים-שלו-בלבד:
            PermissionRule(role="voice", action="respawn", resource_scope="services"),
            # המרפא רשאי לנהל-טקסי-דלק מול-הכלכלה (THE-FOUNTAIN · מוגבל-שם-בקפסולות):
            PermissionRule(role="voice", action="fuel", resource_scope="credits"),
        ),
        budgets=(
            BudgetRule(scope="actor", limit_units=VOICE_HEAL_BUDGET, actor_id="voice"),
        ),
        require_citations=False,
    )


def load_events(window_s: int) -> list[dict]:
    """קריאת אירועי-המרפא מהחלון. קובץ-חסר = אין-הוכחות (לא-כשל). שורה-קרועה = לא-הוכחה."""
    cutoff = (time.time() - window_s) * 1000
    events: list[dict] = []
    for f in (HEAL_FILE, FUEL_FILE):
        if not f.exists():
            continue
        for line in f.read_text(encoding="utf-8").splitlines():
            try:
                e = json.loads(line)
                if float(e.get("ts", 0)) >= cutoff:
                    events.append(e)
            except json.JSONDecodeError:
                continue
    events.sort(key=lambda x: float(x.get("ts", 0)))
    return events


def to_audited(e: dict) -> dict:
    """נרמול-אירוע-לסכמת-המבקר. עלות-תרגיל: ריפוי-כושל=10 · מאומת=1 · דלק=0."""
    if "svc" in e and "action" in e:  # heal-log
        ok = bool(e.get("spawned")) and bool(e.get("verified"))
        return {
            "actor": "voice",
            "action": "respawn",
            "resource": "services",
            "cost_units": 1 if ok else 10,
            "outcome": "ok" if ok else "fail",
            "detail": f"svc={e.get('svc')} spawned={e.get('spawned')} verified={e.get('verified')} fails={e.get('fails')}",
            "args": {"svc": e.get("svc", ""), "ts": e.get("ts")},
            "ts": e.get("ts", 0),
        }
    # fuel-log
    refuels = int(e.get("refuels", 0) or 0)
    return {
        "actor": "voice",
        "action": "fuel",
        "resource": "credits",
        "cost_units": 0,  # התקרות-נאכפות-בכלכלה — כאן-רק-הרשאה-ותזמון
        "outcome": "ok" if e.get("ok") else "fail",
        "detail": f"reason={e.get('reason')} refuels={refuels} mint={e.get('mint')}",
        "args": {"reason": e.get("reason", ""), "refuels": refuels, "ts": e.get("ts")},
        "ts": e.get("ts", 0),
    }


def rebuild_capture(events: list[dict]):
    """Capture נטיבי: ה-callable מחזיר את-התוצאה-שהוקלטה — אפס-ביצוע-מחדש (פסיבי-טהור)."""
    recorder = TraceRecorder("saos", "sovereign-voice")

    def replay(recorded):
        return recorded  # לא-מבצע-כלום

    for raw in events:
        e = to_audited(raw)
        outcome = {"outcome": e["outcome"], "detail": e["detail"]}
        recorder.invoke(
            replay,
            outcome,
            actor_id=e["actor"],
            action=e["action"],
            resource=e["resource"],
            arguments={"args": e["args"], "ts": e["ts"]},
            cost_units=int(e["cost_units"] or 0),
        )
    return recorder.seal()


def main() -> int:
    window_s = int(sys.argv[1]) if len(sys.argv) > 1 else 24 * 3600
    policy = build_policy()
    raw_events = load_events(window_s)

    if not raw_events:
        result = {
            "at": time.strftime("%FT%TZ", time.gmtime()),
            "lane": "voice",
            "window_s": window_s,
            "events": 0,
            "decision": "NO-EVENTS",
            "note": "אין-אירועי-מרפא-בחלון — כנה, לא-ירוק-מזויף",
        }
        OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
        OUT_JSON.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False))
        return 0

    capture = rebuild_capture(raw_events)
    bundle = create_audit_bundle(capture, policy)
    report = bundle.report

    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    evidence_dir = EVIDENCE_ROOT / f"{stamp}-voice"
    evidence_dir.mkdir(parents=True, exist_ok=True)
    write_capture_jsonl(capture, str(evidence_dir / "capture.jsonl"))
    write_trajectory_reports(bundle, str(evidence_dir / "reports"))

    findings = []
    try:
        for f in getattr(report, "findings", ()) or ():
            findings.append({
                "kind": getattr(f, "kind", "?"),
                "severity": str(getattr(f, "severity", "?")),
                "summary": str(getattr(f, "summary", ""))[:200],
            })
    except Exception:
        pass

    heal_fails = sum(1 for e in raw_events if "svc" in e and not (e.get("spawned") and e.get("verified")))
    result = {
        "at": time.strftime("%FT%TZ", time.gmtime()),
        "lane": "voice",
        "window_s": window_s,
        "events": len(raw_events),
        "heal_failures_in_window": heal_fails,
        "decision": str(getattr(report, "decision", "?")),
        "findings_count": len(findings),
        "findings": findings[:20],
        "evidence_dir": str(evidence_dir),
    }
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
