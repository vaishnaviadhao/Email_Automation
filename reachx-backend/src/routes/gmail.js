const express = require("express");
const jwt = require("jsonwebtoken");
const { prisma } = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { getAuthUrl, exchangeCodeForTokens } = require("../lib/gmail");

const router = express.Router();

// GET /api/gmail/auth-url?clientId=...&clientSecret=...
// Returns the Google OAuth URLcalled with Bearer token from frontend
router.get("/auth-url", requireAuth, (req, res) => {
  const clientId = req.query.clientId || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = req.query.clientSecret || process.env.GOOGLE_CLIENT_SECRET;

  const state = Buffer.from(
    JSON.stringify({ flow: "connect", userId: req.user.id, clientId, clientSecret })
  ).toString("base64url");

  const url = getAuthUrl(clientId, clientSecret) + `&state=${state}`;
  res.json({ url });
});

// GET /api/gmail/callbackGoogle redirects here after user authorizes
router.get("/callback", async (req, res) => {
  const { code, state, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";

  if (error || !code || !state) {
    return res.redirect(`${frontendUrl}/dashboard/settings?gmail=error`);
  }

  let flow = "connect";

  try {
    const parsedState = JSON.parse(Buffer.from(state, "base64url").toString());
    flow = parsedState.flow ?? "connect";
    const { userId, clientId, clientSecret } = parsedState;

    const { email, name, tokens } = await exchangeCodeForTokens(code, clientId, clientSecret);

    let user;

    if (flow === "connect") {
      user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return res.redirect(`${frontendUrl}/dashboard/settings?gmail=error`);
      }
    } else {
      user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        user = await prisma.user.create({ data: { email, name } });
      } else if (!user.name && name) {
        user = await prisma.user.update({ where: { id: user.id }, data: { name } });
      }
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

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });
    const userPayload = Buffer.from(JSON.stringify({ id: user.id, email: user.email, name: user.name ?? "" })).toString("base64url");

    if (flow === "connect") {
      return res.redirect(`${frontendUrl}/dashboard/settings?gmail=connected`);
    }

    return res.redirect(`${frontendUrl}/login?token=${encodeURIComponent(token)}&user=${encodeURIComponent(userPayload)}&gmail=connected`);
  } catch (err) {
    console.error("[gmail callback]", err);
    const redirectPath = flow === "login" ? "/login?gmail=error" : "/dashboard/settings?gmail=error";
    res.redirect(`${frontendUrl}${redirectPath}`);
  }
});

// GET /api/gmail/accounts
router.get("/accounts", requireAuth, async (req, res) => {
  const accounts = await prisma.gmailAccount.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, isActive: true, createdAt: true },
  });
  res.json(accounts);
});

// PATCH /api/gmail/accounts/:idtoggle active
router.patch("/accounts/:id", requireAuth, async (req, res) => {
  const account = await prisma.gmailAccount.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!account) return res.status(404).json({ error: "Not found" });

  const updated = await prisma.gmailAccount.update({
    where: { id: req.params.id },
    data: { isActive: req.body.isActive ?? !account.isActive },
    select: { id: true, email: true, isActive: true },
  });
  res.json(updated);
});

// DELETE /api/gmail/accounts/:iddisconnect
router.delete("/accounts/:id", requireAuth, async (req, res) => {
  const account = await prisma.gmailAccount.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!account) return res.status(404).json({ error: "Not found" });

  await prisma.gmailAccount.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

module.exports = router;
