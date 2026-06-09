const express = require("express");
const { prisma } = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { getAuthUrl, exchangeCodeForTokens } = require("../lib/zoho");

const router = express.Router();

// GET /api/zoho/auth-url?clientId=...&clientSecret=...
router.get("/auth-url", requireAuth, (req, res) => {
  const clientId = req.query.clientId || process.env.ZOHO_CLIENT_ID;
  const clientSecret = req.query.clientSecret || process.env.ZOHO_CLIENT_SECRET;

  const state = Buffer.from(
    JSON.stringify({ flow: "connect", userId: req.user.id, clientId, clientSecret })
  ).toString("base64url");

  const url = getAuthUrl(clientId, clientSecret, process.env.ZOHO_REDIRECT_URI) + `&state=${state}`;
  res.json({ url });
});

// GET /api/zoho/callback
router.get("/callback", async (req, res) => {
  const { code, state, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";

  if (error || !code || !state) {
    return res.redirect(`${frontendUrl}/dashboard/settings?zoho=error`);
  }

  try {
    const parsedState = JSON.parse(Buffer.from(state, "base64url").toString());
    const { flow, userId, clientId, clientSecret } = parsedState;

    if (flow !== "connect" || !userId) {
      return res.redirect(`${frontendUrl}/dashboard/settings?zoho=error`);
    }

    const { email, name, tokens, accountId } = await exchangeCodeForTokens(code, clientId, clientSecret, process.env.ZOHO_REDIRECT_URI);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.redirect(`${frontendUrl}/dashboard/settings?zoho=error`);
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

    return res.redirect(`${frontendUrl}/dashboard/settings?zoho=connected`);
  } catch (err) {
    console.error("[zoho callback]", err);
    res.redirect(`${frontendUrl}/dashboard/settings?zoho=error`);
  }
});

// GET /api/zoho/accounts
router.get("/accounts", requireAuth, async (req, res) => {
  const accounts = await prisma.zohoAccount.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, isActive: true, createdAt: true },
  });
  res.json(accounts);
});

// PATCH /api/zoho/accounts/:id toggle active
router.patch("/accounts/:id", requireAuth, async (req, res) => {
  const account = await prisma.zohoAccount.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!account) return res.status(404).json({ error: "Not found" });

  const updated = await prisma.zohoAccount.update({
    where: { id: req.params.id },
    data: { isActive: req.body.isActive ?? !account.isActive },
    select: { id: true, email: true, isActive: true },
  });
  res.json(updated);
});

// DELETE /api/zoho/accounts/:id disconnect
router.delete("/accounts/:id", requireAuth, async (req, res) => {
  const account = await prisma.zohoAccount.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!account) return res.status(404).json({ error: "Not found" });

  await prisma.zohoAccount.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

module.exports = router;
