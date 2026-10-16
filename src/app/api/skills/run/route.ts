// POST /api/skills/run · הרצת-יכולת-אמת — כל-יכולת-היא-SDK-רץ-בשרת-בלבד (z-ai-web-dev-sdk).
// חוקי-האמת: אפס-סימולציה · שער-headcorner · כל-הרצה-נרשמת-ב-SkillRun-כולל-כישלון-כנה.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isOwnerReq } from "@/lib/sovereign-auth";
import { IMAGE_SIZES, TTS_VOICES, skillById, snippet } from "@/lib/skills-catalog";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

let zaiCache: Awaited<ReturnType<typeof import("z-ai-web-dev-sdk").default.create>> | null = null;
async function zai() {
  if (!zaiCache) {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    zaiCache = await ZAI.create();
  }
  return zaiCache;
}

function str(v: unknown, max = 4000): string {
  return typeof v === "string" ? v.slice(0, max).trim() : "";
}

export async function POST(req: Request) {
  if (!(await isOwnerReq(req))) {
    return NextResponse.json(
      { error: "הרצת-יכולות-דורשת-אימות-headcorner", authRequired: true },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "גוף-בקשה-לא-תקין" }, { status: 400 });
  }

  const skillId = str(body.skill, 40);
  const meta = skillById(skillId);
  if (!meta) {
    return NextResponse.json({ error: `יכולת-לא-מוכרת: ${skillId || "—"}` }, { status: 400 });
  }

  const t0 = Date.now();
  const run = await db.skillRun.create({
    data: { skill: meta.id, status: "RUNNING", input: "", durationMs: 0 },
  });

  try {
    const result = await execute(meta.id, body);
    const durationMs = Date.now() - t0;
    await db.skillRun.update({
      where: { id: run.id },
      data: {
        status: "OK",
        input: result.ledgerInput,
        output: result.ledgerOutput,
        durationMs,
      },
    });
    return NextResponse.json({
      ok: true,
      runId: run.id,
      skill: meta.id,
      durationMs,
      result: result.client,
    });
  } catch (e) {
    const durationMs = Date.now() - t0;
    const msg = e instanceof Error ? e.message : "שגיאת-הרצה";
    await db.skillRun.update({
      where: { id: run.id },
      data: { status: "ERROR", input: snippet(JSON.stringify(body)), error: snippet(msg, 300), durationMs },
    });
    return NextResponse.json({ error: msg, runId: run.id, durationMs }, { status: 502 });
  }
}

/* ================= הרצות-האמת-לפי-יכולת ================= */

interface Exec {
  client: Record<string, unknown>; // למסך (כולל-מדיה-כ-dataURL)
  ledgerInput: string; // תמצית-לרישום
  ledgerOutput: string; // תמצית-לרישום
}

async function execute(skill: string, body: Record<string, unknown>): Promise<Exec> {
  switch (skill) {
    case "llm": {
      const prompt = str(body.prompt, 6000);
      if (!prompt) throw new Error("חסר-פרומפט");
      const system = str(body.system, 2000) || "אתה-עוזר-מדויק-וכן. ענה-בעברית-ברורה-ובלי-קישוט.";
      const z = await zai();
      const completion = await z.chat.completions.create({
        messages: [
          { role: "assistant", content: system },
          { role: "user", content: prompt },
        ],
        thinking: { type: "disabled" },
      });
      const content = completion.choices[0]?.message?.content ?? "";
      if (!content.trim()) throw new Error("תשובה-ריקה-מהמודל");
      return {
        client: { text: content },
        ledgerInput: snippet(`${system} ‖ ${prompt}`),
        ledgerOutput: snippet(content, 400),
      };
    }

    case "vision": {
      const imageUrl = str(body.imageUrl, 300000);
      const prompt = str(body.prompt, 4000) || "תאר-במדויק-את-התמונה.";
      if (!imageUrl) throw new Error("חסרה-כתובת-תמונה-או-העלאה");
      const z = await zai();
      const res = await z.chat.completions.createVision({
        model: "glm-4.5v", // מודל-הראייה-האמת (דרוש-בחוזה-ה-SDK)
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        thinking: { type: "disabled" },
      });
      const content = res.choices[0]?.message?.content ?? "";
      if (!content.trim()) throw new Error("תשובה-ריקה-מהמודל");
      return {
        client: { text: content, imageUrl: imageUrl.startsWith("data:") ? imageUrl : null },
        ledgerInput: snippet(`${prompt} ‖ ${imageUrl.startsWith("data:") ? "[העלאה-base64]" : imageUrl}`),
        ledgerOutput: snippet(content, 400),
      };
    }

    case "video": {
      const videoUrl = str(body.videoUrl, 4000);
      const prompt = str(body.prompt, 4000) || "תמצת-את-מה-שקורה-בוידאו.";
      if (!videoUrl) throw new Error("חסרה-כתובת-וידאו");
      const z = await zai();
      const res = await z.chat.completions.createVision({
        model: "glm-4.5v", // מודל-הראייה-האמת (דרוש-בחוזה-ה-SDK)
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "video_url", video_url: { url: videoUrl } },
            ],
          },
        ],
        thinking: { type: "disabled" },
      });
      const content = res.choices[0]?.message?.content ?? "";
      if (!content.trim()) throw new Error("תשובה-ריקה-מהמודל");
      return {
        client: { text: content, videoUrl },
        ledgerInput: snippet(`${prompt} ‖ ${videoUrl}`),
        ledgerOutput: snippet(content, 400),
      };
    }

    case "tts": {
      const text = str(body.text, 1024);
      if (!text) throw new Error("חסר-טקסט-לדיבור");
      if (text.length > 1024) throw new Error("הטקסט-חורג-מ-1024-תווים");
      const voiceRaw = str(body.voice, 20);
      const voice = (TTS_VOICES as readonly string[]).includes(voiceRaw) ? voiceRaw : "tongtong";
      const speed = Math.min(2, Math.max(0.5, Number(body.speed) || 1));
      const z = await zai();
      const res = await z.audio.tts.create({
        input: text,
        voice,
        speed,
        response_format: "wav",
        stream: false,
      });
      const buf = Buffer.from(new Uint8Array(await res.arrayBuffer()));
      if (buf.length < 100) throw new Error("קול-ריק-מהשירות");
      return {
        client: { audioDataUrl: `data:audio/wav;base64,${buf.toString("base64")}`, bytes: buf.length, voice, speed },
        ledgerInput: snippet(text),
        ledgerOutput: `wav ${buf.length}B voice=${voice} speed=${speed}`,
      };
    }

    case "asr": {
      const audioBase64Raw = str(body.audioBase64, 12_000_000);
      if (!audioBase64Raw) throw new Error("חסר-קובץ-קול");
      const audioBase64 = audioBase64Raw.replace(/^data:[^,]*,/, "");
      const bytes = Math.floor((audioBase64.length * 3) / 4);
      if (bytes > 8_000_000) throw new Error("הקובץ-חורג-מ-8MB");
      const z = await zai();
      const res = await z.audio.asr.create({ file_base64: audioBase64 });
      const text = (res as { text?: string }).text ?? "";
      if (!text.trim()) throw new Error("לא-זוהה-דיבור-בקובץ");
      return {
        client: { text, bytes },
        ledgerInput: `[קול-${bytes}B]`,
        ledgerOutput: snippet(text, 400),
      };
    }

    case "image": {
      const prompt = str(body.prompt, 3000);
      if (!prompt) throw new Error("חסר-פרומפט");
      const sizeRaw = str(body.size, 12);
      const size: (typeof IMAGE_SIZES)[number] = (IMAGE_SIZES as readonly string[]).includes(sizeRaw)
        ? (sizeRaw as (typeof IMAGE_SIZES)[number])
        : "1024x1024";
      const z = await zai();
      const res = await z.images.generations.create({ prompt, size });
      const b64 = res.data?.[0]?.base64;
      if (!b64) throw new Error("לא-הוחזרה-תמונה");
      const bytes = Buffer.from(b64, "base64").length;
      return {
        client: { imageDataUrl: `data:image/png;base64,${b64}`, size, bytes },
        ledgerInput: snippet(prompt),
        ledgerOutput: `png ${size} ${bytes}B`,
      };
    }

    case "search": {
      const query = str(body.query, 500);
      if (!query) throw new Error("חסרה-שאילתה");
      const num = Math.min(10, Math.max(1, Math.floor(Number(body.num) || 5)));
      const z = await zai();
      const results = (await z.functions.invoke("web_search", { query, num })) as Array<{
        url: string;
        name: string;
        snippet: string;
        host_name: string;
        date: string;
        favicon: string;
      }>;
      if (!Array.isArray(results) || results.length === 0) throw new Error("לא-נמצאו-תוצאות");
      return {
        client: {
          results: results.map((r) => ({
            name: r.name,
            url: r.url,
            snippet: r.snippet,
            host: r.host_name,
            date: r.date,
            favicon: r.favicon,
          })),
        },
        ledgerInput: snippet(`${query} [num=${num}]`),
        ledgerOutput: `${results.length} תוצאות: ${snippet(results.map((r) => r.name).join(" · "), 350)}`,
      };
    }

    case "reader": {
      const url = str(body.url, 2000);
      if (!/^https?:\/\//.test(url)) throw new Error("חסרה-כתובת-תקינה (http/https)");
      const z = await zai();
      // SDK-עוטף: {code, data:{title, html}, meta, status} — התוכן-תחת-data
      const raw = (await z.functions.invoke("page_reader", { url })) as {
        data?: { title?: string; html?: string };
        title?: string;
        html?: string;
      };
      const payload = raw.data ?? raw;
      const pageTitle = payload.title ?? url;
      const text = (payload.html ?? "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 8000);
      if (!payload.title && !text) throw new Error("לא-חולץ-תוכן-מהדף");
      return {
        client: { title: pageTitle, text, chars: text.length },
        ledgerInput: snippet(url, 400),
        ledgerOutput: snippet(`${pageTitle} — ${text}`, 350),
      };
    }

    default:
      throw new Error(`יכולת-לא-ממומשת: ${skill}`);
  }
}
