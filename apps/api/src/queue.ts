import { Queue } from "bullmq";
import { CAMPAIGN_QUEUE_NAME } from "@olio/shared";
import { env } from "./env.js";

const connection = { url: env.REDIS_URL };

export const campaignQueue = new Queue(CAMPAIGN_QUEUE_NAME, {
  connection,
});

export async function enqueueCampaignSend(campaignId: string, sendAt?: Date | null) {
  const delay = sendAt ? Math.max(sendAt.getTime() - Date.now(), 0) : 0;

  await campaignQueue.add(
    "send-campaign",
    { campaignId },
    {
      delay,
      removeOnComplete: 100,
      removeOnFail: 100,
      jobId: campaignId,
    },
  );
}
