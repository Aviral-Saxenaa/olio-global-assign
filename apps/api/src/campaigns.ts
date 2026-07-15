import { Audience, Campaign, CampaignAttachment, CampaignDelivery, CampaignStatus, Contact, DeliveryStatus, Op, RecipientMode, buildContactWhere } from "@olio/db";
import type { AudienceFilters } from "@olio/shared";
import { normalizeEmail, normalizePhone } from "@olio/shared";
import { sendCampaignEmail } from "./provider.js";

export async function resolveCampaignRecipients(campaignId: string) {
  const campaign = (await Campaign.findByPk(campaignId, {
    include: [{ model: Audience, as: "audience" }],
  })) as (Campaign & { audience?: (Audience & { filters: AudienceFilters }) | null }) | null;

  if (!campaign) {
    throw new Error("Campaign not found");
  }

  if (campaign.recipientMode === RecipientMode.AUDIENCE) {
    const filters = campaign.audience?.filters ?? [];
    return Contact.findAll({
      where: buildContactWhere(campaign.workspaceId, filters),
    });
  }

  if (campaign.recipientMode === RecipientMode.TAG) {
    return Contact.findAll({
      where: {
        workspaceId: campaign.workspaceId,
        tags: { [Op.contains]: [campaign.tag ?? ""] },
      },
    });
  }

  const manualValues = ((campaign.manualRecipients ?? []) as string[]).filter(Boolean);
  const emails = manualValues.map((value) => normalizeEmail(value)).filter(Boolean) as string[];
  const phones = manualValues.map((value) => normalizePhone(value)).filter(Boolean) as string[];
  if (!emails.length && !phones.length) {
    return [];
  }

  const contacts = await Contact.findAll({
    where: {
      workspaceId: campaign.workspaceId,
      [Op.or]: [
        { email: { [Op.in]: emails } },
        { phone: { [Op.in]: phones } },
      ],
    },
  });

  return contacts;
}

export async function processCampaignSend(campaignId: string) {
  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) {
    throw new Error("Campaign not found");
  }

  campaign.status = CampaignStatus.PROCESSING;
  await campaign.save();

  const contacts = await resolveCampaignRecipients(campaignId);
  const validContacts = contacts.filter((contact) => Boolean(contact.email));

  const deliveries = await Promise.all(
    validContacts.map(async (contact) => {
      const [delivery] = await CampaignDelivery.findOrCreate({
        where: {
          workspaceId: campaign.workspaceId,
          campaignId: campaign.id,
          recipientEmail: contact.email!,
        },
        defaults: {
          workspaceId: campaign.workspaceId,
          campaignId: campaign.id,
          contactId: contact.id,
          recipientEmail: contact.email,
          recipientPhone: contact.phone,
          recipientName: [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email!,
          status: DeliveryStatus.PENDING,
        },
      });

      return delivery;
    }),
  );

  await sendCampaignEmail({
    campaignId: campaign.id,
    subject: campaign.subject,
    body: campaign.body,
    recipients: deliveries.map((delivery) => ({
      deliveryId: delivery.id,
      email: delivery.recipientEmail!,
      name: delivery.recipientName,
    })),
    attachments: (campaign.attachments ?? []) as CampaignAttachment[],
  });

  const sentCount = await CampaignDelivery.count({
    where: {
      campaignId,
      status: { [Op.in]: [DeliveryStatus.SENT, DeliveryStatus.DELIVERED, DeliveryStatus.OPENED] },
    },
  });

  campaign.status = sentCount > 0 ? CampaignStatus.SENT : CampaignStatus.FAILED;
  campaign.sentAt = new Date();
  await campaign.save();
}
