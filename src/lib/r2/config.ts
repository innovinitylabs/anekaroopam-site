/**
 * Server-only R2 configuration. Never import from client components.
 */

import "server-only";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
  endpoint: string;
  uploadTtlSeconds: number;
}

export function isR2ArchiveEnabled(): boolean {
  return process.env.R2_ARCHIVE_ENABLED === "true" || process.env.R2_ARCHIVE_ENABLED === "1";
}

export function getR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  const endpointOverride = process.env.R2_ENDPOINT?.trim();
  const ttlRaw = process.env.R2_UPLOAD_TTL_SECONDS?.trim();
  const uploadTtlSeconds = ttlRaw ? Number(ttlRaw) : 600;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    return null;
  }

  if (!Number.isFinite(uploadTtlSeconds) || uploadTtlSeconds < 60 || uploadTtlSeconds > 3600) {
    return null;
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl,
    endpoint:
      endpointOverride || `https://${accountId}.r2.cloudflarestorage.com`,
    uploadTtlSeconds,
  };
}

export function requireR2Config(): R2Config {
  const config = getR2Config();
  if (!config) {
    throw new Error(
      "R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, and R2_PUBLIC_BASE_URL.",
    );
  }
  return config;
}

export function r2ArchiveReady(): boolean {
  return isR2ArchiveEnabled() && getR2Config() !== null;
}
