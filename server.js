import express from "express";
import crypto from "crypto";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const PORT = process.env.PORT;

const ZADARMA_KEY = process.env.ZADARMA_API_KEY;
const ZADARMA_SECRET = process.env.ZADARMA_API_SECRET;

// 🔐 SIGNATURE FUNCTION (TO‘G‘RILANGAN)
function generateSignature(method, url, params) {
  // 1. Paramlarni sort qilish
  const sortedKeys = Object.keys(params).sort();

  const sortedParams = sortedKeys
    .map(key => `${key}=${params[key]}`)
    .join("&");

  // 2. MD5
  const md5 = crypto
    .createHash("md5")
    .update(sortedParams)
    .digest("hex");

  // 3. String
  const string = method + url + md5;

  // 4. HMAC SHA1
  const signature = crypto
    .createHmac("sha1", ZADARMA_SECRET)
    .update(string)
    .digest("base64");

  return signature;
}

// 📞 CALL ENDPOINT
app.post("/zadarma-call", async (req, res) => {
  try {
    const { from, to } = req.body;

    if (!from || !to) {
      return res.status(400).json({ error: "from va to kerak" });
    }

    const method = "POST";
    const url = "/v1/request/callback/";

    const params = {
      from,
      to,
    };

    const signature = generateSignature(method, url, params);

    const fullUrl = `https://api.zadarma.com${url}`;

    const response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        Authorization: `${ZADARMA_KEY}:${signature}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
    });

    const data = await response.json();

    console.log("Zadarma response:", data);

    return res.json(data);
  } catch (err) {
    console.error("SERVER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🚀 SERVER START
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
  console.log("KEY BORMI:", !!ZADARMA_KEY);
  console.log("SECRET BORMI:", !!ZADARMA_SECRET);
});
