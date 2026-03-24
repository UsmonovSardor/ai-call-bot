import express from "express";
import crypto from "crypto";
import axios from "axios";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true })); // Zadarma form-urlencoded yuboradi

const PORT = process.env.PORT || 8080;
const ZADARMA_KEY = process.env.ZADARMA_API_KEY?.trim();
const ZADARMA_SECRET = process.env.ZADARMA_API_SECRET?.trim();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
const BASE_URL = process.env.BASE_URL || "https://ai-call-bot-production-9dc3.up.railway.app";

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// =============================================
// Suhbat tarixi (call_id bo'yicha saqlash)
// =============================================
const conversations = new Map(); // call_id -> [{role, content}]

// TTS audio fayllarini xotirada saqlash
const audioCache = new Map(); // fileId -> Buffer

// =============================================
// Yordamchi funksiyalar
// =============================================

function buildParamsString(params = {}) {
  return Object.keys(params)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join("&");
}

function generateSignature(requestLine, params = {}) {
  if (!ZADARMA_SECRET) throw new Error("ZADARMA_API_SECRET topilmadi");
  const paramsStr = buildParamsString(params);
  const md5 = crypto.createHash("md5").update(paramsStr).digest("hex");
  const signString = requestLine + paramsStr + md5;
  const hmacHex = crypto.createHmac("sha1", ZADARMA_SECRET).update(signString).digest("hex");
  return Buffer.from(hmacHex, "utf8").toString("base64");
}

function normalizePhone(value) {
  return String(value || "").trim().replace(/^\+/, "");
}

// OpenAI TTS yordamida audio yaratish
async function generateTTS(text, voice = "nova") {
  try {
    console.log("TTS yaratilmoqda:", text.substring(0, 50));
    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: voice, // nova, alloy, echo, fable, onyx, shimmer
      input: text,
      response_format: "mp3",
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    const fileId = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    audioCache.set(fileId, buffer);

    // 10 daqiqadan keyin tozalash
    setTimeout(() => audioCache.delete(fileId), 10 * 60 * 1000);

    return `${BASE_URL}/audio/${fileId}`;
  } catch (err) {
    console.error("TTS xatosi:", err.message);
    throw err;
  }
}

// OpenAI Whisper yordamida ovozni matnga aylantirish
async function transcribeAudio(audioUrl) {
  try {
    console.log("Audio yuklanmoqda:", audioUrl);
    const audioResponse = await axios.get(audioUrl, {
      responseType: "arraybuffer",
      timeout: 30000,
    });
    const audioBuffer = Buffer.from(audioResponse.data);

    // Fayl nomi bilan yuborish (Whisper uchun)
    const { Readable } = await import("stream");
    const stream = new Readable();
    stream.push(audioBuffer);
    stream.push(null);
    stream.name = "audio.mp3";

    // FormData orqali yuborish
    const FormData = (await import("form-data")).default;
    const form = new FormData();
    form.append("file", audioBuffer, {
      filename: "audio.mp3",
      contentType: "audio/mpeg",
    });
    form.append("model", "whisper-1");
    form.append("language", "uz"); // O'zbek tili

    const whisperResponse = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        timeout: 30000,
      }
    );

    const text = whisperResponse.data?.text || "";
    console.log("Foydalanuvchi aytdi:", text);
    return text;
  } catch (err) {
    console.error("Whisper xatosi:", err.response?.data || err.message);
    return null;
  }
}

// GPT yordamida AI javob olish
async function getAIResponse(callId, userText) {
  // Suhbat tarixini olish (yoki yangi boshlash)
  if (!conversations.has(callId)) {
    conversations.set(callId, [
      {
        role: "system",
        content: `Siz telefon orqali yordam beradigan o'zbek tilidagi sun'iy intellekt yordamchisisiz.
- Faqat O'zbek tilida gapiring
- Qisqa va aniq javob bering (2-3 jumla)
- Tabiiy, og'zaki gapirishga mos uslubda yozing
- Har doim samimiy va xushmuomala bo'ling
- Telefon suhbatiga mos (uzoq tushuntirmalar kerak emas)`,
      },
    ]);
  }

  const history = conversations.get(callId);
  history.push({ role: "user", content: userText });

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: history,
    max_tokens: 200,
    temperature: 0.7,
  });

  const reply = response.choices[0]?.message?.content ||
    "Kechirasiz, tushunmadim. Qayta aytib bera olasizmi?";

  history.push({ role: "assistant", content: reply });
  console.log("AI javob:", reply);

  return reply;
}

// =============================================
// ASOSIY ENDPOINTLAR
// =============================================

// Audio fayllarni xizmat qilish
app.get("/audio/:fileId", (req, res) => {
  const buffer = audioCache.get(req.params.fileId);
  if (!buffer) {
    return res.status(404).json({ error: "Audio topilmadi yoki muddati o'tdi" });
  }
  res.set({
    "Content-Type": "audio/mpeg",
    "Content-Length": buffer.length,
    "Cache-Control": "no-cache",
  });
  res.send(buffer);
});

// =============================================
// ZADARMA IVR WEBHOOK - kiruvchi calllar
// =============================================
// Bu endpoint ni Zadarma dashboard'da webhook URL sifatida kiriting:
// https://ai-call-bot-production-9dc3.up.railway.app/zadarma-webhook
//
// Zadarma Dashboard -> PBX -> IVR -> Webhook -> URL

app.post("/zadarma-webhook", async (req, res) => {
  const body = req.body;
  const event = body.event || body.notification_type;
  const callId = body.call_id || body.pbx_call_id || "unknown";

  console.log("=== ZADARMA WEBHOOK ===");
  console.log("Event:", event);
  console.log("Body:", JSON.stringify(body, null, 2));

  try {
    // ---- CALL BOSHLANGANDA ----
    if (event === "NOTIFY_START" || event === "notify_start") {
      const callerNumber = body.caller_id || body.from || "noma'lum";
      console.log(`Kiruvchi call: ${callerNumber}`);

      // Yangi suhbat boshlash
      conversations.delete(callId);

      // Salomlashish audio yaratish
      const greeting = `Salom! Men sizga yordam beradigan sun'iy intellekt yordamchisiman. Savolingizni ayting, men eshitaman.`;
      const audioUrl = await generateTTS(greeting);

      // Zadarma'ga: audio o'ynating va foydalanuvchi ovozini yozib oling
      return res.json({
        voice_mail_url: audioUrl,
        record: 1,
      });
    }

    // ---- FOYDALANUVCHI GAPIRDI (IVR javobi) ----
    if (event === "NOTIFY_IVR" || event === "notify_ivr") {
      const recordingUrl = body.recording_url || body.record_url;

      if (!recordingUrl) {
        console.log("Recording URL yo'q, suhbat davom ettirilmoqda...");
        const promptAudio = await generateTTS("Sizni eshitmadim. Iltimos qayta ayting.");
        return res.json({
          voice_mail_url: promptAudio,
          record: 1,
        });
      }

      // 1. Ovozni matnga aylantirish (STT)
      const userText = await transcribeAudio(recordingUrl);

      if (!userText || userText.trim().length < 2) {
        const retryAudio = await generateTTS("Kechirasiz, tushunmadim. Qayta gapiring iltimos.");
        return res.json({
          voice_mail_url: retryAudio,
          record: 1,
        });
      }

      // 2. AI javob olish
      const aiReply = await getAIResponse(callId, userText);

      // 3. Javobni ovozga aylantirish (TTS)
      const responseAudio = await generateTTS(aiReply);

      // 4. Zadarma'ga: audio o'ynating va yana yozib oling (suhbat davom etadi)
      return res.json({
        voice_mail_url: responseAudio,
        record: 1,
      });
    }

    // ---- CALL TUGADI ----
    if (event === "NOTIFY_END" || event === "notify_end") {
      console.log(`Call tugadi: ${callId}`);
      // Suhbat tarixini tozalash
      setTimeout(() => conversations.delete(callId), 5000);
      return res.json({ ok: true });
    }

    // Boshqa eventlar
    console.log("Noma'lum event:", event);
    return res.json({ ok: true });

  } catch (err) {
    console.error("WEBHOOK XATOSI:", err);
    try {
      const errorAudio = await generateTTS("Kechirasiz, texnik muammo yuz berdi. Biroz kutib qayta urinib ko'ring.");
      return res.json({ voice_mail_url: errorAudio });
    } catch {
      return res.status(500).json({ error: err.message });
    }
  }
});

// =============================================
// BOSHQA ENDPOINTLAR (avvalgi funksionallik)
// =============================================

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "ai-call-bot",
    endpoints: [
      "GET /",
      "GET /health",
      "GET /zadarma-test",
      "POST /zadarma-call",
      "POST /zadarma-webhook  ← Zadarma IVR webhook (kiruvchi calllar)",
      "GET /audio/:fileId    ← TTS audio fayllari",
      "POST /ai",
    ],
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    zadarmaConfigured: Boolean(ZADARMA_KEY && ZADARMA_SECRET),
    openaiConfigured: Boolean(OPENAI_API_KEY),
    activeConversations: conversations.size,
    cachedAudioFiles: audioCache.size,
  });
});

app.get("/zadarma-test", async (req, res) => {
  try {
    if (!ZADARMA_KEY || !ZADARMA_SECRET) {
      return res.status(500).json({ error: "ZADARMA API key yoki secret yoq" });
    }
    const requestLine = "/v1/info/balance/";
    const signature = generateSignature(requestLine, {});
    const auth = `${ZADARMA_KEY}:${signature}`;
    const response = await axios.get(`https://api.zadarma.com${requestLine}`, {
      headers: { Authorization: auth },
      timeout: 15000,
    });
    res.json(response.data);
  } catch (err) {
    console.error("TEST ERROR:", err.response?.data || err.message);
    res.status(err.response?.status || 500).json(err.response?.data || { error: err.message });
  }
});

app.post("/zadarma-call", async (req, res) => {
  try {
    if (!ZADARMA_KEY || !ZADARMA_SECRET) {
      return res.status(500).json({ error: "ZADARMA API key yoki secret yoq" });
    }
    const requestLine = "/v1/request/callback/";
    const params = {
      from: normalizePhone(req.body.from),
      to: normalizePhone(req.body.to),
    };
    if (!params.from || !params.to) {
      return res.status(400).json({ error: "from va to kerak", received: req.body });
    }
    const signature = generateSignature(requestLine, params);
    const auth = `${ZADARMA_KEY}:${signature}`;
    const response = await axios.get(`https://api.zadarma.com${requestLine}`, {
      params,
      headers: { Authorization: auth },
      timeout: 20000,
    });
    res.json({ ok: true, provider: "zadarma", ...response.data });
  } catch (err) {
    console.error("ZADARMA ERROR:", err.response?.data || err.message);
    res.status(err.response?.status || 500).json(err.response?.data || { error: err.message });
  }
});

// AI text endpoint (n8n uchun)
app.post("/ai", async (req, res) => {
  try {
    if (!OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY yoq" });
    const userText = String(req.body.text || "").trim();
    const systemPrompt = String(req.body.systemPrompt || "").trim() ||
      "Siz o'zbek tilidagi yordamchi sun'iy intellektsiz. Qisqa va aniq javob bering.";
    if (!userText) return res.status(400).json({ error: "text kerak" });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
    });
    const reply = response.choices[0]?.message?.content || "Javob tayyorlanmadi.";
    res.json({ ok: true, reply, model: response.model });
  } catch (err) {
    console.error("OPENAI ERROR:", err);
    res.status(500).json({ error: err?.message || "OpenAI xatosi" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server port ${PORT} da ishlamoqda`);
  console.log(`🌐 BASE_URL: ${BASE_URL}`);
  console.log(`🔑 Zadarma: ${Boolean(ZADARMA_KEY && ZADARMA_SECRET) ? "✅ sozlangan" : "❌ sozlanmagan"}`);
  console.log(`🤖 OpenAI: ${Boolean(OPENAI_API_KEY) ? "✅ sozlangan" : "❌ sozlanmagan"}`);
});
