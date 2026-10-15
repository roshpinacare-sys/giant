import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // אמת-בלבד: שגיאות-ואזהרות-נרשמות; ספאם-שאילתות-הוסר (הציף-את-הלוג
    // באלפי-שורות-לדקה מטיק-המנוע — לחץ-זיכרון-מדוד-שהוביל-ל-OOM)
    log: ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db