import "server-only";

import { cookies } from "next/headers";
import {
  ADMIN_SESSION_COOKIE,
  checkAdminSessionToken,
  type AdminAuthFailure,
} from "./admin-guard";

/**
 * Server-side gate for admin pages. Must run before any private archive data is
 * fetched: AdminUnlock is a client component and cannot keep server-rendered
 * children out of the HTML / RSC payload.
 */
export async function getAdminPageAuthFailure(): Promise<AdminAuthFailure | null> {
  const store = await cookies();
  return checkAdminSessionToken(store.get(ADMIN_SESSION_COOKIE)?.value);
}
