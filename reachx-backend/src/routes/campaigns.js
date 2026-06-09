const express = require("express");
const dns = require("dns/promises");
const { prisma } = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { sendEmail } = require("../lib/smtp");
const { rewriteLinksForTracking } = require("../lib/rewriteLinks");
const { workflowQueue } = require("../lib/workflowQueue");
const { emailQueue } = require("../lib/queue");
const { getNextGmailTransporter } = require("../lib/gmail");

const router = express.Router();
const path = require("path");
const fs = require("fs/promises");
const multer = require("multer");

const storage = multer.diskStorage({
  destination: path.join(__dirname, "../../uploads"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || "";
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_PROJECT = process.env.GEMINI_PROJECT;
const GEMINI_LOCATION = process.env.GEMINI_LOCATION ?? "us-central1";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3-flash-preview";

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "tempmail.com", "throwaway.email",
  "yopmail.com", "sharklasers.com", "spam4.me", "trashmail.com", "dispostable.com",
]);

async function quickValidate(email) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "INVALID";
  const domain = email.split("@")[1].toLowerCase();
  if (DISPOSABLE_DOMAINS.has(domain)) return "INVALID";
  try {
    const records = await dns.resolveMx(domain);
    return records?.length ? "RISKY" : "INVALID";
  } catch {
    return "INVALID";
  }
}

function formatNameFromEmail(email) {
  const local = email.split("@")[0] || "";
  return local
    .replace(/[._]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function replaceTemplatePlaceholders(text, data) {
  return text.replace(/{{\s*(name|email|company)\s*}}/gi, (_, key) => {
    const value = data[key.toLowerCase()];
    return value != null ? String(value) : "";
  });
}

function isHtmlContent(text) {
  return /<[^>]+>/.test(String(text));
}

function capitalize(text) {
  return String(text)
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => word[0]?.toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function parseGeminiJsonOutput(output) {
  let text = String(output).trim();
  
  // Remove markdown code blocks if present
  text = text.replace(/^```json\s*/, "").replace(/\n?```\s*$/, "").trim();
  
  try {
    // Try to parse directly first
    const parsed = JSON.parse(text);
    if (parsed.subject && parsed.content) {
      return parsed;
    }
  } catch (e) {
    // If direct parse fails, try to extract JSON object
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch { }
    }
  }
  return null;
}

async function generateEmailTemplateWithGemini(prompt) {
  if (!GEMINI_API_KEY) return generateEmailTemplate(prompt);

  const formattedPrompt = `Create a professional email with a subject line and body using placeholders {{name}}, {{company}}, and {{email}}.

Generate plain text email content (no HTML tags, just natural text with line breaks).

Return ONLY valid JSON with these exact keys:
{
  "subject": "subject line here",
  "content": "plain text email body here with line breaks"
}

Do NOT wrap in markdown code blocks or any other text. Just the JSON.

Prompt: ${prompt}`;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: formattedPrompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini error ${response.status}: ${errorText}`);
  }

  const json = await response.json();
  const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const parsed = parseGeminiJsonOutput(rawText);

  if (parsed?.subject && parsed?.content) {
    return { subject: String(parsed.subject).trim(), content: String(parsed.content).trim() };
  }

  const fallback = generateEmailTemplate(prompt);
  return { subject: fallback.subject, content: fallback.content };
}

function generateEmailTemplate(prompt) {
  const normalized = String(prompt || "").trim();
  const lower = normalized.toLowerCase();
  let subject = `Quick note for {{name}} at {{company}}`;
  let opening = `I’m reaching out with an opportunity I think could be helpful for {{company}}.`;
  let bodyIntro = `Would you be open to a short conversation to see if this is a fit?`;

  if (lower.includes("follow")) {
    subject = `Following up, {{name}}`;
    opening = `I wanted to follow up and see if you had a chance to review my last message.`;
    bodyIntro = `If you're still interested, I’d love to connect and show you how we can help {{company}}.`;
  } else if (lower.includes("demo")) {
    subject = `Book a demo for {{company}}`;
    opening = `I’m reaching out because I think {{company}} would benefit from a quick demo of our solution.`;
    bodyIntro = `Would a 15-minute walkthrough this week make sense?`;
  } else if (lower.includes("thank")) {
    subject = `Thanks, {{name}}`;
    opening = `Thank you for your time and interest in {{company}}.`;
    bodyIntro = `Please let me know if you have any questions or want to continue the conversation.`;
  } else if (lower.includes("cold") || lower.includes("outreach") || lower.includes("prospect")) {
    subject = `Quick question for {{name}}`;
    opening = `I’m reaching out because I see {{company}} is doing interesting work in this space.`;
    bodyIntro = `Do you have time this week for a quick chat?`;
  } else if (normalized.length > 0) {
    const summary = capitalize(normalized);
    subject = `${summary} for {{company}}`;
    opening = `I wanted to share a quick note about ${summary.toLowerCase()} for {{company}}.`;
    bodyIntro = `If this is relevant, I’d love to talk through it in a quick call.`;
  }

  const html = `\n<div style="font-family: Inter, system-ui, sans-serif; color: #111827; line-height: 1.75;">\n  <p style="margin-bottom: 18px;">Hi {{name}},</p>\n  <p style="margin-bottom: 18px;">${opening}</p>\n  <p style="margin-bottom: 18px;">${bodyIntro}</p>\n  <p style="margin-bottom: 18px;">Here are a few things we can help {{company}} with:</p>\n  <ul style="margin-bottom: 18px; padding-left: 20px; color: #475569;">\n    <li style="margin-bottom: 10px;">Faster campaign setup and outreach</li>\n    <li style="margin-bottom: 10px;">Personalized messaging with merge fields</li>\n    <li style="margin-bottom: 10px;">Better delivery and tracking</li>\n  </ul>\n  <p style="margin-bottom: 18px;">Would you be open to a brief call to explore next steps?</p>\n  <p style="margin-bottom: 0;">Best regards,<br/>[Your Name]</p>\n</div>`;

  return { subject, content: html };
}

router.post("/generate-template", requireAuth, async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || !String(prompt).trim()) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    const template = await generateEmailTemplateWithGemini(prompt);
    res.json(template);
  } catch (err) {
    console.error("Gemini template generation failed:", err?.message ?? err);
    return res.status(500).json({ error: "AI template generation failed" });
  }
});

// GET /api/campaigns
router.get("/", requireAuth, async (req, res) => {
  const campaigns = await prisma.campaign.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { recipients: true, events: true } } },
  });
  res.json(campaigns);
});

// POST /api/campaigns/draft
router.post("/draft", requireAuth, async (req, res) => {
  const { name, subject, content } = req.body;
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const campaign = await prisma.campaign.create({
      data: {
        name: name || "Draft",
        subject: subject ?? "",
        content: content ?? "",
        userId,
      },
    });
    res.status(201).json(campaign);
  } catch (err) {
    if (err?.code === "P2003") {
      return res.status(400).json({ error: "Unable to create campaign: invalid user or related record." });
    }
    throw err;
  }
});

// POST /api/campaigns
router.post("/", requireAuth, async (req, res) => {
  const { name, subject, content, recipients } = req.body;
  if (!name || !subject || !content) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const campaign = await prisma.campaign.create({
      data: {
        name,
        subject,
        content,
        userId,
        recipients: {
          create: (recipients || []).map((email) => ({ email })),
        },
      },
    });
    res.status(201).json(campaign);
  } catch (err) {
    if (err?.code === "P2003") {
      return res.status(400).json({ error: "Unable to create campaign: invalid user or related record." });
    }
    throw err;
  }
});

// GET /api/campaigns/:id
router.get("/:id", requireAuth, async (req, res) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: { recipients: true, events: { orderBy: { createdAt: "desc" } }, attachments: true },
  });
  if (!campaign) return res.status(404).json({ error: "Not found" });
  res.json(campaign);
});

// POST /api/campaigns/:id/attachments
router.post("/:id/attachments", requireAuth, upload.single("file"), async (req, res) => {
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!campaign) return res.status(404).json({ error: "Not found" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const appUrl = process.env.APP_URL ?? "http://localhost:4000";
  const url = `${appUrl}/uploads/${req.file.filename}`;

  const rec = await prisma.campaignAttachment.create({
    data: {
      campaignId: campaign.id,
      filename: req.file.originalname,
      storedFilename: req.file.filename,
      url,
      contentType: req.file.mimetype,
      size: req.file.size,
    },
  });

  res.status(201).json(rec);
});

// DELETE /api/campaigns/:id/attachments/:aid
router.delete("/:id/attachments/:aid", requireAuth, async (req, res) => {
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!campaign) return res.status(404).json({ error: "Not found" });

  const att = await prisma.campaignAttachment.findFirst({ where: { id: req.params.aid, campaignId: campaign.id } });
  if (!att) return res.status(404).json({ error: "Attachment not found" });

  // delete file from disk if exists
  try {
    await fs.unlink(path.join(__dirname, "../../uploads", att.storedFilename));
  } catch (e) { /* ignore */ }

  await prisma.campaignAttachment.delete({ where: { id: att.id } });
  res.json({ ok: true });
});

// PATCH /api/campaigns/:id/edit
router.patch("/:id/edit", requireAuth, async (req, res) => {
  const { name, subject, content, fromName, replyTo } = req.body;
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!campaign) return res.status(404).json({ error: "Not found" });

  const updated = await prisma.campaign.update({
    where: { id: req.params.id },
    data: {
      name, subject, content,
      ...(fromName !== undefined && { fromName: fromName || null }),
      ...(replyTo !== undefined && { replyTo: replyTo || null }),
    },
  });
  res.json(updated);
});

// POST /api/campaigns/:id/send
router.post("/:id/send", requireAuth, async (req, res) => {
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: { recipients: true, attachments: true },
  });
  if (!campaign) return res.status(404).json({ error: "Not found" });
  if (campaign.status === "SENDING" || campaign.status === "SENT") {
    return res.status(400).json({ error: "Campaign already sent" });
  }

  await prisma.campaign.update({ where: { id: req.params.id }, data: { status: "SENDING" } });

  const appUrl = process.env.APP_URL ?? "http://localhost:4000";
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true, senderName: true, replyTo: true } });
  const resolvedFromName = campaign.fromName ?? user?.senderName ?? undefined;
  const resolvedReplyTo = campaign.replyTo ?? user?.replyTo ?? undefined;

  const unsubscribed = await prisma.contact.findMany({
    where: { userId: req.user.id, unsubscribed: true },
    select: { email: true },
  });
  const unsubscribedEmails = new Set(unsubscribed.map((c) => c.email.toLowerCase()));

  const contactRecords = await prisma.contact.findMany({
    where: { userId: req.user.id, email: { in: campaign.recipients.map((r) => r.email) } },
    select: { email: true, name: true, company: true },
  });
  const contactByEmail = new Map(contactRecords.map((contact) => [contact.email.toLowerCase(), contact]));

  // Check if user has active Gmail or Zoho accounts
  const gmailAccounts = await prisma.gmailAccount.findMany({
    where: { userId: req.user.id, isActive: true },
  });
  const zohoAccounts = await prisma.zohoAccount.findMany({
    where: { userId: req.user.id, isActive: true },
  });
  const useZoho = zohoAccounts.length > 0;
  const useGmail = !useZoho && gmailAccounts.length > 0;

  let successCount = 0;
  let gmailRRIndex = 0;
  let zohoRRIndex = 0;

  for (const recipient of campaign.recipients) {
    if (unsubscribedEmails.has(recipient.email.toLowerCase())) continue;
    if (recipient.status === "INVALID") continue;

    try {
      const contact = contactByEmail.get(recipient.email.toLowerCase());
      const replacements = {
        name: contact?.name?.trim() || formatNameFromEmail(recipient.email),
        email: recipient.email,
        company: contact?.company?.trim() || "",
      };
      const personalizedSubject = replaceTemplatePlaceholders(campaign.subject, replacements);
      const personalizedContent = replaceTemplatePlaceholders(campaign.content, replacements);
      const emailContentHtml = isHtmlContent(personalizedContent)
        ? personalizedContent
        : personalizedContent.replace(/\n/g, "<br/>");

      const unsub = await prisma.unsubscribeToken.create({
        data: { email: recipient.email, userId: req.user.id, campaignId: campaign.id },
      });
      const unsubLink = `${appUrl}/api/unsubscribe?token=${unsub.token}`;
      const unsubFooter = `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;font-size:12px;color:#94a3b8;">
        Don't want to receive these emails? <a href="${unsubLink}" style="color:#6366f1;">Unsubscribe</a>
      </div>`;
      const trackingPixel = `<img src="${appUrl}/api/track?rid=${recipient.id}&cid=${campaign.id}&type=open" width="1" height="1" style="display:none" />`;
      const htmlWithTracking = rewriteLinksForTracking(emailContentHtml, recipient.id, campaign.id, appUrl) + trackingPixel + unsubFooter;
      const attachmentFiles = (campaign.attachments || []).map((att) => ({
        filename: att.filename,
        path: path.join(__dirname, "../../uploads", att.storedFilename),
        contentType: att.contentType || undefined,
      }));

      if (useGmail) {
        // Round-robin across active Gmail accounts
        const account = gmailAccounts[gmailRRIndex % gmailAccounts.length];
        gmailRRIndex++;
        const { getTransporterForAccount } = require("../lib/gmail");
        const transporter = await getTransporterForAccount(account);
        const fromName = resolvedFromName ?? account.email;
        await transporter.sendMail({
          from: `"${fromName}" <${account.email}>`,
          to: recipient.email,
          subject: personalizedSubject,
          html: htmlWithTracking,
          replyTo: resolvedReplyTo || undefined,
          attachments: attachmentFiles,
          headers: { "X-ReachX-Recipient-Id": recipient.id, "X-ReachX-Campaign-Id": campaign.id },
        });
      } else if (useZoho) {
        // Round-robin across active Zoho accounts when no Gmail account is available
        const account = zohoAccounts[zohoRRIndex % zohoAccounts.length];
        zohoRRIndex++;
        const { sendViaZohoMailAPI } = require("../lib/zoho");
        await sendViaZohoMailAPI(account, {
          to: recipient.email,
          subject: personalizedSubject,
          html: htmlWithTracking,
          replyTo: resolvedReplyTo || undefined,
        });
      } else {
        await sendEmail({
          to: recipient.email,
          subject: personalizedSubject,
          htmlContent: htmlWithTracking,
          fromName: resolvedFromName,
          replyTo: resolvedReplyTo,
          attachments: attachmentFiles,
          headers: { "X-ReachX-Recipient-Id": recipient.id, "X-ReachX-Campaign-Id": campaign.id },
        });
      }

      await prisma.emailEvent.create({ data: { eventType: "SENT", campaignId: campaign.id, recipientId: recipient.id } });
      successCount++;
    } catch (err) {
      console.error(`Failed to send to ${recipient.email}:`, err);
      await prisma.emailEvent.create({
        data: { eventType: "BOUNCED", campaignId: campaign.id, recipientId: recipient.id, metadata: { error: String(err) } },
      });
    }
  }

  await prisma.campaign.update({ where: { id: req.params.id }, data: { status: "SENT" } });

  // Auto-enroll into follow-up workflow
  if (campaign.followUpWorkflowId) {
    const workflow = await prisma.workflow.findFirst({
      where: { id: campaign.followUpWorkflowId },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    if (workflow && workflow.status === "ACTIVE" && (campaign.followUpTrigger ?? "all") === "all") {
      const firstStep = workflow.steps.find((s) => s.type === "TRIGGER") ?? workflow.steps[0];
      for (const recipient of campaign.recipients) {
        try {
          const enrollment = await prisma.workflowEnrollment.upsert({
            where: { workflowId_contactEmail: { workflowId: workflow.id, contactEmail: recipient.email } },
            create: { workflowId: workflow.id, contactEmail: recipient.email, currentStepId: firstStep?.id },
            update: workflow.allowReEnrollment ? { status: "ACTIVE", currentStepId: firstStep?.id } : {},
          });
          if (enrollment.status === "ACTIVE") {
            await workflowQueue.add("process-enrollment", { enrollmentId: enrollment.id, workflowId: workflow.id });
          }
        } catch { /* skip duplicates */ }
      }
    }
  }

  res.json({ sent: successCount, total: campaign.recipients.length });
});

// POST /api/campaigns/:id/recipients
router.post("/:id/recipients", requireAuth, async (req, res) => {
  const { emails } = req.body;
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!campaign) return res.status(404).json({ error: "Not found" });

  const existing = await prisma.recipient.findMany({ where: { campaignId: req.params.id } });
  const existingEmails = new Set(existing.map((r) => r.email));
  const newEmails = (emails || []).filter((e) => !existingEmails.has(e));

  const withStatus = await Promise.all(
    newEmails.map(async (email) => ({ email, campaignId: req.params.id, status: await quickValidate(email) }))
  );

  await prisma.recipient.createMany({ data: withStatus });
  res.json({ added: newEmails.length });
});

// DELETE /api/campaigns/:id/recipients
router.delete("/:id/recipients", requireAuth, async (req, res) => {
  const { recipientId } = req.body;
  await prisma.emailEvent.deleteMany({ where: { recipientId } });
  await prisma.recipient.delete({ where: { id: recipientId, campaignId: req.params.id } });
  res.json({ ok: true });
});

// POST /api/campaigns/:id/schedule
router.post("/:id/schedule", requireAuth, async (req, res) => {
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!campaign) return res.status(404).json({ error: "Not found" });
  if (campaign.status !== "DRAFT") return res.status(400).json({ error: "Only DRAFT campaigns can be scheduled" });

  const { scheduledAt } = req.body;
  const sendAt = new Date(scheduledAt);
  if (isNaN(sendAt.getTime()) || sendAt <= new Date()) {
    return res.status(400).json({ error: "scheduledAt must be a future date" });
  }

  const updated = await prisma.campaign.update({
    where: { id: req.params.id },
    data: { scheduledAt: sendAt, status: "SCHEDULED" },
  });
  res.json(updated);
});

// DELETE /api/campaigns/:id/schedule
router.delete("/:id/schedule", requireAuth, async (req, res) => {
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!campaign) return res.status(404).json({ error: "Not found" });

  const updated = await prisma.campaign.update({
    where: { id: req.params.id },
    data: { scheduledAt: null, status: "DRAFT" },
  });
  res.json(updated);
});

// PATCH /api/campaigns/:id/followup
router.patch("/:id/followup", requireAuth, async (req, res) => {
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!campaign) return res.status(404).json({ error: "Not found" });

  const { followUpWorkflowId, followUpTrigger } = req.body;
  const updated = await prisma.campaign.update({
    where: { id: req.params.id },
    data: { followUpWorkflowId: followUpWorkflowId ?? null, followUpTrigger: followUpTrigger ?? null },
  });
  res.json(updated);
});

// POST /api/campaigns/:id/duplicate
router.post("/:id/duplicate", requireAuth, async (req, res) => {
  const source = await prisma.campaign.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: { recipients: true },
  });
  if (!source) return res.status(404).json({ error: "Not found" });

  const copy = await prisma.campaign.create({
    data: {
      name: `${source.name} (copy)`,
      subject: source.subject,
      content: source.content,
      userId: req.user.id,
      recipients: { create: source.recipients.map((r) => ({ email: r.email })) },
    },
  });
  res.status(201).json(copy);
});

// DELETE /api/campaigns/:id/delete
router.delete("/:id/delete", requireAuth, async (req, res) => {
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!campaign) return res.status(404).json({ error: "Not found" });

  try {
    const job = await emailQueue.getJob(`campaign-${req.params.id}`);
    if (job) await job.remove();
  } catch { /* Redis might be down */ }

  await prisma.emailEvent.deleteMany({ where: { campaignId: req.params.id } });
  await prisma.unsubscribeToken.deleteMany({ where: { campaignId: req.params.id } });
  await prisma.recipient.deleteMany({ where: { campaignId: req.params.id } });
  await prisma.campaign.delete({ where: { id: req.params.id } });

  res.json({ success: true });
});

module.exports = router;
