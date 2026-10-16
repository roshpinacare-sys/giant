import { PrismaClient } from '@prisma/client'

/* ═══ db.ts · לקוח-Prisma-שמרפא-את-עצמו (גל-82 · שורש "Engine is not yet connected") ═══
 * שורש-הכשל-הנמדד: אטימת-כספת מקפיאה next-server (SIGSTOP · חוק-משמורת-מדינה) — ובריכת-החיבורים
 * של-Prisma מתה-בין-ההקפאות; ה-client-השבור-נשמר-ב-globalThis-ואף-צרכן-לא-מתאושש.
 * התיקון: proxy-שמנתב-ללקוח-החי-הנוכחי + מרפא-ומנסה-פעם-אחת-שוב על-שגיאות-חיבור-קטלניות.
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

/** ריפוי-כנה: ניתוק-הלקוח-המת-והחלפתו-בחדש. כל-הקוראים-דרך-db-עוברים-אוטומטית-לחדש. */
export async function healDb(reason: string): Promise<void> {
  const old = current
  try { await old.$disconnect() } catch { /* כנה — גם-ניתוק-כושל-לא-חוסם-ריפוי */ }
  current = freshClient()
  globalForPrisma.prisma = current
  console.error(`[db] self-heal: stale pool replaced (${reason.slice(0, 120)})`)
}

export const db = new Proxy({} as PrismaClient, {
  get(_t, prop) {
    const client = current as unknown as Record<string | symbol, unknown>
    const v = client[prop]
    if (typeof v !== 'function') return v
    return (...args: unknown[]) => {
      const res = (v as (...a: unknown[]) => unknown).apply(client, args)
      // retry-once-כנה: רק-על-שגיאות-חיבור-קטלניות — שאר-השגיאות-נשרקות-כמו-שהן
      if (
        res &&
        typeof (res as Promise<unknown>).then === 'function' &&
        typeof (res as Promise<unknown>).catch === 'function'
      ) {
        return (res as Promise<unknown>).catch(async (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err)
          if (FATAL_DB.test(msg)) {
            await healDb(msg)
            const c2 = current as unknown as Record<string | symbol, unknown>
            return (c2[prop] as (...a: unknown[]) => unknown).apply(c2, args)
          }
          throw err
        })
      }
      return res
    }
  },
})
