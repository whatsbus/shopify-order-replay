import { Queue } from "bullmq"
import IORedis from "ioredis"

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
})

export const orderSyncQueue = new Queue("order-sync", {
  connection,
  defaultJobOptions: {
    attempts: 5,
    removeOnComplete: 100,
    removeOnFail: 100,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
  },
})
