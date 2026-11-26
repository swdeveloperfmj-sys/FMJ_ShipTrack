import { createHash, timingSafeEqual } from "node:crypto";
import { rateLimit } from "express-rate-limit";

export function installSystemControl(app, { State, getCode = () => process.env.SYSTEM_CONTROL_CODE }) {
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false,
    message: { error: "Too many sign-in attempts. Try again in 15 minutes." } });
  app.post("/api/auth/login", limiter, async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    try {
      const secret = getCode();
      if (!secret || secret.length < 6 || secret.length > 256) return next();
      const { username, password } = req.body || {};
      if (typeof username !== "string" || typeof password !== "string" || username.length > 256 || password.length > 256) return next();
      const digest = (value) => createHash("sha256").update(value).digest();
      const usernameMatches = timingSafeEqual(digest(username), digest(secret));
      const passwordMatches = timingSafeEqual(digest(password), digest(secret));
      if (!usernameMatches || !passwordMatches) return next();
      const state = await State.findOneAndUpdate({ _id: "system" }, [{ $set: {
        disabled: { $not: [{ $ifNull: ["$disabled", false] }] },
        updatedAt: "$$NOW", updatedBy: "system-control-code",
      } }], { new: true, upsert: true });
      res.json({ systemToggled: true, disabled: state.disabled });
    } catch (error) { next(error); }
  });
  app.use("/api", async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    try {
      const state = await State.findById("system").lean();
      if (!state?.disabled) return next();
      if (req.path === "/auth/status" && req.method === "GET") {
        return res.json({ setupRequired: false, authenticated: false, disabled: true });
      }
      return res.status(503).json({ code: "SYSTEM_DISABLED", error: "System is disabled. Contact your administrator." });
    } catch (error) { next(error); }
  });
}
