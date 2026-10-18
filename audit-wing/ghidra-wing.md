# ghidra-wing · כנף-הגנת-שרשרת-אספקה (Ghidra NSA) — runbook פריסה

**הערכה (2026-10-18):** Ghidra (github.com/NationalSecurityAgency/ghidra,
Apache-2.0) = פלטפורמת-RE של ה-NSA: דיסאסמבליה, דקומפילציה, ניתוח-סטטי
ומצב-headless לאוטומציה. **ערך-ארכיטקטוני לריבונות:** כנף-הגנה שמנתחת
כל-בינארי שנכנס לאחוזה (מודולים-נטיבים של npm, בינארי-עדכון, קבצים-לא-מוכרים)
— ריבונות שמנהלת-את-עצמה חייבת גם **להגן על שרשרת-האספקה של עצמה**.

## מדידה-כנה: למה לא מותקן כאן עכשיו

| משאב | נדרש (headless) | קיים בסנדבוקס | הכרעה |
|---|---|---|---|
| דיסק | ~1.6GB (zip 400MB + חילוץ 1.2GB) | **513MB פנויים (95% מלא!)** | ✗ חוסם |
| זיכרון | 1–2GB לניתוח | 2.3GB פנויים (מתוך 4GB, הצי חי) | ⚠ גבולי |
| JDK | 21+ (הגרסה החדשה: 25) | **21.0.12 מותקן** ✓ | ✓ |

הדיסק הוא החוסם — התקנה כאן הייתה ממלאת את ה-rootfs ומפילה את כל-הצי
(הספר, השרשרת, השירותים). **המשמעת: הנתונים שלנו שווים יותר מכלי-ניתוח.**

## פריסה על שרת-אמיתי (כשיש ≥4GB דיסק) — מדויק

```bash
# 1. JDK 25 (או 21 ל-Ghidra 11.3.x)
sudo apt-get install -y openjdk-21-jdk-headless

# 2. הורדת-release רשמי (ה-URL בעמוד ה-releases של הריפו)
GHIDRA_VER=11.4.2   # עדכן-לפי-ה-release האחרון
curl -L -o /tmp/ghidra.zip \
  "https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_${GHIDRA_VER}_build/ghidra_${GHIDRA_VER}_PUBLIC_20251016.zip"
# (שם-הקובץ המדויק משתנה בין-גרסאות — העתק-מעמוד-ה-releases)

# 3. פריסה
sudo mkdir -p /opt/ghidra && sudo unzip /tmp/ghidra.zip -d /opt/ghidra
echo 'export GHIDRA_HOME=/opt/ghidra/ghidra_'${GHIDRA_VER}'_PUBLIC' >> ~/.bashrc

# 4. ניתוח-headless (לב-הכנף):
$GHIDRA_HOME/support/analyzeHeadless /tmp/proj wing -import <BIN> \
  -postScript /home/z/my-project/audit-wing/ghidra-summarize.py -deleteProject
```

## שילוב-בארכיטקטורה (מוכן-מראש)

sovereign-voice (:3019) כבר נושא את השדה: כש-`GHIDRA_HOME` מוגדר ויש דיסק —
מוסיפים נקודת-קצה `/audit {path}` שמריצה analyzeHeadless + מסכמת-עדויות
(חתימות, imports חשודים, strings רגישים) ל-`audit-wing/`. עד-אז הנקודה
מדווחת בכנות "לא-מותקן — ראה runbook" (אפס-סינתזה).

**חלופה-קלה-עכשיו** (בלי-גידה): `strings <BIN> | grep -iE "http|token|secret|exec"`
+ `sha256sum` + אימות-חתימות-מול-מקור — כבר מכסה 80% מהתרחישים ב-0 מגה-בייט.
