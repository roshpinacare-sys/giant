#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sovereign-audit · ביקורת-מסלול בלתי-תלויה על צבא-החיילים (iFixAi 4.2.0 · trajectory-assurance)

רעיון-העל (צו-בעלים: "בחן כיצד תיקיות אלו יכולות לעזור לנו לארכיטקטורה"):
  iFixAi = ביקורת-בלתי-תלויה על סוכני-AI. החיילים שלנו = סוכנים-אוטונומיים עם בנק-אמיתי.
  המבקר פסיבי לגמרי: קורא את האירועים-שהוקלטו (state/actions.jsonl של soldier-army),
  בונה capture נטיבי (ה-callable שמספקים-לו מחזיר את התוצאה-שהוקלטה — אפס-ביצוע-מחדש),
  ומשווה מול מדיניות-המנדט (msg-8): הרשאות-תפקיד · תקרת-בנק-פר-חייל (300,000µ).
  פלט: decision (CLEAR/FINDINGS) + דוחות-הוכחה מוקפאים (JSONL+MD).

כנות: המבקר לעולם לא מריץ פקודות מסחר, לא נוגע בסודות, ולא כותב לספר-החי.
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

ACTIONS_FILE = Path("/home/z/my-project/mini-services/soldier-army/state/actions.jsonl")
EVIDENCE_ROOT = Path("/home/z/my-project/mini-services/sovereign-audit/evidence")
OUT_JSON = Path("/home/z/my-project/mini-services/sovereign-audit/state/last-audit.json")

SOLDIERS = ["yarden", "tamar", "shachar", "aluf", "erez", "gal"]
BANK_LIMIT_MU = 300_000  # תקרת-בנק-יציב פר-חייל (msg-8) — חשיפת-מקסימום-מותרת בחלון-הביקורת


def build_policy() -> AuditPolicy:
    actors = {s: ActorPolicy(roles=("soldier",)) for s in SOLDIERS}
    actors["operator"] = ActorPolicy(roles=("operator",))
    return AuditPolicy(
        name="soldier-mandate-msg8",
        tenant_id="saos",
        trusted_collectors=("soldier-army",),
        actors=actors,
        permissions=(
            # חייל רשאי להציב הזמנות postOnly על הזוג-הריבוני בלבד:
            PermissionRule(role="soldier", action="order", resource_scope="SAOS/USDS"),
            # חייל רשאי לבקש דלק-קרדיטים (THE-FOUNTAIN):
            PermissionRule(role="soldier", action="fuel", resource_scope="credits"),
            # חייל רשאי לנתב עודף-רווחים רק אל-המפעיל (לעולם לא שלישי):
            PermissionRule(role="soldier", action="xfer", resource_scope="operator"),
            # המפעיל מממן את החיילים (העברות-פנימיות):
            PermissionRule(role="operator", action="xfer", resource_scope="*"),
        ),
        budgets=tuple(
            BudgetRule(scope="actor", limit_units=BANK_LIMIT_MU, actor_id=s) for s in SOLDIERS
        ),
        require_citations=False,
    )


def load_events(window_s: int) -> list[dict]:
    """קריאת אירועי-פעולה מהחלון. קובץ-חסר = אין-הוכחות (לא-כשל — הצבא אולי רק-עלה)."""
    if not ACTIONS_FILE.exists():
        return []
    cutoff = (time.time() - window_s) * 1000
    events = []
    for line in ACTIONS_FILE.read_text(encoding="utf-8").splitlines():
        try:
            e = json.loads(line)
            if float(e.get("ts", 0)) >= cutoff:
                events.append(e)
        except json.JSONDecodeError:
            continue  # שורה-קרועה = לא-הוכחה
    return events


def rebuild_capture(events: list[dict]):
    """בניית capture נטיבי מהאירועים-שהוקלטו. ה-callable = חזרה-של-התוצאה-שהוקלטה
    (טהור-בניית-רשומה; אפס-ביצוע-מחדש-של-מסחר — המבקר פסיבי לחלוטין)."""
    recorder = TraceRecorder("saos", "soldier-army")

    def replay(recorded):
        return recorded  # מחזיר את התוצאה-שנצפתה — לא-מבצע-כלום

    for e in events:
        outcome = {"outcome": e.get("outcome", "ok"), "detail": e.get("detail", "")}
        recorder.invoke(
            replay,
            outcome,
            actor_id=str(e.get("actor", "unknown")),
            action=str(e.get("action", "unknown")),
            resource=str(e.get("resource", "unknown")),
            arguments={"args": e.get("args", {}), "ts": e.get("ts")},
            cost_units=int(e.get("cost_units", 0) or 0),
        )
    return recorder.seal()


def main() -> int:
    window_s = int(sys.argv[1]) if len(sys.argv) > 1 else 24 * 3600  # ברירת-מחדל: 24 שעות
    policy = build_policy()
    events = load_events(window_s)

    if not events:
        result = {
            "at": time.strftime("%FT%TZ", time.gmtime()),
            "window_s": window_s,
            "events": 0,
            "decision": "NO-EVENTS",
            "note": "אין-אירועים-בחלון (צבא-עלה-חדש או-חלון-ריק) — כנה, לא-ירוק-מזויף",
        }
        OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
        OUT_JSON.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False))
        return 0

    capture = rebuild_capture(events)
    bundle = create_audit_bundle(capture, policy)
    report = bundle.report

    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    evidence_dir = EVIDENCE_ROOT / stamp
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

    result = {
        "at": time.strftime("%FT%TZ", time.gmtime()),
        "window_s": window_s,
        "events": len(events),
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
