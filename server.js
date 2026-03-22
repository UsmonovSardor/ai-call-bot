import express from "express";
import fetch from "node-fetch";
import crypto from "crypto";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send("AI operator ishlayapti 🚀");
});

app.post("/call", async (req, res) => {
  try {
    const message = req.body.message;

    if (!message) {
      return res.status(400).json({ error: "Message yo'q" });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a friendly Uzbek AI sales operator. Always reply in Uzbek language. Keep answers short, natural, and human-like.",
          },
          {
            role: "user",
            content: message,
          },
        ],
      }),
    });

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content || "Javob olishda xatolik";

    return res.json({ reply });
  } catch (error) {
    console.error("CALL ERROR:", error);
    return res.status(500).json({ error: "Server xatoligi" });
  }
});

function buildZadarmaSignature(methodPath, params, secret) {
  const sortedKeys = Object.keys(params).sort();

  const queryString = sortedKeys
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join("&");

  const md5 = crypto.createHash("md5").update(queryString).digest("hex");

  const hmac = crypto
    .createHmac("sha1", secret)
    .update(methodPath + queryString + md5)
    .digest("base64");

  return hmac;
}

app.post("/zadarma-call", async (req, res) => {
  try {
    const from = req.body.from;
    const to = req.body.to;

    if (!from || !to) {
      return res.status(400).json({ error: "from va to kerak" });
    }

    if (!process.env.ZADARMA_API_KEY || !process.env.ZADARMA_API_SECRET) {
      return res.status(500).json({ error: "ZADARMA_API_KEY yoki ZADARMA_API_SECRET yo'q" });
    }

    const methodPath = "/v1/request/callback/";
    const params = { from, to };

    const signature = buildZadarmaSignature(
      methodPath,
      params,
      process.env.ZADARMA_API_SECRET
    );

    const authHeader = `${process.env.ZADARMA_API_KEY}:${signature}`;
    const body = new URLSearchParams(params).toString();

    const response = await fetch(`https://api.zadarma.com${methodPath}`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error("ZADARMA ERROR:", error);
    return res.status(500).json({ error: "Zadarma call xatoligi" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
