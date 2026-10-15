#!/usr/bin/env bash
# boot/git-cred.sh — עוזר-אימות-גיט-ריבוני (גל-18 · "כל-הריפו-מחוברים")
# ═════════════════════════════════════════════════════════════════
# נמדד-חי: 4 ריפו-על-המכונה (lane/*) היו-מנותקים-מהענן-לגמרי —
# "could not read Username for 'https://github.com'" — אין-חיווט-אימות.
#
# הפתרון-הלגיטימי: עוזר-credential גלובלי-אחד שקורא-את-הפאט-מ-upload/pat.env
# בזמן-ריצה-בלבד. אפס-סודות: לא ב-.git/config של-אף-ריפו, לא ב-história, לא ב-argv.
# חיווט: git config --global credential.helper '!/home/z/my-project/boot/git-cred.sh'
exec 2>/dev/null
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
