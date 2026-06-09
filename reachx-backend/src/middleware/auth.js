const jwt = require("jsonwebtoken");
const { prisma } = require("../lib/prisma");

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.id }, select: { id: true, email: true } });
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.user = { id: user.id, email: payload.email ?? user.email };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { requireAuth };
