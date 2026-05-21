export function isAdminIngestEnabled(): boolean {
  return process.env.ADMIN_INGEST_ENABLED === "true";
}
