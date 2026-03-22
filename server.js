import express from "express";

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("AI operator ishlayapti 🚀");
});

app.post("/call", (req, res) => {
  res.json({
    ok: true,
    message: "Call endpoint ishlayapti"
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
