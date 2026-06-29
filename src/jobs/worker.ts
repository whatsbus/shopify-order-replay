import { Worker } from "bullmq"
import IORedis from "ioredis"
import { syncOrders } from "../services/orderSync.js"

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
})

export const orderSyncWorker = new Worker(
  "order-sync",
  async (job) => {
    const { shopId, shopDomain, accessToken } = job.data as {
      shopId: number
      shopDomain: string
      accessToken: string
    }

    await syncOrders(shopId, shopDomain, accessToken)
  },
  {
    connection,
    concurrency: 3,
  },
)

orderSyncWorker.on("completed", (job) => {
  console.log(`[worker] Job ${job.id} completed`)
})

orderSyncWorker.on("failed", (job, err) => {
  console.error(`[worker] Job ${job?.id} failed:`, err)
})

console.log("[worker] Order Sync Worker started")
