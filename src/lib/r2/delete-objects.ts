/**
 * Delete R2 objects by exact key. Never list-by-prefix.
 */

import "server-only";

import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { createR2Client, getR2ClientOrNull } from "@/lib/r2/client";
import { getR2Config, requireR2Config } from "@/lib/r2/config";

export type R2DeleteResult = {
  deleted: string[];
  failed: Array<{ key: string; error: string }>;
};

const BATCH = 100;

export async function deleteR2Objects(
  keys: string[],
  options?: {
    deleteMany?: (keys: string[]) => Promise<R2DeleteResult>;
  },
): Promise<R2DeleteResult> {
  const unique = [...new Set(keys.filter(Boolean))];
  if (unique.length === 0) {
    return { deleted: [], failed: [] };
  }

  if (options?.deleteMany) {
    return options.deleteMany(unique);
  }

  const client = getR2ClientOrNull() ?? createR2Client(requireR2Config());
  const config = getR2Config() ?? requireR2Config();
  const deleted: string[] = [];
  const failed: Array<{ key: string; error: string }> = [];

  for (let i = 0; i < unique.length; i += BATCH) {
    const chunk = unique.slice(i, i + BATCH);
    try {
      const res = await client.send(
        new DeleteObjectsCommand({
          Bucket: config.bucket,
          Delete: {
            Objects: chunk.map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      );
      const errorKeys = new Set(
        (res.Errors ?? [])
          .map((e) => e.Key)
          .filter((k): k is string => Boolean(k)),
      );
      for (const e of res.Errors ?? []) {
        failed.push({
          key: e.Key ?? "(unknown)",
          error: e.Message ?? e.Code ?? "delete failed",
        });
      }
      for (const key of chunk) {
        if (!errorKeys.has(key)) deleted.push(key);
      }
    } catch {
      for (const key of chunk) {
        try {
          await client.send(
            new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
          );
          deleted.push(key);
        } catch (oneErr) {
          failed.push({
            key,
            error: oneErr instanceof Error ? oneErr.message : "delete failed",
          });
        }
      }
    }
  }

  return { deleted, failed };
}
