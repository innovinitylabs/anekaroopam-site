/**
 * Verify uploaded R2 objects exist with expected size and content type.
 */

import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { createR2Client } from "./client";
import { requireR2Config } from "./config";

export interface ExpectedObject {
  key: string;
  contentType: string;
  contentLength: number;
}

export interface ObjectVerifyResult {
  key: string;
  ok: boolean;
  exists: boolean;
  contentLength?: number;
  contentType?: string;
  error?: string;
}

export async function headR2Object(key: string): Promise<{
  exists: boolean;
  contentLength?: number;
  contentType?: string;
}> {
  const config = requireR2Config();
  const client = createR2Client(config);
  try {
    const result = await client.send(
      new HeadObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }),
    );
    return {
      exists: true,
      contentLength: result.ContentLength,
      contentType: result.ContentType,
    };
  } catch (error) {
    const name =
      error && typeof error === "object" && "name" in error
        ? String((error as { name: string }).name)
        : "";
    const status =
      error && typeof error === "object" && "$metadata" in error
        ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata
            ?.httpStatusCode
        : undefined;
    if (name === "NotFound" || name === "NoSuchKey" || status === 404) {
      return { exists: false };
    }
    throw error;
  }
}

export async function verifyR2Objects(
  expected: ExpectedObject[],
): Promise<{ ok: boolean; results: ObjectVerifyResult[] }> {
  const results: ObjectVerifyResult[] = [];

  for (const item of expected) {
    try {
      const head = await headR2Object(item.key);
      if (!head.exists) {
        results.push({
          key: item.key,
          ok: false,
          exists: false,
          error: "Object not found",
        });
        continue;
      }

      const lengthOk = head.contentLength === item.contentLength;
      const typeOk =
        !head.contentType ||
        head.contentType.split(";")[0].trim().toLowerCase() ===
          item.contentType.split(";")[0].trim().toLowerCase();

      if (!lengthOk) {
        results.push({
          key: item.key,
          ok: false,
          exists: true,
          contentLength: head.contentLength,
          contentType: head.contentType,
          error: `Size mismatch: expected ${item.contentLength}, got ${head.contentLength ?? "unknown"}`,
        });
        continue;
      }

      if (!typeOk) {
        results.push({
          key: item.key,
          ok: false,
          exists: true,
          contentLength: head.contentLength,
          contentType: head.contentType,
          error: `Content-Type mismatch: expected ${item.contentType}, got ${head.contentType ?? "unknown"}`,
        });
        continue;
      }

      results.push({
        key: item.key,
        ok: true,
        exists: true,
        contentLength: head.contentLength,
        contentType: head.contentType,
      });
    } catch (error) {
      results.push({
        key: item.key,
        ok: false,
        exists: false,
        error: error instanceof Error ? error.message : "HeadObject failed",
      });
    }
  }

  return {
    ok: results.every((r) => r.ok),
    results,
  };
}
