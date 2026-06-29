// src/jobs/types.ts

export type JobType =
  | "initial_sync"
  | "refresh_orders"
  | "replay_orders"
  | "register_webhooks"

export interface BaseJob<T = unknown> {
  id: string
  type: JobType
  shopId: number
  shopDomain: string
  payload: T
  createdAt: number
  attempts: number
  maxAttempts: number
}

export interface InitialSyncPayload {
  accessToken: string
}

export interface RefreshOrdersPayload {
  accessToken: string
}

export interface ReplayOrdersPayload {
  orderIds?: number[]
}

export interface RegisterWebhooksPayload {
  accessToken: string
}

export type Job =
  | BaseJob<InitialSyncPayload>
  | BaseJob<RefreshOrdersPayload>
  | BaseJob<ReplayOrdersPayload>
  | BaseJob<RegisterWebhooksPayload>
