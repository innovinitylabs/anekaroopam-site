import { redirect } from "next/navigation";

/**
 * Edit an existing archive: durable R2/GitHub mode does not materialize
 * binaries onto disk. The wizard loads metadata via ?edit=slug.
 */
export default async function AdminEditPublishedArchivePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/admin/new?edit=${encodeURIComponent(slug)}`);
}
