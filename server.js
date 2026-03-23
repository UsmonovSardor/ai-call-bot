const express = require("express");
const crypto = require("crypto");
const axios = require("axios");

const app = express();
app.use(express.json());

const ZADARMA_KEY = process.env.ZADARMA_API_KEY;
const ZADARMA_SECRET = process.env.ZADARMA_API_SECRET;

function generateSignature(method, url, params) {
  // 1. Sort params
  const sorted = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join("&");

  // 2. MD5
  const md5 = crypto.createHash("md5").update(sorted).digest("hex");

  // 3. String
  const string = method + url + sorted + md5;

  // 4. HMAC SHA1
  const signature = crypto
    .createHmac("sha1", ZADARMA_SECRET)
    .update(string)
    .digest("base64");

  return signature;
}

// TEST (BALANCE)
app.get("/zadarma-test", async (req, res) => {
  try {
    const method = "GET";
    const url = "/v1/info/balance/";
    const params = {};

    const signature = generateSignature(method, url, params);

    const auth = `${ZADARMA_KEY}:${signature}`;

    const response = await axios.get(
      `https://api.zadarma.com${url}`,
      {
        headers: {
          Authorization: auth,
        },
      }
    );

    res.json(response.data);
  } catch (err) {
    res.status(500).json(err.response?.data || err.message);
  }
});

// CALL
app.post("/zadarma-call", async (req, res) => {
  try {
    const method = "GET";
    const url = "/v1/request/callback/";

    const params = {
      from: req.body.from,
      to: req.body.to,
    };

    const signature = generateSignature(method, url, params);

    const auth = `${ZADARMA_KEY}:${signature}`;

    const response = await axios.get(
      `https://api.zadarma.com${url}`,
      {
        params,
        headers: {
          Authorization: auth,
        },
      }
    );

    res.json(response.data);
  } catch (err) {
    res.status(500).json(err.response?.data || err.message);
  }
});

app.listen(8080, () => {
  console.log("Server running on port 8080");
});
