import { PrismaClient } from '@prisma/client'

/* ═══ db.ts · לקוח-Prisma-שמרפא-את-עצמו (גל-82 · שורש "Engine is not yet connected") ═══
 * שורש-הכשל-הנמדד: אטימת-כספת מקפיאה next-server (SIGSTOP · חוק-משמורת-מדינה) — ובריכת-החיבורים
 * של-Prisma מתה-בין-ההקפאות; ה-client-השבור-נשמר-ב-globalThis-ואף-צרכן-לא-מתאושש.
 * התיקון: proxy-שמנתב-ללקוח-החי-הנוכחי + מרפא-ומנסה-פעם-אחת-שוב על-שגיאות-חיבור-קטלניות.
 * גל-82-b: ה-proxy-הראשון-עטף-רק-פונקציות-עליונות — delegates-של-מודלים (db.x.findMany)
 * עקפו-אותו-לגמרי (נמדד: /api/fleet/state-500-למרות-הריפוי). מעכשיו-גם-מתודות-המודל-עטופות.
 * כנות: כל-ריפוי-נרשם — לא-נחבא. */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function freshClient(): PrismaClient {
  return new PrismaClient({
    // אמת-בלבד: שגיאות-ואזהרות-נרשמות; ספאם-שאילתות-הוסר (הציף-את-הלוג
    // באלפי-שורות-לדקה מטיק-המנוע — לחץ-זיכרון-מדוד-שהוביל-ל-OOM)
    log: ['error', 'warn'],
  })
}

let current: PrismaClient = globalForPrisma.prisma ?? freshClient()
if (!globalForPrisma.prisma) globalForPrisma.prisma = current

const FATAL_DB = /not yet connected|Engine is not yet|SQLITE_BUSY|SQLITE_READONLY|readonly|read-only|locked/i

// גל-80-fix-b: תת-מחלקה-Promise-אמיתית-עם-brand-PrismaPromise — $transaction מאמת
// Symbol.toStringTag==="PrismaPromise" על-כל-רכיב-מערך (library.js _transactionWithArray);
// Symbol.toStringTag על-Promise-רגיל read-only, ו-Object.create שובר-סלוטים-פנימיים
// (נמדד: "incompatible receiver"). מחלקה-אמיתית = then/catch/await חיים + brand תקין.
const BrandedPromise = class extends Promise<unknown> {}
Object.defineProperty(BrandedPromise.prototype, Symbol.toStringTag, {
  value: "PrismaPromise",
  configurable: true,
})

/** ריפוי-כנה: ניתוק-הלקוח-המת-והחלפתו-בחדש. כל-הקוראים-דרך-db-עוברים-אוטומטית-לחדש. */
export async function healDb(reason: string): Promise<void> {
  const old = current
  try { await old.$disconnect() } catch { /* כנה — גם-ניתוק-כושל-לא-חוסם-ריפוי */ }
  current = freshClient()
  globalForPrisma.prisma = current
  console.error(`[db] self-heal: stale pool replaced (${reason.slice(0, 120)})`)
}

function healAndRetry(path: string, args: unknown[], err: unknown): Promise<unknown> {
  const msg = err instanceof Error ? err.message : String(err)
  if (!FATAL_DB.test(msg)) throw err
  return healDb(msg).then(() => {
    const c2 = current as unknown as Record<string, unknown>
    // הליכה-עד-ההורה (ה-delegate) ואז-קריאה-למתודה-עליו — שמירה-על-this-נכון
    const segs = path.split('.')
    let parent: unknown = c2
    for (let i = 0; i < segs.length - 1; i++) {
      parent = (parent as Record<string, unknown>)[segs[i]]
    }
    const method = (parent as Record<string, unknown>)?.[segs[segs.length - 1]]
    if (typeof method !== 'function') throw err
    return (method as (...a: unknown[]) => unknown).apply(parent, args)
  })
}

/** עטיפת-מתודה: retry-once-כנה על-שגיאות-חיבור-קטלניות (path = "fleetAgent.findMany" וכד') */
function wrapMethod(path: string, fn: (...a: unknown[]) => unknown, args: unknown[]): unknown {
  const res = fn(...args)
  if (
    res &&
    typeof (res as Promise<unknown>).then === 'function' &&
    typeof (res as Promise<unknown>).catch === 'function'
  ) {
    const wrapped = BrandedPromise.resolve(res as Promise<unknown>).catch((err: unknown) => healAndRetry(path, args, err))
    return wrapped
  }
  return res
}

export const db = new Proxy({} as PrismaClient, {
  get(_t, prop) {
    const client = current as unknown as Record<string | symbol, unknown>
    const v = client[prop]
    if (typeof v === 'function') {
      // גל-80-fix: מתודות-רמת-לקוח ($transaction · $queryRaw · $disconnect) חייבות-this-קשור —
      // נמדד: $transaction ללא-bind זורק TypeError "_tracingHelper" (route dex/transfer 500)
      return (...args: unknown[]) => wrapMethod(String(prop), (v as (...a: unknown[]) => unknown).bind(client), args)
    }
    if (v && typeof v === 'object') {
      // model delegate (fleetAgent · dexTrade · $transaction וכד') — עוטפים-גם-את-מתודותיו
      return new Proxy(v, {
        get(_t2, method) {
          const mv = (v as Record<string | symbol, unknown>)[method]
          if (typeof mv !== 'function') return mv
          const path = `${String(prop)}.${String(method)}`
          const bound = (mv as (...a: unknown[]) => unknown).bind(v)
          return (...args: unknown[]) => wrapMethod(path, bound, args)
        },
      })
    }
    return v
  },
})
