import type { Stall } from "./schemas";

export interface Env {
  MARKET_ROOM: DurableObjectNamespace;
  MARKET_ASSETS: R2Bucket;
  MARKET_SYNC_SECRET: string;
  MARKET_SERVER_ID: string;
  MARKET_OBJECT_NAME: string;
  MARKET_SCHEMA_VERSION: string;
  EXPECTED_STALL_COUNT: string;
  PUBLIC_SITE_ORIGIN: string;
  EXPERIMENTAL_SITE_ORIGIN: string;
}

export interface StoredEvent {
  type: "stall.updated" | "market.replaced";
  schemaVersion: 1;
  sequence: number;
  stallId?: string;
  revision?: number;
  updatedAt?: string;
  stall?: Stall;
  snapshotRevision?: number;
  generatedAt?: string;
}
