import express from "express";
import crypto from "crypto";
import axios from "axios";
import OpenAI from "openai";

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 8080;
const ZADARMA_KEY = process.env.ZADARMA_API_KEY?.trim();
const ZADARMA_SECRET = process.env.ZADARMA_API_SECRET?.trim();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

function buildParamsString(params = {}) {
  return Object.keys(params)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join("&");
}

function generateSignature(requestLine, params = {}) {
  if (!ZADARMA_SECRET) {
    throw new Error("ZADARMA_API_SECRET topilmadi");
  }
  const paramsStr = buildParamsString(params);
  const md5 = crypto.createHash("md5").update(paramsStr).digest("hex");
  const signString = requestLine + paramsStr + md5;
  const hmacHex = crypto
    .createHmac("sha1", ZADARMA_SECRET)
    .update(signString)
    .digest("hex");
  return Buffer.from(hmacHex, "utf8").toString("base64");
}

function normalizePhone(value) {
  return String(value || "").trim().replace(/^\+/, "");
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "ai-call-bot",
    endpoints: [
      "GET /",
      "GET /health",
      "GET /zadarma-test",
      "POST /zadarma-call",
      "POST /ai",
    ],
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    zadarmaConfigured: Boolean(ZADARMA_KEY && ZADARMA_SECRET),
    openaiConfigured: Boolean(OPENAI_API_KEY),
  });
});

app.get("/zadarma-test", async (req, res) => {
  try {
    if (!ZADARMA_KEY || !ZADARMA_SECRET) {
      return res.status(500).json({ error: "ZADARMA API key yoki secret yoq" });
    }
    const requestLine = "/v1/info/balance/";
    const params = {};
    const signature = generateSignature(requestLine, params);
    const auth = `${ZADARMA_KEY}:${signature}`;
    const response = await axios.get(`https://api.zadarma.com${requestLine}`, {
      headers: {
        Authorization: auth,
      },
      timeout: 15000,
    });
    console.log("BALANCE RESPONSE:", response.data);
    res.json(response.data);
  } catch (err) {
    console.error("TEST ERROR:", err.response?.data || err.message);
    res
      .status(err.response?.status || 500)
      .json(err.response?.data || { error: err.message });
  }
});

app.post("/zadarma-call", async (req, res) => {
  try {
    console.log("BODY:", req.body);
    if (!ZADARMA_KEY || !ZADARMA_SECRET) {
      return res.status(500).json({ error: "ZADARMA API key yoki secret yoq" });
    }
    const requestLine = "/v1/request/callback/";
    const params = {
      from: normalizePhone(req.body.from),
      to: normalizePhone(req.body.to),
    };
    console.log("NORMALIZED PARAMS:", params);
    if (!params.from || !params.to) {
      return res.status(400).json({
        error: "from va to kerak",
        received: req.body,
      });
    }
    const signature = generateSignature(requestLine, params);
    const auth = `${ZADARMA_KEY}:${signature}`;
    console.log("REQUEST LINE:", requestLine);
    console.log("PARAMS STRING:", buildParamsString(params));
    const response = await axios.get(`https://api.zadarma.com${requestLine}`, {
      params,
      headers: {
        Authorization: auth,
      },
      timeout: 20000,
    });
    console.log("ZADARMA RESPONSE:", response.data);
    res.json({
      ok: true,
      provider: "zadarma",
      ...response.data,
    });
  } catch (err) {
    console.error("ZADARMA ERROR:", err.response?.data || err.message);
    res
      .status(err.response?.status || 500)
      .json(err.response?.data || { error: err.message });
  }
});

/**
 * POST /ai
 * body:
 * {
 *   "text": "Salom, men broker bilan gaplashmoqchiman",
 *   "systemPrompt": "optional"
 * }
 */
app.post("/ai", async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY yoq" });
    }
    const userText = String(req.body.text || "").trim();
    const systemPrompt =
      String(req.body.systemPrompt || "").trim() ||
      "You are a phone call assistant. Reply briefly, naturally, and clearly. Keep answers short enough for voice calls.";
    if (!userText) {
      return res.status(400).json({ error: "text kerak" });
    }
    const response = await openai.responses.create({
      model: "gpt-5.4-mini",
      input: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userText,
        },
      ],
    });
    const reply =
      response.output_text ||
      "Kechirasiz, hozir javob tayyor bo'lmadi. Iltimos, qayta urinib ko'ring.";
    console.log("AI INPUT:", userText);
    console.log("AI REPLY:", reply);
    res.json({
      ok: true,
      reply,
      model: response.model,
    });
  } catch (err) {
    console.error("OPENAI ERROR:", err);
    res.status(500).json({
      error: err?.message || "OpenAI xatosi",
    });
  }
});

/**
 * BONUS:
 * bitta endpointda AI javob qaytaradi va xohlasang keyin n8n bilan ulaysan
 * POST /ai-call-preview
 * body:
 * {
 *   "customerText": "Salom",
 *   "from": "99890....",
 *   "to": "99891...."
 * }
 */
app.post("/ai-call-preview", async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY yoq" });
    }
    const customerText = String(req.body.customerText || "").trim();
    const from = normalizePhone(req.body.from);
    const to = normalizePhone(req.body.to);
    if (!customerText) {
      return res.status(400).json({ error: "customerText kerak" });
    }
    const response = await openai.responses.create({
      model: "gpt-5.4-mini",
      input: [
        {
          role: "system",
          content:
            "You are an Uzbek phone call assistant. Reply in Uzbek, short, polite, and natural. Keep it suitable for speaking aloud.",
        },
        {
          role: "user",
          content: customerText,
        },
      ],
    });
    const reply =
      response.output_text ||
      "Kechirasiz, hozir javob bera olmayapman. Iltimos, keyinroq urinib ko'ring.";
    res.json({
      ok: true,
      from,
      to,
      customerText,
      aiReply: reply,
    });
  } catch (err) {
    console.error("AI CALL PREVIEW ERROR:", err);
    res.status(500).json({
      error: err?.message || "AI call preview xatosi",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
