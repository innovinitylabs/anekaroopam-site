/**
 * Short-lived presigned PUT URLs for browser → R2 uploads.
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createR2Client } from "./client";
import { requireR2Config } from "./config";

export interface PresignedPutInput {
  key: string;
  contentType: string;
  contentLength: number;
  expiresIn?: number;
}

export interface PresignedPutResult {
  key: string;
  url: string;
  method: "PUT";
  headers: {
    "Content-Type": string;
    "Content-Length": string;
  };
  expiresAt: string;
  contentType: string;
  contentLength: number;
}

export async function createPresignedPut(
  input: PresignedPutInput,
): Promise<PresignedPutResult> {
  const config = requireR2Config();
  const client = createR2Client(config);
  const expiresIn = input.expiresIn ?? config.uploadTtlSeconds;

  if (!Number.isFinite(input.contentLength) || input.contentLength < 1) {
    throw new Error("contentLength must be a positive number");
  }
  if (!input.contentType.trim()) {
    throw new Error("contentType is required");
  }

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: input.key,
    ContentType: input.contentType,
    ContentLength: input.contentLength,
  });

  const url = await getSignedUrl(client, command, { expiresIn });
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  return {
    key: input.key,
    url,
    method: "PUT",
    headers: {
      "Content-Type": input.contentType,
      "Content-Length": String(input.contentLength),
    },
    expiresAt,
    contentType: input.contentType,
    contentLength: input.contentLength,
  };
}
