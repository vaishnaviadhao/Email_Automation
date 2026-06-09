const { google } = require("googleapis");
const nodemailer = require("nodemailer");
const { prisma } = require("./prisma");

// Build an OAuth2 clientuses per-account credentials if provided, falls back to env
function getOAuthClient(clientId, clientSecret) {
  return new google.auth.OAuth2(
    clientId ?? process.env.GOOGLE_CLIENT_ID,
    clientSecret ?? process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// Generate auth URL for a specific client ID (passed via state so callback knows which to use)
function getAuthUrl(clientId, clientSecret) {
  const client = getOAuthClient(clientId, clientSecret);
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://mail.google.com/",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
  });
}

async function exchangeCodeForTokens(code, clientId, clientSecret) {
  const client = getOAuthClient(clientId, clientSecret);
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();

  return { email: data.email, name: data.name ?? null, tokens };
}

async function getTransporterForAccount(gmailAccount) {
  // Use stored per-account credentials if available
  const clientId = gmailAccount.clientId ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = gmailAccount.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET;

  const client = getOAuthClient(clientId, clientSecret);
  client.setCredentials({ refresh_token: gmailAccount.refreshToken });

  const { token } = await client.getAccessToken();

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: gmailAccount.email,
      clientId,
      clientSecret,
      refreshToken: gmailAccount.refreshToken,
      accessToken: token,
    },
  });
}

module.exports = { getAuthUrl, exchangeCodeForTokens, getTransporterForAccount };
