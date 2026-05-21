import { IngestionWizard } from "@/components/admin/IngestionWizard";

export default async function AdminNewAccessionPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const { draft } = await searchParams;
  return <IngestionWizard initialDraftId={draft} />;
}
