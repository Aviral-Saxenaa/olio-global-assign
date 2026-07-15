import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, "../../../.env"),
});
import {
  DataTypes,
  Model,
  Op,
  Sequelize,
  cast,
  col,
  fn,
  json,
  where,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type WhereOptions,
} from "sequelize";

export const CampaignStatus = {
  DRAFT: "DRAFT",
  SCHEDULED: "SCHEDULED",
  PROCESSING: "PROCESSING",
  SENT: "SENT",
  PARTIAL: "PARTIAL",
  FAILED: "FAILED",
} as const;

export const DeliveryStatus = {
  PENDING: "PENDING",
  SENT: "SENT",
  DELIVERED: "DELIVERED",
  OPENED: "OPENED",
  FAILED: "FAILED",
  SKIPPED: "SKIPPED",
} as const;

export const RecipientMode = {
  AUDIENCE: "AUDIENCE",
  TAG: "TAG",
  MANUAL: "MANUAL",
} as const;

export type AudienceRule = {
  field: string;
  operator: "equals" | "contains" | "in";
  value: string | string[];
};

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

export const sequelize = new Sequelize(databaseUrl, {
  dialect: "postgres",
  logging: false,
  dialectOptions:
    process.env.NODE_ENV === "production"
      ? {
          ssl: {
            require: true,
            rejectUnauthorized: false,
          },
        }
      : {},
});

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<string>;
  declare email: string;
  declare passwordHash: string;
  declare name: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class Workspace extends Model<InferAttributes<Workspace>, InferCreationAttributes<Workspace>> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class Membership extends Model<InferAttributes<Membership>, InferCreationAttributes<Membership>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare workspaceId: string;
  declare role: CreationOptional<string>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class Contact extends Model<InferAttributes<Contact>, InferCreationAttributes<Contact>> {
  declare id: CreationOptional<string>;
  declare workspaceId: string;
  declare email: string | null;
  declare phone: string | null;
  declare firstName: string | null;
  declare lastName: string | null;
  declare city: string | null;
  declare tags: CreationOptional<string[]>;
  declare customFields: CreationOptional<Record<string, string>>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class Audience extends Model<InferAttributes<Audience>, InferCreationAttributes<Audience>> {
  declare id: CreationOptional<string>;
  declare workspaceId: string;
  declare name: string;
  declare filters: AudienceRule[];
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export type CampaignAttachment = {
  filename: string;
  contentType: string;
  size: number;
  content: string;
};

export class Campaign extends Model<InferAttributes<Campaign>, InferCreationAttributes<Campaign>> {
  declare id: CreationOptional<string>;
  declare workspaceId: string;
  declare name: string;
  declare subject: string;
  declare body: string;
  declare status: keyof typeof CampaignStatus;
  declare recipientMode: keyof typeof RecipientMode;
  declare audienceId: string | null;
  declare tag: string | null;
  declare manualRecipients: CreationOptional<string[]>;
  declare attachments: CreationOptional<CampaignAttachment[]>;
  declare scheduledFor: Date | null;
  declare sentAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class CampaignDelivery extends Model<
  InferAttributes<CampaignDelivery>,
  InferCreationAttributes<CampaignDelivery>
> {
  declare id: CreationOptional<string>;
  declare workspaceId: string;
  declare campaignId: string;
  declare contactId: string | null;
  declare recipientEmail: string | null;
  declare recipientPhone: string | null;
  declare recipientName: string | null;
  declare providerMessageId: string | null;
  declare status: keyof typeof DeliveryStatus;
  declare failureReason: string | null;
  declare sentAt: Date | null;
  declare deliveredAt: Date | null;
  declare openedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class WebhookEvent extends Model<InferAttributes<WebhookEvent>, InferCreationAttributes<WebhookEvent>> {
  declare id: CreationOptional<string>;
  declare workspaceId: string;
  declare campaignId: string | null;
  declare eventType: string;
  declare payload: Record<string, unknown>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

const sharedModelOptions = {
  sequelize,
  timestamps: true,
};

User.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { ...sharedModelOptions, tableName: "users" },
);

Workspace.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { ...sharedModelOptions, tableName: "workspaces" },
);

Membership.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    workspaceId: { type: DataTypes.UUID, allowNull: false },
    role: { type: DataTypes.STRING, allowNull: false, defaultValue: "owner" },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    ...sharedModelOptions,
    tableName: "memberships",
    indexes: [{ unique: true, fields: ["userId", "workspaceId"] }],
  },
);

Contact.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    workspaceId: { type: DataTypes.UUID, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: true },
    phone: { type: DataTypes.STRING, allowNull: true },
    firstName: { type: DataTypes.STRING, allowNull: true },
    lastName: { type: DataTypes.STRING, allowNull: true },
    city: { type: DataTypes.STRING, allowNull: true },
    tags: { type: DataTypes.ARRAY(DataTypes.STRING), allowNull: false, defaultValue: [] },
    customFields: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    ...sharedModelOptions,
    tableName: "contacts",
    indexes: [
      { fields: ["workspaceId"] },
      { unique: true, fields: ["workspaceId", "email"] },
      { unique: true, fields: ["workspaceId", "phone"] },
    ],
  },
);

Audience.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    workspaceId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    filters: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { ...sharedModelOptions, tableName: "audiences", indexes: [{ fields: ["workspaceId"] }] },
);

Campaign.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    workspaceId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    subject: { type: DataTypes.STRING, allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.ENUM(...Object.values(CampaignStatus)), allowNull: false, defaultValue: CampaignStatus.DRAFT },
    recipientMode: { type: DataTypes.ENUM(...Object.values(RecipientMode)), allowNull: false },
    audienceId: { type: DataTypes.UUID, allowNull: true },
    tag: { type: DataTypes.STRING, allowNull: true },
    manualRecipients: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    attachments: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    scheduledFor: { type: DataTypes.DATE, allowNull: true },
    sentAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { ...sharedModelOptions, tableName: "campaigns", indexes: [{ fields: ["workspaceId"] }] },
);

CampaignDelivery.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    workspaceId: { type: DataTypes.UUID, allowNull: false },
    campaignId: { type: DataTypes.UUID, allowNull: false },
    contactId: { type: DataTypes.UUID, allowNull: true },
    recipientEmail: { type: DataTypes.STRING, allowNull: true },
    recipientPhone: { type: DataTypes.STRING, allowNull: true },
    recipientName: { type: DataTypes.STRING, allowNull: true },
    providerMessageId: { type: DataTypes.STRING, allowNull: true, unique: true },
    status: { type: DataTypes.ENUM(...Object.values(DeliveryStatus)), allowNull: false, defaultValue: DeliveryStatus.PENDING },
    failureReason: { type: DataTypes.STRING, allowNull: true },
    sentAt: { type: DataTypes.DATE, allowNull: true },
    deliveredAt: { type: DataTypes.DATE, allowNull: true },
    openedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    ...sharedModelOptions,
    tableName: "campaign_deliveries",
    indexes: [
      { fields: ["workspaceId", "campaignId"] },
      { unique: true, fields: ["workspaceId", "campaignId", "recipientEmail"] },
    ],
  },
);

WebhookEvent.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    workspaceId: { type: DataTypes.UUID, allowNull: false },
    campaignId: { type: DataTypes.UUID, allowNull: true },
    eventType: { type: DataTypes.STRING, allowNull: false },
    payload: { type: DataTypes.JSONB, allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { ...sharedModelOptions, tableName: "webhook_events", indexes: [{ fields: ["workspaceId", "campaignId"] }] },
);

User.hasMany(Membership, { foreignKey: "userId", as: "memberships" });
Membership.belongsTo(User, { foreignKey: "userId", as: "user" });

Workspace.hasMany(Membership, { foreignKey: "workspaceId", as: "memberships" });
Membership.belongsTo(Workspace, { foreignKey: "workspaceId", as: "workspace" });

Workspace.hasMany(Contact, { foreignKey: "workspaceId", as: "contacts" });
Contact.belongsTo(Workspace, { foreignKey: "workspaceId", as: "workspace" });

Workspace.hasMany(Audience, { foreignKey: "workspaceId", as: "audiences" });
Audience.belongsTo(Workspace, { foreignKey: "workspaceId", as: "workspace" });

Workspace.hasMany(Campaign, { foreignKey: "workspaceId", as: "campaigns" });
Campaign.belongsTo(Workspace, { foreignKey: "workspaceId", as: "workspace" });

Audience.hasMany(Campaign, { foreignKey: "audienceId", as: "campaigns" });
Campaign.belongsTo(Audience, { foreignKey: "audienceId", as: "audience" });

Campaign.hasMany(CampaignDelivery, { foreignKey: "campaignId", as: "deliveries" });
CampaignDelivery.belongsTo(Campaign, { foreignKey: "campaignId", as: "campaign" });

Contact.hasMany(CampaignDelivery, { foreignKey: "contactId", as: "deliveries" });
CampaignDelivery.belongsTo(Contact, { foreignKey: "contactId", as: "contact" });

Campaign.hasMany(WebhookEvent, { foreignKey: "campaignId", as: "events" });
WebhookEvent.belongsTo(Campaign, { foreignKey: "campaignId", as: "campaign" });

export const db = {
  sequelize,
  User,
  Workspace,
  Membership,
  Contact,
  Audience,
  Campaign,
  CampaignDelivery,
  WebhookEvent,
};

export async function syncDatabase(options?: { force?: boolean; alter?: boolean }) {
  await sequelize.sync(options);
}

export async function closeDatabase() {
  await sequelize.close();
}

export async function testDatabaseConnection() {
  await sequelize.authenticate();
}

export function buildContactWhere(workspaceId: string, filters: AudienceRule[]): WhereOptions {
  const andClauses = filters.map((rule) => {
    if (rule.field === "tags") {
      if (rule.operator === "in" && Array.isArray(rule.value)) {
        return {
          [Op.or]: rule.value.map((tag) => ({ tags: { [Op.contains]: [tag] } })),
        };
      }

      return { tags: { [Op.contains]: [String(rule.value)] } };
    }

    const scalarField = ["email", "phone", "firstName", "lastName", "city"].includes(rule.field)
      ? rule.field
      : null;

    if (scalarField) {
      if (rule.operator === "equals") {
        return { [scalarField]: { [Op.iLike]: String(rule.value) } };
      }

      return { [scalarField]: { [Op.iLike]: `%${String(rule.value)}%` } };
    }

    const jsonPath = cast(json(`customFields.${rule.field}`), "text");
    if (rule.operator === "equals") {
      return where(jsonPath, { [Op.iLike]: String(rule.value) });
    }

    return where(jsonPath, { [Op.iLike]: `%${String(rule.value)}%` });
  });

  return {
    workspaceId,
    ...(andClauses.length ? { [Op.and]: andClauses } : {}),
  };
}

export function serialize<T extends Model>(model: T | null) {
  return model ? (model.toJSON() as ReturnType<T["toJSON"]>) : null;
}

export function serializeMany<T extends Model>(models: T[]) {
  return models.map((model) => model.toJSON() as ReturnType<T["toJSON"]>);
}

export { Op, col, fn, where };
