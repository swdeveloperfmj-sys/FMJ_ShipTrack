import cors from "cors";
import "dotenv/config";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import express from "express";
import { rateLimit } from "express-rate-limit";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

const app = express();
app.set("trust proxy", 1);
const port = Number(process.env.PORT) || 4000;
const adminEmail = "sw.developer.fmj@gmail.com";
const cookieName = "fmj_shiptrack_session";
const sessionDurationMs = 7 * 24 * 60 * 60 * 1000;
const isDeployed = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim());

const shipmentSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    importNo: { type: String, required: true, trim: true, unique: true },
    company: { type: String, required: true, trim: true },
    supplier: { type: String, required: true, trim: true },
    consignee: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    transportMode: { type: String, enum: ["AIR", "SEA", ""], default: "" },
    incoterm: { type: String, enum: ["CIP", "CPT", "FCA", "EXW", "CIF", "CFR", "FOB", ""], default: "" },
    incotermLocation: { type: String, trim: true, default: "" },
    fclLcl: { type: String, enum: ["FCL", "LCL", ""], default: "" },
    containerSize: { type: String, enum: ["20FT", "40FT", ""], default: "" },
    remarks: { type: String, trim: true, default: "" },
    currency: { type: String, default: "LKR", match: /^[A-Z]{3}$/ },
    etd: { type: String, default: "" },
    eta: { type: String, default: "" },
    arrivalDate: { type: String, default: "" },
    deliveryDate: { type: String, default: "" },
    status: { type: String, default: "Pending" },
    paymentMethod: { type: String, default: "Advance TT" },
    paymentTerms: {
      type: String,
      enum: ["LETTER_OF_CREDIT", "ADVANCE_TT", "DA_BL", "DP_SIGHT", "OPEN_ACCOUNT", ""],
      default: "",
    },
    paymentTermType: { type: String, enum: ["Sight", "Usance", ""], default: "" },
    paymentTermDays: { type: Number, min: 1, max: 365, default: null },
    paymentStatus: { type: String, default: "Pending" },
    advanceTT: { type: Number, default: 0 },
    sightLC: { type: Number, default: 0 },
    usanceLC: { type: Number, default: 0 },
    duty: { type: Number, default: 0 },
    doCharges: { type: Number, default: 0 },
    clearanceStatus: { type: String, default: "Not started" },
    totalCost: { type: Number, default: 0 },
    documents: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String },
  },
  { versionKey: false },
);

const Shipment = mongoose.model("Shipment", shipmentSchema);
const consigneeSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    code: { type: String, required: true, trim: true, uppercase: true, unique: true },
    name: { type: String, required: true, trim: true },
    color: { type: String, default: "#2865db", match: /^#[0-9a-fA-F]{6}$/ },
    contactName: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String },
  },
  { versionKey: false },
);
const Consignee = mongoose.model("Consignee", consigneeSchema);
const countrySchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    nameKey: { type: String, required: true, unique: true },
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String },
  },
  { versionKey: false },
);
const Country = mongoose.model("Country", countrySchema);
const currencySchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String },
  },
  { versionKey: false },
);
currencySchema.index({ code: 1 }, { unique: true });
const Currency = mongoose.model("Currency", currencySchema);
const superAdminSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "super-admin" },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    fontSize: { type: Number, min: 80, max: 140, default: 100 },
  },
  { versionKey: false },
);
const appUserSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    sidebarAccess: { type: [String], default: [] },
    fontSize: { type: Number, min: 80, max: 140, default: 100 },
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String },
  },
  { versionKey: false },
);
const loginChallengeSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    adminId: { type: String, required: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
    attempts: { type: Number, default: 0 },
  },
  { versionKey: false },
);
const SuperAdmin = mongoose.model("SuperAdmin", superAdminSchema);
const AppUser = mongoose.model("AppUser", appUserSchema);
const LoginChallenge = mongoose.model("LoginChallenge", loginChallengeSchema);
const shipmentFields = [
  "importNo",
  "company",
  "supplier",
  "consignee",
  "description",
  "transportMode",
  "incoterm",
  "incotermLocation",
  "fclLcl",
  "containerSize",
  "remarks",
  "currency",
  "etd",
  "eta",
  "arrivalDate",
  "deliveryDate",
  "status",
  "paymentMethod",
  "paymentTerms",
  "paymentTermType",
  "paymentTermDays",
  "paymentStatus",
  "advanceTT",
  "sightLC",
  "usanceLC",
  "duty",
  "doCharges",
  "clearanceStatus",
  "totalCost",
  "documents",
];

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/", (_request, response) => {
  response.json({
    service: "FMJ ShipTrack API",
    status: "ok",
    health: "/api/health",
  });
});

app.get("/api/health", (_request, response) => {
  response.json({ service: "FMJ ShipTrack API", status: "ok" });
});

const setupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many setup attempts. Try again later." },
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
});
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many code attempts. Try again in 15 minutes." },
});

function constantTimeMatch(actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string") return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function createOtpHash(challengeId, otp) {
  return createHmac("sha256", process.env.AUTH_TOKEN_SECRET)
    .update(`${challengeId}:${otp}`)
    .digest("hex");
}

function createSessionToken(account) {
  return jwt.sign(
    { sub: account._id, username: account.username, name: account.name || account.username, role: account.role || "super-admin", sidebarAccess: account.sidebarAccess || [], fontSize: account.fontSize || 100, purpose: "shiptrack-session" },
    process.env.AUTH_TOKEN_SECRET,
    { expiresIn: "7d" },
  );
}

function setSessionCookie(response, account) {
  response.cookie(cookieName, createSessionToken(account), {
    httpOnly: true,
    secure: isDeployed,
    sameSite: isDeployed ? "none" : "lax",
    maxAge: sessionDurationMs,
    path: "/",
  });
}

const clearSessionCookie = (response) => response.clearCookie(cookieName, {
  httpOnly: true,
  secure: isDeployed,
  sameSite: isDeployed ? "none" : "lax",
  path: "/",
});

function requireAuthenticated(request, response, next) {
  const token = request.cookies[cookieName];
  if (!token) return response.status(401).json({ error: "Sign in to continue" });

  try {
    const session = jwt.verify(token, process.env.AUTH_TOKEN_SECRET);
    if (session.purpose !== "shiptrack-session") {
      return response.status(401).json({ error: "Sign in to continue" });
    }
    request.user = { id: session.sub, username: session.username, name: session.name, role: session.role, sidebarAccess: session.sidebarAccess || [], fontSize: session.fontSize || 100 };
    next();
  } catch {
    clearSessionCookie(response);
    response.status(401).json({ error: "Your session expired. Sign in again." });
  }
}

function requireSuperAdmin(request, response, next) {
  requireAuthenticated(request, response, () => {
    if (request.user.role !== "super-admin") return response.status(403).json({ error: "Super-admin access is required." });
    next();
  });
}

async function sendLoginOtp(otp) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error("Email delivery is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS.");
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
    requireTLS: String(process.env.SMTP_SECURE).toLowerCase() !== "true",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  await transporter.sendMail({
    from: SMTP_FROM || SMTP_USER,
    to: adminEmail,
    subject: "FMJ ShipTrack super-admin sign-in code",
    text: `Your FMJ ShipTrack verification code is ${otp}. It expires in 5 minutes. If you did not request this code, ignore this email.`,
    html: `<p>Your FMJ ShipTrack verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:8px">${otp}</p><p>This code expires in 5 minutes. If you did not request it, ignore this email.</p>`,
  });
}

app.get("/api/auth/status", async (request, response, next) => {
  try {
    const admin = await SuperAdmin.findById("super-admin").lean();
    if (!admin) return response.json({ setupRequired: true, authenticated: false });

    const token = request.cookies[cookieName];
    if (token) {
      try {
        const session = jwt.verify(token, process.env.AUTH_TOKEN_SECRET);
        if (session.purpose === "shiptrack-session") {
          const account = session.role === "user"
            ? await AppUser.findById(session.sub).lean()
            : await SuperAdmin.findById(session.sub).lean();
          if (!account) {
            clearSessionCookie(response);
            return response.json({ setupRequired: false, authenticated: false });
          }
          return response.json({
            setupRequired: false,
            authenticated: true,
            username: account.username,
            name: account.name || account.username,
            role: session.role || "super-admin",
            sidebarAccess: account.sidebarAccess || [],
            fontSize: account.fontSize || 100,
          });
        }
      } catch {
        clearSessionCookie(response);
      }
    }
    response.json({ setupRequired: false, authenticated: false });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/setup", setupLimiter, async (request, response, next) => {
  try {
    const { setupKey, username, password } = request.body || {};
    if (!process.env.SUPER_ADMIN_SETUP_KEY || process.env.SUPER_ADMIN_SETUP_KEY.length < 32) {
      return response.status(503).json({ error: "Super-admin setup is not configured on the server." });
    }
    if (!constantTimeMatch(setupKey, process.env.SUPER_ADMIN_SETUP_KEY)) {
      return response.status(403).json({ error: "Invalid initial setup key." });
    }
    if (typeof username !== "string" || !/^[a-zA-Z0-9._-]{3,40}$/.test(username.trim())) {
      return response.status(400).json({
        error: "Username must be 3–40 characters and use only letters, numbers, dots, underscores or hyphens.",
      });
    }
    if (typeof password !== "string" || password.length < 12 || password.length > 128) {
      return response.status(400).json({ error: "Password must be between 12 and 128 characters." });
    }
    if (await SuperAdmin.exists({ _id: "super-admin" })) {
      return response.status(409).json({ error: "Super-admin setup has already been completed." });
    }

    await SuperAdmin.create({
      _id: "super-admin",
      username: username.trim().toLowerCase(),
      passwordHash: await bcrypt.hash(password, 12),
    });
    response.status(201).json({ created: true });
  } catch (error) {
    if (error.code === 11000) {
      return response.status(409).json({ error: "Super-admin setup has already been completed." });
    }
    next(error);
  }
});

app.post("/api/auth/login", loginLimiter, async (request, response, next) => {
  try {
    const body = request.body || {};
    const username =
      typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const admin = await SuperAdmin.findOne({ username });
    const user = admin ? null : await AppUser.findOne({ username });
    const account = admin || user;
    if (!account || !(await bcrypt.compare(password, account.passwordHash))) {
      return response.status(401).json({ error: "Username or password is incorrect." });
    }
    if (user) {
      setSessionCookie(response, { ...user.toObject(), role: "user" });
      return response.json({ authenticated: true, username: user.username, name: user.name, role: "user", sidebarAccess: user.sidebarAccess || [], fontSize: user.fontSize || 100 });
    }
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return response.status(503).json({
        error: "Email OTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS in Backend/.env.",
      });
    }

    const challengeId = randomUUID();
    const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await LoginChallenge.create({
      _id: challengeId,
      adminId: admin._id,
      otpHash: createOtpHash(challengeId, otp),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    try {
      await sendLoginOtp(otp);
    } catch (error) {
      await LoginChallenge.deleteOne({ _id: challengeId });
      console.error("Failed to deliver super-admin login code.", error.code || "SMTP_ERROR");
      return response.status(503).json({
        error: "Could not send the verification email. Check the SMTP settings and try again.",
      });
    }

    response.json({
      challengeId,
      destination: adminEmail,
      expiresInSeconds: 300,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/verify", verifyLimiter, async (request, response, next) => {
  try {
    const { challengeId, code } = request.body || {};
    if (
      typeof challengeId !== "string" ||
      typeof code !== "string" ||
      !/^\d{6}$/.test(code)
    ) {
      return response.status(400).json({ error: "Enter the 6-digit verification code." });
    }

    const challenge = await LoginChallenge.findOneAndUpdate(
      { _id: challengeId, expiresAt: { $gt: new Date() }, attempts: { $lt: 5 } },
      { $inc: { attempts: 1 } },
      { new: true },
    );
    if (!challenge) {
      await LoginChallenge.deleteOne({ _id: challengeId, attempts: { $gte: 5 } });
      return response.status(400).json({ error: "Code expired or invalid. Sign in again for a new code." });
    }

    const admin = await SuperAdmin.findById(challenge.adminId);
    if (!admin || !constantTimeMatch(createOtpHash(challengeId, code), challenge.otpHash)) {
      if (challenge.attempts >= 5) await LoginChallenge.deleteOne({ _id: challengeId });
      return response.status(400).json({ error: "Verification code is incorrect." });
    }

    await LoginChallenge.deleteOne({ _id: challengeId });
    setSessionCookie(response, { ...admin.toObject(), role: "super-admin" });
    response.json({ authenticated: true, username: admin.username, name: admin.username, role: "super-admin", sidebarAccess: [], fontSize: admin.fontSize || 100 });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", requireAuthenticated, (_request, response) => {
  clearSessionCookie(response);
  response.status(204).end();
});

function serializeShipment(shipment) {
  const plain = shipment.toObject ? shipment.toObject() : shipment;
  const { _id, ...fields } = plain;
  return { ...fields, id: _id };
}

function shipmentInput(body) {
  const source = body && typeof body === "object" ? body : {};
  return Object.fromEntries(
    shipmentFields.filter((field) => source[field] !== undefined).map((field) => [field, source[field]]),
  );
}

function normalizeImportNo(value) {
  return String(value || "").trim().toUpperCase();
}

function validateShipment(shipment) {
  const requiredFields = ["importNo", "supplier", "consignee", "description", "company"];
  const missing = requiredFields.filter(
    (field) => typeof shipment[field] !== "string" || !shipment[field].trim(),
  );
  if (missing.length) {
    return `Required fields: ${missing.join(", ")}`;
  }
  if (shipment.currency !== undefined && !/^[A-Z]{3}$/.test(shipment.currency)) {
    return "Currency must be a three-letter code.";
  }
  if (shipment.status === "Cleared" && !/\bcleared\b/i.test(shipment.remarks || "")) {
    return 'Remarks must include the word "cleared" before completing clearance.';
  }
  if (shipment.transportMode) {
    const incotermsByMode = {
      AIR: ["CIP", "CPT", "FCA", "EXW"],
      SEA: ["CIF", "CFR", "FOB", "EXW"],
    };
    if (!incotermsByMode[shipment.transportMode]?.includes(shipment.incoterm)) {
      return "Select a valid Incoterm for the transport mode.";
    }
    const colomboTerms = ["CIP", "CPT", "CIF", "CFR"];
    if (colomboTerms.includes(shipment.incoterm) && shipment.incotermLocation !== "Colombo, Sri Lanka") {
      return "The selected Incoterm must use Colombo, Sri Lanka.";
    }
    if (["FCA", "FOB", "EXW"].includes(shipment.incoterm) &&
      (typeof shipment.incotermLocation !== "string" || !shipment.incotermLocation.trim())) {
      return "Select a country for the selected Incoterm.";
    }
  }
  const paymentTerms = ["LETTER_OF_CREDIT", "ADVANCE_TT", "DA_BL", "DP_SIGHT", "OPEN_ACCOUNT"];
  if (shipment.paymentTerms && !paymentTerms.includes(shipment.paymentTerms)) {
    return "Select a valid payment term.";
  }
  if (shipment.paymentTermType && !["Sight", "Usance"].includes(shipment.paymentTermType)) {
    return "Select Sight or Usance for the letter of credit.";
  }
  if (shipment.paymentTermDays !== undefined && shipment.paymentTermDays !== null && shipment.paymentTermDays !== "") {
    const days = Number(shipment.paymentTermDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) return "Payment term days must be between 1 and 365.";
    if (shipment.paymentTerms === "DA_BL" && ![30, 60, 90, 120].includes(days)) {
      return "DA payment terms must be 30, 60, 90 or 120 days from BL.";
    }
    if (shipment.paymentTerms === "OPEN_ACCOUNT" && ![30, 45, 60, 90, 120].includes(days)) {
      return "Open account terms must be 30, 45, 60, 90 or 120 days.";
    }
  }
  if (shipment.paymentTerms === "LETTER_OF_CREDIT" && !["Sight", "Usance"].includes(shipment.paymentTermType)) {
    return "Choose Sight or Usance for the letter of credit.";
  }
  if (shipment.paymentTerms === "LETTER_OF_CREDIT" && shipment.paymentTermType === "Usance" && !shipment.paymentTermDays) {
    return "Enter the Usance payment days.";
  }
  if ((shipment.paymentTerms === "DA_BL" || shipment.paymentTerms === "OPEN_ACCOUNT") && !shipment.paymentTermDays) {
    return "Select the payment term days.";
  }
  return null;
}

function validateConsignee(consignee) {
  if (typeof consignee.code !== "string" || !/^[A-Za-z0-9_-]{2,20}$/.test(consignee.code.trim())) {
    return "Consignee code must be 2–20 letters, numbers, hyphens or underscores.";
  }
  if (typeof consignee.name !== "string" || !consignee.name.trim()) {
    return "Consignee name is required.";
  }
  if (consignee.color !== undefined && (typeof consignee.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(consignee.color))) {
    return "Choose a valid consignee color.";
  }
  for (const field of ["contactName", "email", "phone", "address"]) {
    if (consignee[field] !== undefined && typeof consignee[field] !== "string") {
      return `${field} must be text.`;
    }
  }
  if (consignee.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(consignee.email)) {
    return "Enter a valid email address.";
  }
  return null;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dashboardSummary(shipments, consigneeCodes) {
  const statuses = ["Pending", "Under Clearing", "Cleared"];
  const byStatus = Object.fromEntries(
    statuses.map((status) => [status, shipments.filter((item) => item.status === status).length]),
  );
  const companies = [...new Set([...consigneeCodes, ...shipments.map((item) => item.company)])].sort();
  const byCompany = companies.map((company) => {
    const companyShipments = shipments.filter((item) => item.company === company);
    return {
      company,
      total: companyShipments.length,
      cleared: companyShipments.filter((item) => item.status === "Cleared").length,
      pending: companyShipments.filter((item) => item.status !== "Cleared").length,
      totalCost: companyShipments.reduce((sum, item) => sum + Number(item.totalCost || 0), 0),
    };
  });

  const monthlyMap = new Map();
  for (const shipment of shipments) {
    const date = shipment.eta || shipment.etd;
    if (!date) continue;
    const month = date.slice(0, 7);
    const entry = monthlyMap.get(month) || { month, shipments: 0, cost: 0 };
    entry.shipments += 1;
    entry.cost += Number(shipment.totalCost || 0);
    monthlyMap.set(month, entry);
  }

  const delayed = shipments.filter((shipment) => {
    if (!shipment.eta || shipment.status === "Cleared") return false;
    return new Date(`${shipment.eta}T23:59:59`) < new Date();
  });

  return {
    total: shipments.length,
    pending: byStatus.Pending,
    underClearing: byStatus["Under Clearing"],
    cleared: byStatus.Cleared,
    delayed: delayed.length,
    totalCost: shipments.reduce((sum, item) => sum + Number(item.totalCost || 0), 0),
    byStatus,
    byCompany,
    monthly: [...monthlyMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
    delayedShipments: delayed,
  };
}

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "FMJ ShipTrack API",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

app.use("/api", requireAuthenticated);

const sidebarAccessKeys = ["dashboard", "to-be-tt", "tt-sent", "under-clearing", "cleared-shipments", "companies", "consignees", "countries", "reports", "settings"];
const serializeUser = (user) => ({ id: user._id, name: user.name, username: user.username, sidebarAccess: user.sidebarAccess || [], fontSize: user.fontSize || 100, createdAt: user.createdAt });

app.put("/api/settings/font-size", async (request, response, next) => {
  try {
    const { userId, fontSize } = request.body || {};
    const normalizedSize = Number(fontSize);
    if (!Number.isInteger(normalizedSize) || normalizedSize < 80 || normalizedSize > 140) {
      return response.status(400).json({ error: "Font size must be between 80% and 140%." });
    }
    if (request.user.role === "user") {
      const currentUser = await AppUser.findById(request.user.id);
      if (!currentUser) return response.status(404).json({ error: "User not found." });
      if (!currentUser.sidebarAccess.includes("settings")) {
        return response.status(403).json({ error: "Settings access is required." });
      }
      currentUser.fontSize = normalizedSize;
      currentUser.updatedAt = new Date().toISOString();
      const user = await currentUser.save();
      setSessionCookie(response, { ...user.toObject(), role: "user" });
      return response.json(serializeUser(user));
    }
    if (userId === "super-admin") {
      const admin = await SuperAdmin.findByIdAndUpdate("super-admin", { fontSize: normalizedSize }, { new: true, runValidators: true });
      if (!admin) return response.status(404).json({ error: "Super admin not found." });
      setSessionCookie(response, { ...admin.toObject(), role: "super-admin" });
      return response.json({ id: "super-admin", fontSize: admin.fontSize });
    }
    const user = await AppUser.findByIdAndUpdate(userId, { fontSize: normalizedSize, updatedAt: new Date().toISOString() }, { new: true, runValidators: true });
    if (!user) return response.status(404).json({ error: "User not found." });
    response.json(serializeUser(user));
  } catch (error) {
    next(error);
  }
});

app.get("/api/users", requireSuperAdmin, async (_request, response, next) => {
  try { response.json((await AppUser.find().sort({ name: 1 }).lean()).map(serializeUser)); } catch (error) { next(error); }
});

app.post("/api/users", requireSuperAdmin, async (request, response, next) => {
  try {
    const { name, username, password, sidebarAccess } = request.body || {};
    if (typeof name !== "string" || !name.trim()) return response.status(400).json({ error: "Name is required." });
    if (typeof username !== "string" || !/^[a-zA-Z0-9._-]{3,40}$/.test(username.trim())) return response.status(400).json({ error: "Username must be 3–40 characters and use only letters, numbers, dots, underscores or hyphens." });
    if (typeof password !== "string" || password.length < 6 || password.length > 128) return response.status(400).json({ error: "Password must be between 6 and 128 characters." });
    const access = [...new Set(Array.isArray(sidebarAccess) ? sidebarAccess.filter((key) => sidebarAccessKeys.includes(key)) : [])];
    if (!access.length) return response.status(400).json({ error: "Select at least one left sidebar item." });
    const user = await AppUser.create({ _id: randomUUID(), name: name.trim(), username: username.trim().toLowerCase(), passwordHash: await bcrypt.hash(password, 12), sidebarAccess: access });
    response.status(201).json(serializeUser(user));
  } catch (error) {
    if (error.code === 11000) return response.status(409).json({ error: "That username is already in use." });
    next(error);
  }
});

app.put("/api/users/:id", requireSuperAdmin, async (request, response, next) => {
  try {
    const { name, username, password, sidebarAccess } = request.body || {};
    if (typeof name !== "string" || !name.trim()) return response.status(400).json({ error: "Name is required." });
    if (typeof username !== "string" || !/^[a-zA-Z0-9._-]{3,40}$/.test(username.trim())) return response.status(400).json({ error: "Username must be 3–40 characters and use only letters, numbers, dots, underscores or hyphens." });
    if (password && (typeof password !== "string" || password.length < 6 || password.length > 128)) return response.status(400).json({ error: "Password must be between 6 and 128 characters." });
    const access = [...new Set(Array.isArray(sidebarAccess) ? sidebarAccess.filter((key) => sidebarAccessKeys.includes(key)) : [])];
    if (!access.length) return response.status(400).json({ error: "Select at least one left sidebar item." });
    const updates = { name: name.trim(), username: username.trim().toLowerCase(), sidebarAccess: access, updatedAt: new Date().toISOString() };
    if (password) updates.passwordHash = await bcrypt.hash(password, 12);
    const user = await AppUser.findByIdAndUpdate(request.params.id, updates, { new: true, runValidators: true });
    if (!user) return response.status(404).json({ error: "User not found." });
    response.json(serializeUser(user));
  } catch (error) {
    if (error.code === 11000) return response.status(409).json({ error: "That username is already in use." });
    next(error);
  }
});

app.delete("/api/users/:id", requireSuperAdmin, async (request, response, next) => {
  try {
    const user = await AppUser.findByIdAndDelete(request.params.id);
    if (!user) return response.status(404).json({ error: "User not found." });
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/shipments", async (request, response, next) => {
  try {
    const { search = "", company = "", status = "" } = request.query;
    const filter = {};
    if (company) filter.company = String(company);
    if (status) filter.status = String(status);
    const normalizedSearch = String(search).trim();
    if (normalizedSearch) {
      const searchRegex = new RegExp(escapeRegex(normalizedSearch), "i");
      filter.$or = ["importNo", "supplier", "consignee", "description"].map((field) => ({
        [field]: searchRegex,
      }));
    }
    const shipments = await Shipment.find(filter).sort({ createdAt: -1 }).lean();
    response.json(shipments.map(serializeShipment));
  } catch (error) {
    next(error);
  }
});

app.get("/api/consignees", async (_request, response, next) => {
  try {
    const consignees = await Consignee.find().sort({ code: 1 }).lean();
    response.json(consignees.map(({ _id, ...fields }) => ({ ...fields, id: _id })));
  } catch (error) {
    next(error);
  }
});

app.post("/api/consignees", async (request, response, next) => {
  try {
    const input = request.body || {};
    const validationError = validateConsignee(input);
    if (validationError) return response.status(400).json({ error: validationError });
    const consignee = await Consignee.create({
      _id: randomUUID(),
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      color: input.color || "#2865db",
      contactName: input.contactName?.trim() || "",
      email: input.email?.trim().toLowerCase() || "",
      phone: input.phone?.trim() || "",
      address: input.address?.trim() || "",
    });
    const { _id, ...fields } = consignee.toObject();
    response.status(201).json({ ...fields, id: _id });
  } catch (error) {
    next(error);
  }
});

app.put("/api/consignees/:id", async (request, response, next) => {
  try {
    const input = request.body || {};
    const validationError = validateConsignee(input);
    if (validationError) return response.status(400).json({ error: validationError });
    const currentConsignee = await Consignee.findById(request.params.id);
    if (!currentConsignee) return response.status(404).json({ error: "Consignee not found." });
    const nextCode = input.code.trim().toUpperCase();
    if (currentConsignee.code !== nextCode && await Shipment.exists({ company: currentConsignee.code })) {
      return response.status(409).json({
        error: "This consignee code is assigned to shipments. Keep the code unchanged or reassign those shipments first.",
      });
    }
    const consignee = await Consignee.findByIdAndUpdate(
      request.params.id,
      {
        code: nextCode,
        name: input.name.trim(),
        color: input.color || "#2865db",
        contactName: input.contactName?.trim() || "",
        email: input.email?.trim().toLowerCase() || "",
        phone: input.phone?.trim() || "",
        address: input.address?.trim() || "",
        updatedAt: new Date().toISOString(),
      },
      { new: true, runValidators: true },
    );
    if (!consignee) return response.status(404).json({ error: "Consignee not found." });
    const { _id, ...fields } = consignee.toObject();
    response.json({ ...fields, id: _id });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/consignees/:id", async (request, response, next) => {
  try {
    const consignee = await Consignee.findById(request.params.id);
    if (!consignee) return response.status(404).json({ error: "Consignee not found." });
    if (await Shipment.exists({ company: consignee.code })) {
      return response.status(409).json({
        error: "This consignee is assigned to shipments. Update those shipments before deleting it.",
      });
    }
    await consignee.deleteOne();
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/countries", async (_request, response, next) => {
  try {
    const countries = await Country.find().sort({ name: 1 }).lean();
    response.json(countries.map(({ _id, name, createdAt, updatedAt }) => ({
      id: _id,
      name,
      createdAt,
      updatedAt,
    })));
  } catch (error) {
    next(error);
  }
});

app.post("/api/countries", async (request, response, next) => {
  try {
    const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
    if (!name || name.length > 100) {
      return response.status(400).json({ error: "Country name is required and must be 100 characters or fewer." });
    }
    const country = await Country.create({
      _id: randomUUID(),
      name,
      nameKey: name.toLocaleLowerCase(),
    });
    response.status(201).json({ id: country._id, name: country.name, createdAt: country.createdAt });
  } catch (error) {
    if (error.code === 11000) return response.status(409).json({ error: "That country already exists." });
    next(error);
  }
});

app.put("/api/countries/:id", async (request, response, next) => {
  try {
    const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
    if (!name || name.length > 100) {
      return response.status(400).json({ error: "Country name is required and must be 100 characters or fewer." });
    }
    const country = await Country.findByIdAndUpdate(
      request.params.id,
      { name, nameKey: name.toLocaleLowerCase(), updatedAt: new Date().toISOString() },
      { new: true, runValidators: true },
    );
    if (!country) return response.status(404).json({ error: "Country not found." });
    response.json({ id: country._id, name: country.name, createdAt: country.createdAt, updatedAt: country.updatedAt });
  } catch (error) {
    if (error.code === 11000) return response.status(409).json({ error: "That country already exists." });
    next(error);
  }
});

app.delete("/api/countries/:id", async (request, response, next) => {
  try {
    const country = await Country.findByIdAndDelete(request.params.id);
    if (!country) return response.status(404).json({ error: "Country not found." });
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/currencies", async (_request, response, next) => {
  try {
    const currencies = await Currency.find().sort({ code: 1 }).lean();
    response.json(currencies.map(({ _id, code, name, createdAt, updatedAt }) => ({
      id: _id,
      code,
      name,
      createdAt,
      updatedAt,
    })));
  } catch (error) {
    next(error);
  }
});

app.post("/api/currencies", async (request, response, next) => {
  try {
    const code = typeof request.body?.code === "string" ? request.body.code.trim().toUpperCase() : "";
    const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
    if (!/^[A-Z]{3}$/.test(code)) return response.status(400).json({ error: "Currency code must be three letters, such as USD." });
    if (!name || name.length > 100) return response.status(400).json({ error: "Currency name is required and must be 100 characters or fewer." });
    const currency = await Currency.create({ _id: randomUUID(), code, name });
    response.status(201).json({ id: currency._id, code: currency.code, name: currency.name, createdAt: currency.createdAt });
  } catch (error) {
    if (error.code === 11000) return response.status(409).json({ error: "That currency code already exists." });
    next(error);
  }
});

app.put("/api/currencies/:id", async (request, response, next) => {
  try {
    const code = typeof request.body?.code === "string" ? request.body.code.trim().toUpperCase() : "";
    const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
    if (!/^[A-Z]{3}$/.test(code)) return response.status(400).json({ error: "Currency code must be three letters, such as USD." });
    if (!name || name.length > 100) return response.status(400).json({ error: "Currency name is required and must be 100 characters or fewer." });
    const currentCurrency = await Currency.findById(request.params.id);
    if (!currentCurrency) return response.status(404).json({ error: "Currency not found." });
    if (currentCurrency.code !== code && await Shipment.exists({ currency: currentCurrency.code })) {
      return response.status(409).json({ error: "This currency code is assigned to shipments and cannot be changed." });
    }
    const currency = await Currency.findByIdAndUpdate(
      request.params.id,
      { code, name, updatedAt: new Date().toISOString() },
      { new: true, runValidators: true },
    );
    response.json({ id: currency._id, code: currency.code, name: currency.name, createdAt: currency.createdAt, updatedAt: currency.updatedAt });
  } catch (error) {
    if (error.code === 11000) return response.status(409).json({ error: "That currency code already exists." });
    next(error);
  }
});

app.delete("/api/currencies/:id", async (request, response, next) => {
  try {
    const currency = await Currency.findById(request.params.id);
    if (!currency) return response.status(404).json({ error: "Currency not found." });
    if (await Shipment.exists({ currency: currency.code })) {
      return response.status(409).json({ error: "This currency is assigned to shipments and cannot be deleted." });
    }
    await currency.deleteOne();
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/shipments/:id", async (request, response, next) => {
  try {
    const shipment = await Shipment.findById(request.params.id).lean();
    if (!shipment) return response.status(404).json({ error: "Shipment not found" });
    response.json(serializeShipment(shipment));
  } catch (error) {
    next(error);
  }
});

app.post("/api/shipments", async (request, response, next) => {
  try {
    const input = shipmentInput(request.body);
    const validationError = validateShipment(input);
    if (validationError) return response.status(400).json({ error: validationError });
    const importNo = normalizeImportNo(input.importNo);
    if (await Shipment.exists({ importNo: new RegExp(`^${escapeRegex(importNo)}$`, "i") })) {
      return response.status(409).json({ error: "Import No. already exists. Enter a unique Import No." });
    }
    const shipment = await Shipment.create({
      ...input,
      importNo,
      _id: randomUUID(),
      createdAt: new Date().toISOString(),
    });
    response.status(201).json(serializeShipment(shipment));
  } catch (error) {
    next(error);
  }
});

app.put("/api/shipments/:id", async (request, response, next) => {
  try {
    const input = shipmentInput(request.body);
    const validationError = validateShipment(input);
    if (validationError) return response.status(400).json({ error: validationError });
    const importNo = normalizeImportNo(input.importNo);
    if (await Shipment.exists({ _id: { $ne: request.params.id }, importNo: new RegExp(`^${escapeRegex(importNo)}$`, "i") })) {
      return response.status(409).json({ error: "Import No. already exists. Enter a unique Import No." });
    }
    const shipment = await Shipment.findByIdAndUpdate(
      request.params.id,
      {
        ...input,
        importNo,
        updatedAt: new Date().toISOString(),
      },
      { new: true, runValidators: true },
    );
    if (!shipment) return response.status(404).json({ error: "Shipment not found" });
    response.json(serializeShipment(shipment));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/shipments/:id", async (request, response, next) => {
  try {
    const shipment = await Shipment.findByIdAndDelete(request.params.id);
    if (!shipment) return response.status(404).json({ error: "Shipment not found" });
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/analytics", async (_request, response, next) => {
  try {
    const [shipmentDocuments, consigneeDocuments] = await Promise.all([
      Shipment.find().lean(),
      Consignee.find().select("code").lean(),
    ]);
    const shipments = shipmentDocuments.map(serializeShipment);
    response.json(dashboardSummary(shipments, consigneeDocuments.map((item) => item.code)));
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  if (error.code === 11000) {
    const duplicateField = Object.keys(error.keyPattern || {})[0];
    const message = duplicateField === "code"
      ? "A consignee with this code already exists."
      : duplicateField === "importNo"
        ? "Import number already exists."
        : "A record with this value already exists.";
    return response.status(409).json({ error: message });
  }
  console.error(error);
  response.status(500).json({ error: "An unexpected server error occurred" });
});

async function start() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing. Set it in Backend/.env before starting the API.");
  }
  if (!process.env.AUTH_TOKEN_SECRET || process.env.AUTH_TOKEN_SECRET.length < 32) {
    throw new Error("AUTH_TOKEN_SECRET is missing or too short. Set a random secret of at least 32 characters.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  await Shipment.init();
  await Consignee.init();
  await SuperAdmin.init();
  await LoginChallenge.init();
  const shipmentCount = await Shipment.countDocuments();
  app.listen(port, () => {
    console.log(`FMJ ShipTrack API running at http://localhost:${port}`);
    console.log(`MongoDB connected to database "${mongoose.connection.name}".`);
    console.log(`${shipmentCount} existing shipment record(s) found; no sample data was added.`);
  });
}

start().catch((error) => {
  console.error("Failed to start FMJ ShipTrack API:", error.message);
  process.exitCode = 1;
});
