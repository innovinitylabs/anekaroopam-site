import type { MetadataRoute } from "next";
import { listAllArchiveSlugs } from "@/lib/content/resolve-artwork";

const SITE_URL = "https://anekaroopam.art";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await listAllArchiveSlugs();
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
    },
    {
      url: `${SITE_URL}/archive`,
      lastModified: new Date(),
    },
    ...slugs.map((slug) => ({
      url: `${SITE_URL}/archive/${slug}`,
      lastModified: new Date(),
    })),
  ];
}
