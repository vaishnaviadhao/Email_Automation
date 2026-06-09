const express = require("express");
const path = require("path");
const multer = require("multer");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const storage = multer.diskStorage({
  destination: path.join(__dirname, "../../uploads"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || "";
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// POST /api/uploads/upload - upload any file, returns its URL
router.post("/upload", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const appUrl = process.env.APP_URL ?? "http://localhost:4000";
  const url = `${appUrl}/uploads/${req.file.filename}`;
  res.json({ url, filename: req.file.originalname });
});

module.exports = router;
