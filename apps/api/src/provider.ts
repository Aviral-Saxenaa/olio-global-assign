import { CampaignAttachment, CampaignDelivery, DeliveryStatus } from "@olio/db";
import { env } from "./env.js";

type SendRecipient = {
  deliveryId: string;
  email: string;
  name?: string | null;
};

export async function sendCampaignEmail(input: {
  campaignId: string;
  subject: string;
  body: string;
  recipients: SendRecipient[];
  attachments?: CampaignAttachment[];
}) {
  if (env.EMAIL_PROVIDER === "brevo") {
    if (!env.BREVO_API_KEY) {
      throw new Error("BREVO_API_KEY is required when EMAIL_PROVIDER=brevo");
    }

    for (const recipient of input.recipients) {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "api-key": env.BREVO_API_KEY,
        },
        body: JSON.stringify({
          sender: parseSender(env.EMAIL_FROM),
          to: [{ email: recipient.email, name: recipient.name || undefined }],
          subject: input.subject,
          htmlContent: input.body,
          attachment: input.attachments?.map((attachment) => ({
            name: attachment.filename,
            content: attachment.content,
          })),
          headers: {
            "X-Olio-Campaign-Id": input.campaignId,
            "X-Olio-Delivery-Id": recipient.deliveryId,
          },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Brevo send failed: ${text}`);
      }

      const payload = (await response.json()) as { messageId?: string };
      await CampaignDelivery.update(
        {
          status: DeliveryStatus.SENT,
          providerMessageId: payload.messageId,
          sentAt: new Date(),
        },
        { where: { id: recipient.deliveryId } },
      );
    }

    return;
  }

  for (const recipient of input.recipients) {
    console.log(`[console-provider] ${recipient.email}: ${input.subject}`);
    if (input.attachments?.length) {
      console.log(
        `[console-provider] attachments: ${input.attachments.map((attachment) => attachment.filename).join(", ")}`,
      );
    }
    await CampaignDelivery.update(
      {
        status: DeliveryStatus.SENT,
        providerMessageId: `console-${recipient.deliveryId}`,
        sentAt: new Date(),
      },
      { where: { id: recipient.deliveryId } },
    );
  }
}

function parseSender(sender: string) {
  const match = sender.match(/^(.*)<(.+)>$/);
  if (!match) {
    return { email: sender.trim() };
  }

  return {
    name: match[1]?.trim(),
    email: match[2]?.trim(),
  };
}
