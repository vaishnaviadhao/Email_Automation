const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { prisma } = require("../lib/prisma");
const { checkRateLimit } = require("../lib/rateLimit");
const { getAuthUrl, exchangeCodeForTokens } = require("../lib/gmail");
const { getAuthUrl: getZohoAuthUrl, exchangeCodeForTokens: exchangeZohoCodeForTokens } = require("../lib/zoho");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// GET /api/auth/google-url
router.get("/google-url", (req, res) => {
  const clientId = req.query.clientId || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = req.query.clientSecret || process.env.GOOGLE_CLIENT_SECRET;

  const state = Buffer.from(
    JSON.stringify({ flow: "login", clientId, clientSecret })
  ).toString("base64url");

  const url = getAuthUrl(clientId, clientSecret) + `&state=${state}`;
  res.json({ url });
});

router.get("/zoho-url", (req, res) => {
  const clientId = req.query.clientId || process.env.ZOHO_CLIENT_ID;
  const clientSecret = req.query.clientSecret || process.env.ZOHO_CLIENT_SECRET;

  const state = Buffer.from(
    JSON.stringify({ flow: "login", clientId, clientSecret })
  ).toString("base64url");

  const url = getZohoAuthUrl(clientId, clientSecret, process.env.ZOHO_LOGIN_REDIRECT_URI) + `&state=${state}`;
  res.json({ url });
});

// GET /api/auth/callback
router.get("/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query;
  
  console.log("[auth callback] Received:", { code: !!code, state: !!state, error, error_description });

  if (error) {
    console.error("[auth callback] Google error:", error, error_description);
    return res.redirect(`${process.env.FRONTEND_URL ?? "http://localhost:3000"}/login?error=${error}`);
  }

  if (!code || !state) {
    console.error("[auth callback] Missing code or state");
    return res.redirect(`${process.env.FRONTEND_URL ?? "http://localhost:3000"}/login?error=missing_params`);
  }

  try {
    console.log("[auth callback] Parsing state...");
    const stateObj = JSON.parse(Buffer.from(state, "base64url").toString());
    const { clientId, clientSecret } = stateObj;
    
    console.log("[auth callback] State parsed, exchanging code for tokens...");
    const { email, name, tokens } = await exchangeCodeForTokens(code, clientId, clientSecret);
    console.log("[auth callback] Got email:", email);

    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      console.log("[auth callback] Creating new user:", email);
      user = await prisma.user.create({ data: { email, name } });
    } else if (!user.name && name) {
      console.log("[auth callback] Updating missing user name for:", email);
      user = await prisma.user.update({ where: { id: user.id }, data: { name } });
    } else {
      console.log("[auth callback] Found existing user:", email);
    }

    await prisma.gmailAccount.upsert({
      where: { userId_email: { userId: user.id, email } },
      create: {
        userId: user.id,
        email,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token ?? null,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        clientId: clientId ?? null,
        clientSecret: clientSecret ?? null,
        isActive: true,
      },
      update: {
        refreshToken: tokens.refresh_token ?? undefined,
        accessToken: tokens.access_token ?? null,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        clientId: clientId ?? null,
        clientSecret: clientSecret ?? null,
        isActive: true,
      },
    });

    const tempToken = jwt.sign(
      { id: user.id, email: user.email, isTemp: true },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    const encodedUser = Buffer.from(JSON.stringify({ id: user.id, email: user.email, name: user.name })).toString("base64url");
    const redirectUrl = `${process.env.FRONTEND_URL ?? "http://localhost:3000"}/set-password?token=${encodeURIComponent(tempToken)}&user=${encodeURIComponent(encodedUser)}`;
    console.log("[auth callback] Redirecting to:", redirectUrl.split("?")[0]);
    return res.redirect(redirectUrl);
  } catch (err) {
    console.error("[auth callback] Error:", err?.message, err?.stack);
    return res.redirect(`${process.env.FRONTEND_URL ?? "http://localhost:3000"}/login?error=auth_failed&details=${encodeURIComponent(err?.message || "Unknown error")}`);
  }
});

router.get("/zoho-callback", async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    console.error("[auth callback] Zoho error:", error, error_description);
    return res.redirect(`${process.env.FRONTEND_URL ?? "http://localhost:3000"}/login?error=${error}`);
  }

  if (!code || !state) {
    console.error("[auth callback] Zoho missing code or state");
    return res.redirect(`${process.env.FRONTEND_URL ?? "http://localhost:3000"}/login?error=missing_params`);
  }

  try {
    const stateObj = JSON.parse(Buffer.from(state, "base64url").toString());
    const { clientId, clientSecret } = stateObj;
    const { email, name, tokens, accountId } = await exchangeZohoCodeForTokens(code, clientId, clientSecret, process.env.ZOHO_LOGIN_REDIRECT_URI);

    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await prisma.user.create({ data: { email, name } });
    }

    await prisma.zohoAccount.upsert({
      where: { userId_email: { userId: user.id, email } },
      create: {
        userId: user.id,
        email,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token ?? null,
        tokenExpiry: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
        clientId: clientId ?? null,
        clientSecret: clientSecret ?? null,
        accountId: accountId ?? null,
        isActive: true,
      },
      update: {
        refreshToken: tokens.refresh_token ?? undefined,
        accessToken: tokens.access_token ?? null,
        tokenExpiry: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
        clientId: clientId ?? null,
        clientSecret: clientSecret ?? null,
        accountId: accountId ?? undefined,
        isActive: true,
      },
    });

    const tempToken = jwt.sign(
      { id: user.id, email: user.email, isTemp: true },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    const encodedUser = Buffer.from(JSON.stringify({ id: user.id, email: user.email, name: user.name })).toString("base64url");
    const redirectUrl = `${process.env.FRONTEND_URL ?? "http://localhost:3000"}/set-password?token=${encodeURIComponent(tempToken)}&user=${encodeURIComponent(encodedUser)}`;
    return res.redirect(redirectUrl);
  } catch (err) {
    console.error("[auth callback] Zoho Error:", err?.message, err?.stack);
    return res.redirect(`${process.env.FRONTEND_URL ?? "http://localhost:3000"}/login?error=auth_failed&details=${encodeURIComponent(err?.message || "Unknown error")}`);
  }
});

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ?? req.ip ?? "unknown";
  const { allowed, remaining } = await checkRateLimit(`register:${ip}`);
  if (!allowed) {
    return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
  }

  const { name, email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { name, email, password: hashed } });

  return res.status(201).json({ id: user.id, email: user.email });
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  const { allowed } = await checkRateLimit(`login:${email}`);
  if (!allowed) {
    return res.status(429).json({ error: "Too many login attempts. Try again in 15 minutes." });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.password) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });
  return res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

// POST /api/auth/set-password
router.post("/set-password", requireAuth, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const hashed = await bcrypt.hash(password, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashed },
  });

  const token = jwt.sign({ id: userId, email: req.user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } });
  return res.json({ token, user });
});

module.exports = router;
