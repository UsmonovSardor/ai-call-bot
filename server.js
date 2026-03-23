import express from "express";
import crypto from "crypto";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const PORT = process.env.PORT;
const ZADARMA_KEY = process.env.ZADARMA_API_KEY;
const ZADARMA_SECRET = process.env.ZADARMA_API_SECRET;

function buildSortedParams(params) {
  return Object.keys(params)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join("&");
}

function generateSignature(requestPath, params) {
  const paramsStr = buildSortedParams(params);
  const hashString = requestPath + paramsStr + crypto.createHash("md5").update(paramsStr).digest("hex");

  return crypto
    .createHmac("sha1", ZADARMA_SECRET)
    .update(hashString)
    .digest("base64");
}

app.post("/zadarma-call", async (req, res) => {
  try {
    let { from, to } = req.body;

    if (!from || !to) {
      return res.status(400).json({ error: "from va to kerak" });
    }

    from = String(from).trim();
    to = String(to).trim().replace(/^\+/, "");

    const requestPath = "/v1/request/callback/";
    const params = { from, to };
    const paramsStr = buildSortedParams(params);
    const signature = generateSignature(requestPath, params);

    const url = `https://api.zadarma.com${requestPath}?${paramsStr}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `${ZADARMA_KEY}:${signature}`,
      },
    });

    const data = await response.json();
    console.log("Zadarma response:", data);

    return res.status(response.ok ? 200 : response.status).json(data);
  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
  console.log("KEY BORMI:", !!ZADARMA_KEY);
  console.log("SECRET BORMI:", !!ZADARMA_SECRET);
});
