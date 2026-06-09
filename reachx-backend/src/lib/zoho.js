const nodemailer = require("nodemailer");

const ZOHO_AUTH_DOMAIN = process.env.ZOHO_AUTH_DOMAIN ?? "https://accounts.zoho.com";
const ZOHO_TOKEN_URL = `${ZOHO_AUTH_DOMAIN}/oauth/v2/token`;
const ZOHO_USER_INFO_URL = `${ZOHO_AUTH_DOMAIN}/oauth/user/info`;

function getZohoRedirectUri(redirectUri) {
  return redirectUri ?? process.env.ZOHO_REDIRECT_URI;
}

function getAuthUrl(clientId, clientSecret, redirectUri) {
  const id = clientId ?? process.env.ZOHO_CLIENT_ID;
  const redirect = getZohoRedirectUri(redirectUri);

  if (!id || !redirect) {
    throw new Error("Zoho OAuth config is not set. Provide ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_REDIRECT_URI.");
  }

  const params = new URLSearchParams({
    scope: "ZohoMail.messages.CREATE,ZohoMail.accounts.READ,AaaServer.profile.READ",
    client_id: id,
    response_type: "code",
    access_type: "offline",
    redirect_uri: redirect,
    prompt: "consent",
  });

  return `${ZOHO_AUTH_DOMAIN}/oauth/v2/auth?${params.toString()}`;
}

async function fetchZohoJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text().catch(() => "");
  let json = null;

  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!res.ok) {
    const details = text || res.statusText || "<empty response>";
    const msg = json?.error || json?.message || res.statusText || "Zoho API error";
    throw new Error(`Zoho request failed: ${msg}\nURL: ${url}\nStatus: ${res.status} ${res.statusText}\nResponse: ${details}`);
  }
  return json ?? {};
}

function parseZohoUserInfo(infoJson) {
  const result = infoJson?.response?.result?.[0] ?? infoJson?.result?.[0] ?? infoJson;
  const email = result?.Email || result?.email || result?.userEmail;
  const name = result?.Display_Name || result?.name || result?.FullName || result?.displayName || null;
  return { email, name };
}

async function exchangeCodeForTokens(code, clientId, clientSecret, redirectUri) {
  const id = clientId ?? process.env.ZOHO_CLIENT_ID;
  const secret = clientSecret ?? process.env.ZOHO_CLIENT_SECRET;
  const redirect = getZohoRedirectUri(redirectUri);

  if (!id || !secret || !redirect) {
    throw new Error("Zoho OAuth config is not set. Provide ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and a Zoho redirect URI.");
  }

  const params = new URLSearchParams({
    code,
    client_id: id,
    client_secret: secret,
    redirect_uri: redirect,
    grant_type: "authorization_code",
  });

  const tokenData = await fetchZohoJson(ZOHO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token;
  const expiresIn = tokenData.expires_in;

  if (!accessToken) {
    throw new Error("Zoho token exchange did not return an access token.");
  }

  const infoJson = await fetchZohoJson(ZOHO_USER_INFO_URL, {
    method: "GET",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
    },
  });
  const { email, name } = parseZohoUserInfo(infoJson);
  if (!email) {
    throw new Error("Unable to determine Zoho user email from Zoho user info.");
  }

  // Fetch account list to get accountId
  const apiDomain = process.env.ZOHO_AUTH_DOMAIN?.includes("zoho.in") 
    ? "https://mail.zoho.in" 
    : "https://mail.zoho.com";
  let accountId = null;
  try {
    const accountsRes = await fetch(`${apiDomain}/api/accounts`, {
      method: "GET",
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
      },
    });
    if (accountsRes.ok) {
      const accountsData = await accountsRes.json();
      if (accountsData?.data?.[0]?.accountId) {
        accountId = accountsData.data[0].accountId;
        console.log(`[zoho] Fetched accountId: ${accountId}`);
      }
    } else {
      console.warn("[zoho] Failed to fetch accountId, will try to fetch on send");
    }
  } catch (err) {
    console.warn("[zoho] Error fetching account list:", err?.message || err);
  }

  return {
    email,
    name,
    tokens: {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
    },
    accountId,
  };
}

async function refreshAccessToken(refreshToken, clientId, clientSecret, redirectUri) {
  const id = clientId ?? process.env.ZOHO_CLIENT_ID;
  const secret = clientSecret ?? process.env.ZOHO_CLIENT_SECRET;
  const redirect = getZohoRedirectUri(redirectUri);

  if (!id || !secret || !redirect) {
    throw new Error("Zoho OAuth config is not set. Provide ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and a Zoho redirect URI.");
  }

  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: id,
    client_secret: secret,
    grant_type: "refresh_token",
    redirect_uri: redirect,
  });

  const tokenData = await fetchZohoJson(ZOHO_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!tokenData.access_token) {
    throw new Error("Zoho refresh token request did not return an access token.");
  }

  return {
    accessToken: tokenData.access_token,
    expiresIn: tokenData.expires_in,
  };
}

async function getTransporterForAccount(zohoAccount) {
  // Mirror Gmail flow: refresh access token then create transporter with client credentials
  const clientId = zohoAccount.clientId ?? process.env.ZOHO_CLIENT_ID;
  const clientSecret = zohoAccount.clientSecret ?? process.env.ZOHO_CLIENT_SECRET;

  const defaultHost = process.env.ZOHO_AUTH_DOMAIN?.includes("zoho.in") ? "smtp.zoho.in" : "smtp.zoho.com";
  const smtpHost = process.env.ZOHO_SMTP_HOST || defaultHost;
  const smtpPort = parseInt(process.env.ZOHO_SMTP_PORT ?? "465", 10);
  const smtpSecure = process.env.ZOHO_SMTP_SECURE ? process.env.ZOHO_SMTP_SECURE === "true" : smtpPort === 465;

  // Get a fresh access token using the stored refresh token
  console.log(`[zoho smtp] attempting transport for ${zohoAccount.email} using host=${smtpHost} port=${smtpPort} secure=${smtpSecure}`);
  console.log(`[zoho smtp] refreshToken present=${!!zohoAccount.refreshToken} clientId present=${!!clientId}`);

  const tokenData = await refreshAccessToken(zohoAccount.refreshToken, clientId, clientSecret);
  const accessToken = tokenData.accessToken;
  console.log(`[zoho smtp] obtained accessToken=${accessToken ? 'yes' : 'no'} expiresIn=${tokenData.expiresIn ?? 'unknown'}`);

  // Build OAuth2 transporter (like Gmail) then verify; if server rejects XOAUTH2, fall back to PLAIN using app password
  const oauthOpts = {
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    authMethod: "XOAUTH2",
    auth: {
      type: "OAuth2",
      user: zohoAccount.email,
      clientId,
      clientSecret,
      refreshToken: zohoAccount.refreshToken,
      accessToken,
    },
    tls: { rejectUnauthorized: false },
    logger: true,
    debug: true,
  };

  const oauthTransporter = nodemailer.createTransport(oauthOpts);
  try {
    await oauthTransporter.verify();
    console.log("[zoho smtp] OAuth2 verify succeeded");
    return oauthTransporter;
  } catch (err) {
    console.warn("[zoho smtp] OAuth2 verify failed, attempting PLAIN auth fallback:", err?.response || err?.message || err?.code || err.constructor.name);

    // Zoho SMTP server typically only supports LOGIN/PLAIN (not XOAUTH2), so fall back to app password
    const fallbackPassword = zohoAccount.smtpPassword ?? process.env.ZOHO_SMTP_PASSWORD ?? null;
    if (!fallbackPassword) {
      const guidance = `Zoho SMTP rejected OAuth2 for ${zohoAccount.email}. No SMTP app password available. Create one in Zoho Mail (Security -> App Passwords) and either store it in account record as 'smtpPassword' or add to env as ZOHO_SMTP_PASSWORD.`;
      const e = new Error(guidance);
      e.original = err;
      throw e;
    }

    console.log("[zoho smtp] Using PLAIN auth with app password");
    const plainOpts = {
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: zohoAccount.email,
        pass: fallbackPassword,
      },
      logger: false,
      debug: false,
    };

    const plainTransporter = nodemailer.createTransport(plainOpts);
    try {
      await plainTransporter.verify();
      console.log("[zoho smtp] PLAIN auth verify succeeded");
      return plainTransporter;
    } catch (plainErr) {
      console.error("[zoho smtp] PLAIN auth verify also failed:", plainErr?.response || plainErr?.message || plainErr?.code || plainErr.constructor.name);
      throw plainErr;
    }
  }
}

async function sendViaZohoMailAPI(zohoAccount, mailOptions) {
  // Send via Zoho Mail REST API (no SMTP, no app password needed — uses OAuth token)
  const clientId = zohoAccount.clientId ?? process.env.ZOHO_CLIENT_ID;
  const clientSecret = zohoAccount.clientSecret ?? process.env.ZOHO_CLIENT_SECRET;

  // Refresh and get fresh access token
  const tokenData = await refreshAccessToken(zohoAccount.refreshToken, clientId, clientSecret);
  const accessToken = tokenData.accessToken;

  // Determine API domain and use stored accountId
  const apiDomain = process.env.ZOHO_AUTH_DOMAIN?.includes("zoho.in") 
    ? "https://mail.zoho.in" 
    : "https://mail.zoho.com";

  let accountId = zohoAccount.accountId;

  // If accountId not stored, fetch it first
  if (!accountId) {
    console.log("[zoho mail api] accountId not stored, fetching account list");
    try {
      const accountsRes = await fetch(`${apiDomain}/api/accounts`, {
        method: "GET",
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
      });
      if (accountsRes.ok) {
        const accountsData = await accountsRes.json();
        if (accountsData?.data?.[0]?.accountId) {
          accountId = accountsData.data[0].accountId;
          console.log("[zoho mail api] Fetched accountId:", accountId);
        } else {
          throw new Error("No accountId returned from account list");
        }
      } else {
        const errText = await accountsRes.text();
        throw new Error(`Failed to fetch account list: ${accountsRes.status} ${errText}`);
      }
    } catch (err) {
      console.error("[zoho mail api] Failed to fetch accountId:", err?.message || err);
      throw err;
    }
  }

  // Build request body for Zoho Mail API
  const fromEmail = zohoAccount.email;
  const { to, subject, html, cc, bcc, replyTo } = mailOptions;

  const requestBody = {
    fromAddress: fromEmail,
    toAddress: to,
    subject,
    content: html,
  };
  if (cc) requestBody.ccAddress = Array.isArray(cc) ? cc.join(",") : cc;
  if (bcc) requestBody.bccAddress = Array.isArray(bcc) ? bcc.join(",") : bcc;
  if (replyTo) requestBody.replyToAddress = replyTo;

  console.log(`[zoho mail api] Sending email to ${to} from ${fromEmail} via accounts/${accountId}/messages`);

  try {
    const response = await fetch(`${apiDomain}/api/accounts/${accountId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[zoho mail api] send failed: ${response.status}`, errorText);
      throw new Error(`Zoho Mail API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log(`[zoho mail api] send succeeded, messageId=${result?.data?.messageId || result?.id || "unknown"}`);
    return result;
  } catch (err) {
    console.error("[zoho mail api] send error:", err?.message || err);
    throw err;
  }
}

module.exports = {
  getAuthUrl,
  exchangeCodeForTokens,
  getTransporterForAccount,
  sendViaZohoMailAPI,
};
