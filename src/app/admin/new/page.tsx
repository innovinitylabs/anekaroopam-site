import { IngestionWizard } from "@/components/admin/IngestionWizard";

export default async function AdminNewAccessionPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string; edit?: string; local?: string }>;
}) {
  const { draft, edit } = await searchParams;
  return (
    <IngestionWizard initialDraftId={draft} initialEditSlug={edit} />
  );
}
