#!/usr/bin/env bash
# boot/git-cred.sh — עוזר-אימות-גיט-ריבוני (גל-18 · "כל-הריפו-מחוברים")
# ═════════════════════════════════════════════════════════════════
# נמדד-חי: 4 ריפו-על-המכונה (lane/*) היו-מנותקים-מהענן-לגמרי —
# "could not read Username for 'https://github.com'" — אין-חיווט-אימות.
#
# הפתרון-הלגיטימי: עוזר-credential גלובלי-אחד שקורא-את-הפאט-מ-upload/-בזמן-ריצה-בלבד.
# אפס-סודות: לא ב-.git/config של-אף-ריפו, לא בהיסטוריה, לא ב-argv.
# חיווט: git config --global credential.helper '!/home/z/my-project/boot/git-cred.sh'
#
# גל-94 · תיקון-שורש-נמדד: pat.env פג-תוקף (14:00 → push-fail "could not read Username"
# על-כל-המאגרים). העוזר-החי-הוא /home/z/.git-cred-helper.sh (טוקן-טרי-קודם, pat.env-רק-כגיבוי).
# במקום-להילחם-על-מי-בעלים-של-config-הגלובלי (ה-keeper-מחויר-אותו-כל-דקה) — העוזר-הזה
# מפקיד-ראייה-לעוזר-החי. שני-הנתיבים-חיים, טוקן-אחד-טרי.
exec 2>/dev/null
if [ -x /home/z/.git-cred-helper.sh ]; then
  exec /home/z/.git-cred-helper.sh "$@"
fi
PAT_FILE="/home/z/my-project/upload/pat.env"
TOKEN="$(tr -d '[:space:]' < "$PAT_FILE" 2>/dev/null)"
[ -n "$TOKEN" ] || exit 0
case "$1" in
  get)
    echo "username=x-access-token"
    echo "password=$TOKEN"
    ;;
  *) ;; # store/erase — לא-שומרים-כלום-בדיסק
esac
exit 0
