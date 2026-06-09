require("dotenv/config");
const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/auth");
const campaignRoutes = require("./routes/campaigns");
const contactRoutes = require("./routes/contacts");
const segmentRoutes = require("./routes/segments");
const validateRoutes = require("./routes/validate");
const statsRoutes = require("./routes/stats");
const settingsRoutes = require("./routes/settings");
const workflowRoutes = require("./routes/workflows");
const trackRoutes = require("./routes/track");
const unsubscribeRoutes = require("./routes/unsubscribe");
const webhookRoutes = require("./routes/webhooks");
const cronRoutes = require("./routes/cron");
const pixelRoutes = require("./routes/pixels");
const gmailRoutes = require("./routes/gmail");
const zohoRoutes = require("./routes/zoho");
const uploadRoutes = require("./routes/uploads");

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(cors({ origin: process.env.FRONTEND_URL ?? "http://localhost:3000", credentials: true }));
app.use(express.json({ limit: "10mb" }));

// Serve uploaded images as static files
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/segments", segmentRoutes);
app.use("/api/validate", validateRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/workflows", workflowRoutes);
app.use("/api/track", trackRoutes);
app.use("/api/unsubscribe", unsubscribeRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/cron", cronRoutes);
app.use("/api/pixels", pixelRoutes);
app.use("/api/gmail", gmailRoutes);
app.use("/api/zoho", zohoRoutes);
app.use("/api/uploads", uploadRoutes);

// Health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Scheduler
function startScheduler() {
  if (process.env.NODE_ENV !== "production" && process.env.ENABLE_SCHEDULER !== "true") return;
  // Always use localhost for internal scheduler calls, not the public APP_URL
  const appUrl = `http://localhost:${PORT}`;
  const secret = process.env.CRON_SECRET ?? "";
  console.log("[scheduler] Startingchecking for scheduled campaigns every 60s");
  setInterval(async () => {
    try {
      const res = await fetch(`${appUrl}/api/cron/send-scheduled`, {
        method: "POST",
        headers: { "x-cron-secret": secret },
      });
      const data = await res.json();
      if (data.processed > 0) console.log(`[scheduler] Processed ${data.processed} campaign(s)`);
    } catch (err) {
      console.error("[scheduler] Error:", err);
    }
  }, 60_000);
}

app.listen(PORT, () => {
  console.log(`[reachx-backend] Running on http://localhost:${PORT}`);
  startScheduler();
});
