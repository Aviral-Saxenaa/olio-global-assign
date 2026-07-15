import "dotenv/config";
import { Worker } from "bullmq";
import { CAMPAIGN_QUEUE_NAME } from "@olio/shared";
import { processCampaignSend } from "../../api/src/campaigns.js";
import { env } from "../../api/src/env.js";

const connection = { url: env.REDIS_URL };

const worker = new Worker(
  CAMPAIGN_QUEUE_NAME,
  async (job) => {
    await processCampaignSend(String(job.data.campaignId));
  },
  { connection },
);

worker.on("completed", (job) => {
  console.log(`Campaign job completed: ${job.id}`);
});

worker.on("failed", (job, error) => {
  console.error(`Campaign job failed: ${job?.id}`, error);
});

console.log("Worker is running");
