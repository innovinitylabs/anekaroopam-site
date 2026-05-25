import { redirect } from "next/navigation";
import { hydrateDraftFromArchiveSlug } from "@/lib/archive/draft-store";

export default async function AdminEditPublishedArchivePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const draft = await hydrateDraftFromArchiveSlug(slug);
  redirect(`/admin/new?draft=${encodeURIComponent(draft.draftId)}`);
}
