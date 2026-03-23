import express from "express";
import crypto from "crypto";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const PORT = process.env.PORT;
const ZADARMA_KEY = process.env.ZADARMA_API_KEY?.trim();
const ZADARMA_SECRET = process.env.ZADARMA_API_SECRET?.trim();

function buildQuery(params = {}) {
  return Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}

function makeSignature(path, params = {}) {
  const query = buildQuery(params);
  const md5 = crypto.createHash("md5").update(query).digest("hex");
  const signString = path + query + md5;

  return crypto
    .createHmac("sha1", ZADARMA_SECRET)
    .update(signString)
    .digest("base64");
}

// Auth test
app.get("/zadarma-test", async (req, res) => {
  try {
    const path = "/v1/info/balance/";
    const signature = makeSignature(path, {});

    const response = await fetch(`https://api.zadarma.com${path}`, {
      method: "GET",
      headers: {
        Authorization: `${ZADARMA_KEY}:${signature}`,
      },
    });

    const data = await response.json();
    console.log("TEST RESPONSE:", data);
    return res.status(response.status).json(data);
  } catch (err) {
    console.error("TEST ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

// Callback
app.post("/zadarma-call", async (req, res) => {
  try {
    let { from, to } = req.body;

    if (!from || !to) {
      return res.status(400).json({ error: "from va to kerak" });
    }

    from = String(from).trim();
    to = String(to).trim().replace(/^\+/, "");

    const path = "/v1/request/callback/";
    const params = { from, to };
    const query = buildQuery(params);
    const signature = makeSignature(path, params);

    const response = await fetch(`https://api.zadarma.com${path}?${query}`, {
      method: "GET",
      headers: {
        Authorization: `${ZADARMA_KEY}:${signature}`,
      },
    });

    const data = await response.json();
    console.log("CALL RESPONSE:", data);
    return res.status(response.status).json(data);
  } catch (err) {
    console.error("CALL ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
  console.log("KEY BORMI:", !!ZADARMA_KEY);
  console.log("SECRET BORMI:", !!ZADARMA_SECRET);
});
