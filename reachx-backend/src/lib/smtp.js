const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendEmail(options) {
  const fromEmail = options.fromEmail ?? process.env.SMTP_FROM_EMAIL;
  const fromName = options.fromName ?? process.env.SMTP_FROM_NAME ?? "ReachX";
  const bounceEmail = process.env.SMTP_BOUNCE_EMAIL ?? fromEmail;

  if (!fromEmail) throw new Error("SMTP_FROM_EMAIL is not configured");

  const mail = {
    from: `"${fromName}" <${fromEmail}>`,
    to: options.to,
    subject: options.subject,
    html: options.htmlContent,
    replyTo: options.replyTo || undefined,
    envelope: { from: bounceEmail, to: options.to },
    headers: {
      ...(options.headers ?? {}),
      "Return-Path": bounceEmail,
    },
  };

  if (Array.isArray(options.attachments) && options.attachments.length > 0) {
    mail.attachments = options.attachments;
  }

  return transporter.sendMail(mail);
}

module.exports = { sendEmail };
