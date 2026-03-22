import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

/**
 * AI CHAT ENDPOINT
 */
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

    // xavfsiz olish
    const reply =
      data?.choices?.[0]?.message?.content || "Javob olishda xatolik";

    res.json({ reply });

  } catch (error) {
    console.error(error);
    res.json({ error: "Server xatoligi" });
  }
});

/**
 * TEST ENDPOINT
 */
app.get("/", (req, res) => {
  res.send("AI operator ishlayapti 🚀");
});

/**
 * SERVER START
 */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
