import express from "express";
import fetch from "node-fetch";
import crypto from "crypto";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post("/call", async (req, res) => {
  try {
    const message = req.body.message;

    if (!message) {
      return res.json({ error: "Message yo‘q" });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a friendly Uzbek AI sales operator. Always reply in Uzbek language."
          },
          {
            role: "user",
            content: message
          }
        ]
      })
    });

    const data = await response.json();
    const reply =
      data?.choices?.[0]?.message?.content || "Javob olishda xatolik";

    res.json({ reply });
  } catch (error) {
    console.error(error);
    res.json({ error: "Server xatoligi" });
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
    .digest();

  return Buffer.from(hmac).toString("base64");
}

app.post("/zadarma-call", async (req, res) => {
  try {
    const from = req.body.from;
    const to = req.body.to;

    if (!from || !to) {
      return res.status(400).json({ error: "from va to kerak" });
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
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Zadarma call xatoligi" });
  }
});

app.get("/", (req, res) => {
  res.send("AI operator ishlayapti 🚀");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
