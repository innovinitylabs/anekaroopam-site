/**
 * Server-only S3 client pointed at Cloudflare R2.
 */

import "server-only";

import { S3Client } from "@aws-sdk/client-s3";
import { getR2Config, requireR2Config, type R2Config } from "./config";

let cached: { endpoint: string; client: S3Client } | null = null;

export function createR2Client(config?: R2Config): S3Client {
  const cfg = config ?? requireR2Config();
  if (cached && cached.endpoint === cfg.endpoint) {
    return cached.client;
  }
  const client = new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: false,
  });
  cached = { endpoint: cfg.endpoint, client };
  return client;
}

export function getR2ClientOrNull(): S3Client | null {
  const config = getR2Config();
  if (!config) return null;
  return createR2Client(config);
}
