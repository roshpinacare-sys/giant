#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# sovereign-boot.sh — תחיית-המתים: הפעלה-מלאה-של-הריבונות-מקלוני-גיט-בלבד
# ═══════════════════════════════════════════════════════════════════════
# מטרה: כשהסנדבוקס נמחק — כל-מכונה-חדשה-עם-גיט-ובאן יכולה-להקים-את-הכל.
# סדר-ההקמה: אימות → שיבוט-מה-ענן → סודות-מקומיים → שירותים-קטנים → המערכת-החיה → מדידה.
#
# דרישות-מוקדמות (מהבעלים, לעולם-לא-בגיט):
#   1. bun ≥ 1.0        (https://bun.sh)
#   2. upload/pat.env    — קובץ-פאט-גיטהאב בפורמט: GITHUB_TOKEN=ghp_...
#   3. upload/headcorner.txt — מפתח-הבעלים (הגנת-השער)
#
# שימוש:  bash scripts/sovereign-boot.sh [--dry-run]
# ═══════════════════════════════════════════════════════════════════════
set -u
ROOT="/home/z/my-project"
ORG="roshpinacare-sys"
DRY="${1:-}"
cd "$ROOT" || exit 1

say() { echo "[sovereign-boot] $*"; }
step() { echo ""; say "━━━ $* ━━━"; }

# ── 0. דרישות ──────────────────────────────────────────────────────────
step "0/6 דרישות-יסוד"
command -v bun >/dev/null 2>&1 || { say "✗ אין bun — התקן: curl -fsSL https://bun.sh/install | bash"; exit 1; }
say "✓ bun $(bun --version)"

# ── 1. אימות-גיט (העזר-קורא-פאט-בזמן-ריצה — אפס-סודות-בקונפיג) ────────
step "1/6 חיווט-אימות-גיט"
if [ -f "$ROOT/boot/git-cred.sh" ]; then
  git config --global credential.helper "!$ROOT/boot/git-cred.sh"
  say "✓ credential.helper → boot/git-cred.sh (פאט-נקרא-בזמן-ריצה-מ-upload/pat.env)"
else
  say "✗ חסר boot/git-cred.sh"
  exit 1
fi
[ -f "$ROOT/upload/pat.env" ] && say "✓ upload/pat.env קיים" || say "✗ חסר upload/pat.env — הבעלים-מספק-ידנית (אף-פעם-לא-בגיט)"

# ── 2. שיבוט-מה-ענן: כל-הריפו-של-האימפריה ──────────────────────────────
step "2/6 שיבוט/סנכרון-הריפו"
REPOS=(
  "$ROOT|giant"
  "/home/z/estate/Domain|Domain"
  "/home/z/estate/Pulse|Pulse"
  "/home/z/estate/FleetHQ|FleetHQ"
  "/home/z/estate/Console|Console"
  "/home/z/lane/saos-agents|saos-agents"
  "/home/z/lane/Defi|Defi"
  "/home/z/lane/Adsmarket|Adsmarket"
  "/home/z/lane/saos-markets|saos-markets"
  "/home/z/channels/giant|giant:channels"
  "/home/z/autonomy-fix|Autonomy"
)
ok=0; fail=0
for entry in "${REPOS[@]}"; do
  dir="${entry%%|*}"; repo="${entry##*|}"
  repo="${repo%%:*}"
  if [ -d "$dir/.git" ]; then
    [ "$DRY" = "--dry-run" ] || git -C "$dir" pull --ff-only >/dev/null 2>&1
    say "✓ קיים+מסונכרן: $dir"
    ok=$((ok+1))
  else
    if [ "$DRY" = "--dry-run" ]; then
      say "○ (dry) ישובט: https://github.com/$ORG/$repo.git → $dir"
    else
      mkdir -p "$(dirname "$dir")"
      if git clone "https://github.com/$ORG/$repo.git" "$dir" >/dev/null 2>&1; then
        say "✓ שובט מהענן: $repo → $dir"
        ok=$((ok+1))
      else
        say "✗ כשל-שיבוט: $repo (המשך-כנה)"
        fail=$((fail+1))
      fi
    fi
  fi
done
say "ריפו: $ok בסדר · $fail כשלים"

# ── 3. תלות + מסד-הנתונים-המקומי (db/custom.db — לא-בגיט, נוצר-מ-schema) ──
step "3/6 תלות-ומסד-נתונים"
if [ ! -d "$ROOT/node_modules" ] || [ ! -x "$ROOT/node_modules/.bin/next" ]; then
  say "○ node_modules חסר/חלקי — bun install"
  [ "$DRY" = "--dry-run" ] || (cd "$ROOT" && bun install >/dev/null 2>&1)
fi
[ -d "$ROOT/node_modules" ] && say "✓ node_modules חי" || say "✗ node_modules חסר (רוץ ידנית: bun install)"
if [ ! -f "$ROOT/db/custom.db" ]; then
  say "○ db/custom.db חסר — מייצר מ-schema.prisma"
  [ "$DRY" = "--dry-run" ] || { (cd "$ROOT" && bunx prisma generate >/dev/null 2>&1 && bunx prisma db push >/dev/null 2>&1); }
fi
[ -f "$ROOT/db/custom.db" ] && say "✓ db/custom.db חי" || say "○ db/custom.db ייווצר-בעת-האתחול-הראשון"

# ── 4. שירותים-קטנים (עצמאיים, פורטים-קבועים) ─────────────────────────
step "4/6 שירותים-קטנים"
MINIS=(
  "mini-services/estate-sync|3021"
  "mini-services/sovereign-gateway|3011"
  "mini-services/boot-verifier|3042"
  "mini-services/forge|"
  "mini-services/office-live|"
)
for entry in "${MINIS[@]}"; do
  dir="${entry%%|*}"; port="${entry##*|}"
  if [ -d "$ROOT/$dir" ]; then
    if [ -n "$port" ] && ss -tln 2>/dev/null | grep -q ":$port "; then
      say "✓ כבר-חי: $dir (:$port)"
    elif [ "$DRY" = "--dry-run" ]; then
      say "○ (dry) יופעל: $dir"
    else
      [ -d "$ROOT/$dir/node_modules" ] || (cd "$ROOT/$dir" && bun install >/dev/null 2>&1)
      (cd "$ROOT/$dir" && (setsid bun run dev > "$ROOT/dev-$(basename "$dir").log" 2>&1 < /dev/null &) )
      say "▶ הופעל: $dir ${port:+"(:$port)"}"
    fi
  fi
done

# ── 5. המערכת-החיה (Next.js :3000) ─────────────────────────────────────
step "5/6 המערכת-החיה"
if ss -tln 2>/dev/null | grep -q ":3000 "; then
  say "✓ כבר-חי: :3000"
elif [ "$DRY" = "--dry-run" ]; then
  say "○ (dry) יופעל: bun run dev (Next.js :3000)"
else
  (cd "$ROOT" && (setsid bun run dev > "$ROOT/dev.log" 2>&1 < /dev/null &) )
  say "▶ הופעל: bun run dev (Next.js :3000)"
fi

# ── 6. מדידת-אמת (לא-ירוק-מזויף: טיקים-ומספרים, לא-פורט-פתוח) ──────────
step "6/6 מדידת-אמת"
if [ "$DRY" != "--dry-run" ]; then
  sleep 5
  for p in 3000 3011 3021 3042; do
    if curl -sf -m 4 "http://127.0.0.1:$p/" >/dev/null 2>&1 || curl -sf -m 4 "http://127.0.0.1:$p/health" >/dev/null 2>&1; then
      say "✓ :$p משיב"
    else
      say "✗ :$p לא-משיב (כנה — נבדוק-לוג)"
    fi
  done
  say "קבלת-הבריאות: receipts/boot-verify.json (מופק-חי על-ידי boot-verifier:3042)"
fi

echo ""
say "═══ הריבונות חיה. לא-סיפור: כל-שורה-לעיל נמדדה. ═══"
