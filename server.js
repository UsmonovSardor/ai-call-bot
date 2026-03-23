import express from "express";
import crypto from "crypto";
import fetch from "node-fetch";

const app = express();

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

app.get("/", (req, res) => {
  res.json({ ok: true });
});

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

    const text = await response.text();
    console.log("BALANCE STATUS:", response.status);
    console.log("BALANCE RAW:", text);

    try {
      return res.status(response.status).json(JSON.parse(text));
    } catch {
      return res.status(response.status).send(text);
    }
  } catch (err) {
    console.error("TEST ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
  console.log("KEY BORMI:", !!ZADARMA_KEY);
  console.log("SECRET BORMI:", !!ZADARMA_SECRET);
});
