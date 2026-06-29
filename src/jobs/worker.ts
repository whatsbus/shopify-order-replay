import { Worker } from "bullmq"
import IORedis from "ioredis"
import { syncOrders } from "../services/orderSync.js"

const connection = new IORedis(process.env.REDIS_URL!)

export const orderSyncWorker = new Worker(
  "order-sync",
  async (job) => {
    const { shopId, shopDomain, accessToken } = job.data

    await syncOrders(shopId, shopDomain, accessToken)
  },
  { connection }
)

console.log("[worker] Order sync worker running...")
