#!/usr/bin/env python3
# de-schedule-workflows.py · גל-84 · מקור-אימיילי-הכשל-כל-10-דק': scheduled-workflows
# על ריפואים פרטיים שמכסת-הדקות שלהם נגמרה → כל ריצה נכשלת באתחול → אימייל.
# התיקון: המרת כל trigger-schedule ל-workflow_dispatch בלבד (ריצה ידנית אפשרית,
# ריצות-מתוזמנות שלא יכולות לרוץ — מפסיקות לצעוק). הקצב-החי נשאר מקומי (סבבי-אטימה).
import re, sys, subprocess, pathlib

REPOS = [
    "/home/z/estate/Sandbox",
    "/home/z/estate/roshpina",
    "/home/z/estate/saos-dex",
    "/home/z/lane/Adsmarket",
]

def transform(text: str):
    """מסיר schedule-מתוך בלוק on: ומבטיח workflow_dispatch. מחזיר (text, changed)."""
    lines = text.split("\n")
    out, i, changed, in_schedule, removed = [], 0, False, False, 0
    # מצא בלוק on: (עומק-שורש)
    on_idx = None
    depth_at_on = None
    for idx, ln in enumerate(lines):
        m = re.match(r"^on:\s*(#.*)?$", ln)
        if m:
            on_idx, depth_at_on = idx, 0
            break
    if on_idx is None:
        return text, False
    out = lines[: on_idx + 1]
    i = on_idx + 1
    has_dispatch = False
    schedule_removed = False
    while i < len(lines):
        ln = lines[i]
        # סוף-בלוק on: שורה-לא-מוכרת-בהזחה
        if ln.strip() and not ln.startswith(" ") and not ln.startswith("\t"):
            out.extend(lines[i:])
            break
        if re.match(r"^\s+schedule:\s*(#.*)?$", ln):
            schedule_removed = True
            in_schedule = True
            i += 1
            continue
        if in_schedule:
            # שורות-פנימיות של schedule (cron וכו') — מדלגים
            if re.match(r"^\s+(-\s*)?cron:", ln) or ln.strip().startswith("#"):
                removed += 1
                i += 1
                continue
            if ln.strip() == "":
                i += 1
                continue
            in_schedule = False  # צאצא-אחר של on:
        if re.match(r"^\s+workflow_dispatch:\s*(\{\})?\s*(#.*)?$", ln):
            has_dispatch = True
        out.append(ln)
        i += 1
    text2 = "\n".join(out)
    if not has_dispatch:
        # הוסף workflow_dispatch מתחת ל-on:
        text2 = re.sub(r"^on:\s*$", "on:\n  workflow_dispatch: {}", text2, count=1, flags=re.M)
        if not re.search(r"^on:\s*\n\s+workflow_dispatch:", text2, flags=re.M):
            text2 = text2.replace("on:\n  workflow_dispatch: {}", "on:\n  workflow_dispatch: {}", 1)
        changed = True
    if schedule_removed:
        changed = True
    return text2, changed

def main():
    for repo in REPOS:
        wdir = pathlib.Path(repo) / ".github" / "workflows"
        if not wdir.exists():
            print(f"{repo}: אין workflows"); continue
        n_changed = 0
        for f in sorted(wdir.glob("*.yml")):
            t = f.read_text()
            t2, ch = transform(t)
            if ch:
                f.write_text(t2)
                n_changed += 1
        print(f"{repo}: {n_changed} workflows de-scheduled")
        # קומיט ודחיפה
        r = subprocess.run(["git", "-C", repo, "add", "-A"], capture_output=True, text=True)
        r = subprocess.run(["git", "-C", repo, "status", "--porcelain"], capture_output=True, text=True)
        if not r.stdout.strip():
            print(f"{repo}: נקי (אין שינויים)"); continue
        subprocess.run(["git", "-C", repo, "commit", "-q", "-m",
            "de-schedule: כל-ה-triggers-המתוזמנים-הומרו-ל-workflow_dispatch — מכסת-דקות-פרטיים-נגמרה, "
            "כל-ריצה-מתוזמנת-נכשלת-באתחול-ומציקה-באימיילים. הקצב-החי-רץ-מקומית (סבבי-אטימה) · גל-84"], capture_output=True, text=True)
        p = subprocess.run(["git", "-C", repo, "push", "-q", "origin", "HEAD"], capture_output=True, text=True)
        ok = p.returncode == 0
        print(f"{repo}: push {'OK' if ok else 'FAIL ' + p.stderr[-120:]}")

if __name__ == "__main__":
    main()
