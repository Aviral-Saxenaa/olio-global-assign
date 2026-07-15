import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import {
  Audience,
  Campaign,
  CampaignAttachment,
  CampaignDelivery,
  CampaignStatus,
  Contact,
  DeliveryStatus,
  Membership,
  Op,
  User,
  WebhookEvent,
  Workspace,
  buildContactWhere,
  sequelize,
} from "@olio/db";
import {
  audienceInputSchema,
  campaignInputSchema,
  contactInputSchema,
  normalizeEmail,
  normalizePhone,
  splitTags,
} from "@olio/shared";
import {
  comparePassword,
  clearSessionCookie,
  hashPassword,
  requireAuth,
  setSessionCookie,
  signSession,
  type AuthedRequest,
} from "./auth.js";
import { processCampaignSend } from "./campaigns.js";
import { env } from "./env.js";
import { enqueueCampaignSend } from "./queue.js";

const app = express();
const upload = multer();

app.use(
  cors({
    origin: env.APP_URL,
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/auth/signup", async (req, res) => {
  const { email, password, name, workspaceName } = req.body as Record<string, string>;

  if (!email || !password || !name || !workspaceName) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const normalizedEmail = email.toLowerCase();
  const existing = await User.findOne({ where: { email: normalizedEmail } });
  if (existing) {
    return res.status(409).json({ error: "Email already exists" });
  }

  const result = await sequelize.transaction(async (transaction) => {
    const user = await User.create(
      { email: normalizedEmail, name, passwordHash: await hashPassword(password) },
      { transaction },
    );
    const workspace = await Workspace.create({ name: workspaceName }, { transaction });
    await Membership.create(
      { userId: user.id, workspaceId: workspace.id, role: "owner" },
      { transaction },
    );
    return { user, workspace };
  });

  setSessionCookie(res, signSession({ userId: result.user.id, workspaceId: result.workspace.id }));
  return res.status(201).json({
    user: { id: result.user.id, email: result.user.email, name: result.user.name },
    workspace: { id: result.workspace.id, name: result.workspace.name },
  });
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body as Record<string, string>;
  const user = (await User.findOne({
    where: { email: (email ?? "").toLowerCase() },
    include: [
      {
        model: Membership,
        as: "memberships",
        include: [{ model: Workspace, as: "workspace" }],
      },
    ],
  })) as (User & {
    memberships?: (Membership & { workspace?: Workspace | null })[];
  }) | null;

  if (!user || !(await comparePassword(password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const membership = user.memberships?.[0];
  const workspace = membership?.workspace;
  if (!workspace) {
    return res.status(403).json({ error: "No workspace found" });
  }

  setSessionCookie(res, signSession({ userId: user.id, workspaceId: workspace.id }));
  return res.json({
    user: { id: user.id, email: user.email, name: user.name },
    workspace: { id: workspace.id, name: workspace.name },
  });
});

app.post("/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.status(204).send();
});

app.get("/auth/me", requireAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  const membership = (await Membership.findOne({
    where: { userId: auth.userId, workspaceId: auth.workspaceId },
    include: [
      { model: User, as: "user", attributes: ["id", "email", "name"] },
      { model: Workspace, as: "workspace" },
    ],
  })) as (Membership & { user?: User | null; workspace?: Workspace | null }) | null;

  return res.json({
    user: membership?.user ?? null,
    workspace: membership?.workspace ?? null,
  });
});

app.get("/contacts", requireAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  const contacts = await Contact.findAll({
    where: { workspaceId: auth.workspaceId },
    order: [["createdAt", "DESC"]],
  });
  res.json(contacts);
});

app.post("/contacts", requireAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  const parsed = contactInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const email = normalizeEmail(parsed.data.email);
  const phone = normalizePhone(parsed.data.phone);

  const orConditions: Record<string, unknown>[] = [];
  if (email) orConditions.push({ email });
  if (phone) orConditions.push({ phone });

  const duplicate = await Contact.findOne({
    where: {
      workspaceId: auth.workspaceId,
      ...(orConditions.length ? { [Op.or]: orConditions } : { id: { [Op.eq]: null } }),
    },
  });

  if (duplicate) {
    return res.status(409).json({ error: "Duplicate contact: a contact with this email or phone already exists." });
  }

  const contact = await Contact.create({
    workspaceId: auth.workspaceId,
    email,
    phone,
    firstName: parsed.data.firstName || null,
    lastName: parsed.data.lastName || null,
    city: parsed.data.city || null,
    tags: parsed.data.tags,
    customFields: parsed.data.customFields,
  });

  res.status(201).json(contact);
});

app.post("/contacts/import", requireAuth, upload.single("file"), async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  if (!req.file) {
    return res.status(400).json({ error: "CSV file is required" });
  }

  const rows = parse(req.file.buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  const existing = await Contact.findAll({
    where: { workspaceId: auth.workspaceId },
    attributes: ["email", "phone"],
  });

  const existingEmails = new Set(existing.map((contact) => normalizeEmail(contact.email)).filter(Boolean));
  const existingPhones = new Set(existing.map((contact) => normalizePhone(contact.phone)).filter(Boolean));
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();
  const creates: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const row of rows) {
    const email = normalizeEmail(row.email);
    const phone = normalizePhone(row.phone);
    if (
      (!email && !phone) ||
      (email && (existingEmails.has(email) || seenEmails.has(email))) ||
      (phone && (existingPhones.has(phone) || seenPhones.has(phone)))
    ) {
      skipped += 1;
      continue;
    }

    if (email) {
      seenEmails.add(email);
    }
    if (phone) {
      seenPhones.add(phone);
    }

    creates.push({
      workspaceId: auth.workspaceId,
      email,
      phone,
      firstName: row.firstName || null,
      lastName: row.lastName || null,
      city: row.city || null,
      tags: splitTags(row.tags),
      customFields: Object.fromEntries(
        Object.entries(row).filter(
          ([key]) => !["email", "phone", "firstName", "lastName", "city", "tags"].includes(key),
        ),
      ),
    });
  }

  if (creates.length) {
    await Contact.bulkCreate(creates as never);
  }

  res.json({
    added: creates.length,
    skipped,
    total: rows.length,
  });
});

app.get("/audiences", requireAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  const audiences = await Audience.findAll({
    where: { workspaceId: auth.workspaceId },
    order: [["createdAt", "DESC"]],
  });

  const withCounts = await Promise.all(
    audiences.map(async (audience) => ({
      ...audience.toJSON(),
      count: await Contact.count({
        where: buildContactWhere(auth.workspaceId, audience.filters as never),
      }),
    })),
  );

  res.json(withCounts);
});

app.post("/audiences", requireAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  const parsed = audienceInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const audience = await Audience.create({
    workspaceId: auth.workspaceId,
    name: parsed.data.name,
    filters: parsed.data.filters,
  });

  res.status(201).json(audience);
});

app.get("/contacts/lookup", requireAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  const raw = String(req.query.values || "");
  const values = raw
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

  const emails = values.map((value) => normalizeEmail(value)).filter(Boolean) as string[];
  const phones = values.map((value) => normalizePhone(value)).filter(Boolean) as string[];
  const contacts = await Contact.findAll({
    where: {
      workspaceId: auth.workspaceId,
      [Op.or]: [
        { email: { [Op.in]: emails } },
        { phone: { [Op.in]: phones } },
      ],
    },
  });

  const matches = values.map((value) => {
    const normalizedEmail = normalizeEmail(value);
    const normalizedPhone = normalizePhone(value);
    const contact = contacts.find(
      (item) => item.email === normalizedEmail || item.phone === normalizedPhone,
    );

    return {
      value,
      matched: Boolean(contact),
      contact: contact ?? null,
    };
  });

  res.json(matches);
});

app.get("/campaigns", requireAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  const campaigns = (await Campaign.findAll({
    where: { workspaceId: auth.workspaceId },
    include: [{ model: Audience, as: "audience" }],
    order: [["createdAt", "DESC"]],
  })) as (Campaign & { audience?: Audience | null })[];
  res.json(campaigns);
});

app.post("/campaigns", requireAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  const parsed = campaignInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const status = parsed.data.sendAt ? CampaignStatus.SCHEDULED : CampaignStatus.PROCESSING;
  const campaign = await Campaign.create({
    workspaceId: auth.workspaceId,
    name: parsed.data.name,
    subject: parsed.data.subject,
    body: parsed.data.body,
    recipientMode: parsed.data.recipientMode,
    audienceId: parsed.data.audienceId ?? null,
    tag: parsed.data.tag ?? null,
    manualRecipients: parsed.data.manualRecipients,
    attachments: parsed.data.attachments ?? [],
    scheduledFor: parsed.data.sendAt ? new Date(parsed.data.sendAt) : null,
    status,
  });

  if (parsed.data.sendAt) {
    await enqueueCampaignSend(campaign.id, new Date(parsed.data.sendAt));
  } else {
    await enqueueCampaignSend(campaign.id, null);
  }

  res.status(201).json(campaign);
});

app.post("/campaigns/:id/duplicate", requireAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  const source = await Campaign.findOne({
    where: {
      id: String(req.params.id),
      workspaceId: auth.workspaceId,
    },
  });

  if (!source) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  const clone = await Campaign.create({
    workspaceId: auth.workspaceId,
    name: `${source.name} Copy`,
    subject: source.subject,
    body: source.body,
    recipientMode: source.recipientMode,
    audienceId: source.audienceId,
    tag: source.tag,
    manualRecipients: (source.manualRecipients ?? []) as string[],
    attachments: (source.attachments ?? []) as CampaignAttachment[],
    status: CampaignStatus.DRAFT,
  });

  res.status(201).json(clone);
});

app.get("/campaigns/:id", requireAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  const campaign = (await Campaign.findOne({
    where: { id: String(req.params.id), workspaceId: auth.workspaceId },
    include: [
      { model: Audience, as: "audience" },
      { model: CampaignDelivery, as: "deliveries" },
    ],
  })) as (Campaign & { audience?: Audience | null; deliveries?: CampaignDelivery[] }) | null;

  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  res.json(campaign);
});

app.get("/campaigns/:id/analytics", requireAuth, async (req, res) => {
  const auth = (req as AuthedRequest).auth;
  const campaign = await Campaign.findOne({
    where: { id: String(req.params.id), workspaceId: auth.workspaceId },
  });

  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  const [sent, delivered, opened] = await Promise.all([
    CampaignDelivery.count({
      where: {
        campaignId: campaign.id,
        status: { [Op.in]: [DeliveryStatus.SENT, DeliveryStatus.DELIVERED, DeliveryStatus.OPENED] },
      },
    }),
    CampaignDelivery.count({
      where: {
        campaignId: campaign.id,
        status: { [Op.in]: [DeliveryStatus.DELIVERED, DeliveryStatus.OPENED] },
      },
    }),
    CampaignDelivery.count({
      where: {
        campaignId: campaign.id,
        status: DeliveryStatus.OPENED,
      },
    }),
  ]);

  res.json({ sent, delivered, opened, status: campaign.status, scheduledFor: campaign.scheduledFor });
});

app.post("/debug/campaigns/:id/send", async (req, res) => {
  await processCampaignSend(req.params.id);
  res.json({ ok: true });
});

app.post("/webhooks/brevo", async (req, res) => {
  const secret = req.header("x-brevo-signature");
  if (env.BREVO_WEBHOOK_SECRET && secret !== env.BREVO_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const payload = req.body as Record<string, unknown>;
  const deliveryId = typeof payload["X-Olio-Delivery-Id"] === "string" ? String(payload["X-Olio-Delivery-Id"]) : String(payload.tags ?? "");
  const event = String(payload.event || "");
  const delivery = (await CampaignDelivery.findOne({
    where: {
      [Op.or]: [
        { id: deliveryId },
        { providerMessageId: String(payload["message-id"] || payload["messageId"] || "") },
      ],
    },
    include: [{ model: Campaign, as: "campaign" }],
  })) as (CampaignDelivery & { campaign?: Campaign | null }) | null;

  if (!delivery) {
    return res.status(202).json({ ignored: true });
  }

  let status: (typeof DeliveryStatus)[keyof typeof DeliveryStatus] | undefined;
  if (event.includes("delivered")) {
    status = DeliveryStatus.DELIVERED;
  }
  if (event.includes("opened")) {
    status = DeliveryStatus.OPENED;
  }

  if (status) {
    await CampaignDelivery.update(
      {
        status,
        deliveredAt: status === DeliveryStatus.DELIVERED ? new Date() : delivery.deliveredAt,
        openedAt: status === DeliveryStatus.OPENED ? new Date() : delivery.openedAt,
      },
      { where: { id: delivery.id } },
    );
  }

  await WebhookEvent.create({
    workspaceId: delivery.workspaceId,
    campaignId: delivery.campaignId,
    eventType: event,
    payload,
  });

  res.status(202).json({ ok: true });
});

app.listen(env.PORT, async () => {
  console.log("DATABASE_URL:", process.env.DATABASE_URL);

  const [result] = await sequelize.query("SELECT current_database()");
  console.log(result);
  console.log(`API listening on ${env.PORT}`);
});
