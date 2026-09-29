/**
 * Short-lived presigned PUT URLs for browser → R2 uploads.
 *
 * Browser-compatible: ContentLength is NOT included in the signed PutObject
 * command. Browsers treat Content-Length as a forbidden fetch header; signing
 * it causes signature/CORS mismatches. Object size is enforced by upload-verify.
 */

import "server-only";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createR2Client } from "./client";
import { requireR2Config } from "./config";
import { browserPresignedPutHeaders } from "./presign-headers";

export { browserPresignedPutHeaders } from "./presign-headers";

export interface PresignedPutInput {
  key: string;
  contentType: string;
  /** Expected byte size — recorded for verify, not signed into the PUT URL. */
  contentLength: number;
  expiresIn?: number;
}

export interface PresignedPutResult {
  key: string;
  url: string;
  method: "PUT";
  /** Headers the browser must send. Content-Type only (no Content-Length). */
  headers: {
    "Content-Type": string;
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

  // Do not set ContentLength — it would be signed and break browser fetch.
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: input.key,
    ContentType: input.contentType,
  });

  const url = await getSignedUrl(client, command, { expiresIn });
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  return {
    key: input.key,
    url,
    method: "PUT",
    headers: browserPresignedPutHeaders(input.contentType),
    expiresAt,
    contentType: input.contentType,
    contentLength: input.contentLength,
  };
}
