import express from "express";
import crypto from "crypto";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const ZADARMA_KEY    = process.env.ZADARMA_API_KEY?.trim();
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

async function zadarmaRequest(path, params = {}, method = "GET") {
  const signature = makeSignature(path, params);
  const query = buildQuery(params);

  const url =
    method === "GET"
      ? `https://api.zadarma.com${path}${query ? "?" + query : ""}`
      : `https://api.zadarma.com${path}`;

  const options = {
    method,
    headers: {
      Authorization: `${ZADARMA_KEY}:${signature}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  };

  if (method === "POST" && query) {
    options.body = query;
  }

  const response = await fetch(url, options);
  const text = await response.text();

  try {
    return { status: response.status, data: JSON.parse(text) };
  } catch {
    return { status: response.status, data: text };
  }
}

app.get("/", (req, res) => {
  res.json({ ok: true });
});

app.get("/zadarma-test", async (req, res) => {
  try {
    const path = "/v1/info/balance/";
    const { status, data } = await zadarmaRequest(path);
    console.log("BALANCE STATUS:", status);
    console.log("BALANCE RAW:", JSON.stringify(data));
    return res.status(status).json(data);
  } catch (err) {
    console.error("TEST ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.post("/zadarma-call", async (req, res) => {
  try {
    const { from, to } = req.body;
    console.log(`Qo'ng'iroq boshlash: ${from} → ${to}`);
    if (!from || !to) {
      return res.status(400).json({
        error: "'from' va 'to' majburiy",
      });
    }
    const path = "/v1/request/callback/";
    const params = {
      from: String(from),
      to: String(to),
    };
    const { status, data } = await zadarmaRequest(path, params, "GET");
    console.log("Zadarma callback status:", status);
    console.log("Zadarma callback data:", JSON.stringify(data));
    return res.status(status).json(data);
  } catch (err) {
    console.error("ZADARMA-CALL ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
  console.log("KEY BORMI:", !!ZADARMA_KEY);
  console.log("SECRET BORMI:", !!ZADARMA_SECRET);
});
