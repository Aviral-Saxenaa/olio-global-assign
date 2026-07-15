import { z } from "zod";

export const audienceRuleSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(["equals", "contains", "in"]),
  value: z.union([z.string(), z.array(z.string())]),
});

export const audienceFiltersSchema = z.array(audienceRuleSchema);

export const contactInputSchema = z
  .object({
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().optional().or(z.literal("")),
    firstName: z.string().optional().or(z.literal("")),
    lastName: z.string().optional().or(z.literal("")),
    city: z.string().optional().or(z.literal("")),
    tags: z.array(z.string()).default([]),
    customFields: z.record(z.string(), z.string()).default({}),
  })
  .refine((value) => Boolean(value.email || value.phone), {
    message: "Either email or phone is required",
  });

export const audienceInputSchema = z.object({
  name: z.string().min(2),
  filters: audienceFiltersSchema,
});

export const campaignAttachmentSchema = z.object({
  filename: z.string(),
  contentType: z.string(),
  size: z.number(),
  content: z.string(),
});

export const campaignInputSchema = z
  .object({
    name: z.string().min(2),
    subject: z.string().min(2),
    body: z.string().min(2),
    recipientMode: z.enum(["AUDIENCE", "TAG", "MANUAL"]),
    audienceId: z.string().optional(),
    tag: z.string().optional(),
    manualRecipients: z.array(z.string()).default([]),
    attachments: z.array(campaignAttachmentSchema).optional(),
    sendAt: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.recipientMode === "AUDIENCE" && !value.audienceId) {
      ctx.addIssue({ code: "custom", message: "Audience is required", path: ["audienceId"] });
    }
    if (value.recipientMode === "TAG" && !value.tag) {
      ctx.addIssue({ code: "custom", message: "Tag is required", path: ["tag"] });
    }
    if (value.recipientMode === "MANUAL" && value.manualRecipients.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "At least one manual recipient is required",
        path: ["manualRecipients"],
      });
    }
  });

export type AudienceFilters = z.infer<typeof audienceFiltersSchema>;
export type ContactInput = z.infer<typeof contactInputSchema>;
export type CampaignInput = z.infer<typeof campaignInputSchema>;
export const CAMPAIGN_QUEUE_NAME = "campaign-send";

export function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

export function normalizePhone(value?: string | null) {
  return value?.replace(/[^\d+]/g, "").trim() || null;
}

export function splitTags(value?: string | null) {
  if (!value) {
    return [];
  }

  return value
    .split(/[|,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}
