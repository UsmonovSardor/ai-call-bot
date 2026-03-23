import express from "express";
import crypto from "crypto";
import axios from "axios";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const ZADARMA_KEY = process.env.ZADARMA_API_KEY?.trim();
const ZADARMA_SECRET = process.env.ZADARMA_API_SECRET?.trim();

function buildParamsString(params = {}) {
  return Object.keys(params)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join("&");
}

function generateSignature(requestLine, params = {}) {
  const paramsStr = buildParamsString(params);
  const md5 = crypto.createHash("md5").update(paramsStr).digest("hex");

  const signString = requestLine + paramsStr + md5;

  // PHP hash_hmac default = hex string
  const hmacHex = crypto
    .createHmac("sha1", ZADARMA_SECRET)
    .update(signString)
    .digest("hex");

  // PHP base64_encode(hash_hmac(...)) ga mos
  return Buffer.from(hmacHex, "utf8").toString("base64");
}

app.get("/", (req, res) => {
  res.json({ ok: true });
});

app.get("/zadarma-test", async (req, res) => {
  try {
    const requestLine = "/v1/info/balance/";
    const params = {};

    const signature = generateSignature(requestLine, params);
    const auth = `${ZADARMA_KEY}:${signature}`;

    const response = await axios.get(`https://api.zadarma.com${requestLine}`, {
      headers: {
        Authorization: auth,
      },
    });

    res.json(response.data);
  } catch (err) {
    res
      .status(err.response?.status || 500)
      .json(err.response?.data || { error: err.message });
  }
});

app.post("/zadarma-call", async (req, res) => {
  try {
    const requestLine = "/v1/request/callback/";
    const params = {
      from: String(req.body.from || "").trim(),
      to: String(req.body.to || "").trim().replace(/^\+/, ""),
    };

    if (!params.from || !params.to) {
      return res.status(400).json({ error: "from va to kerak" });
    }

    const signature = generateSignature(requestLine, params);
    const auth = `${ZADARMA_KEY}:${signature}`;

    const response = await axios.get(`https://api.zadarma.com${requestLine}`, {
      params,
      headers: {
        Authorization: auth,
      },
    });

    res.json(response.data);
  } catch (err) {
    res
      .status(err.response?.status || 500)
      .json(err.response?.data || { error: err.message });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
