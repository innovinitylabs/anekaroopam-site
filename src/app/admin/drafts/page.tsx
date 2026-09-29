import { redirect } from "next/navigation";

/** Legacy drafts route — keep for bookmarks; redirect to dashboard tab. */
export default function AdminDraftsRedirectPage() {
  redirect("/admin?tab=drafts");
}
