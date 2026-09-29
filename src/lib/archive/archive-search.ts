/**
 * Shared public archive search/filter contract.
 * Params: q, year, process, sort, limit, offset
 */

export type ArchiveSearchSort = "updated_desc" | "year_desc" | "title_asc";

export type ArchiveSearchParams = {
  q?: string;
  year?: number;
  process?: string;
  sort?: ArchiveSearchSort;
  limit?: number;
  offset?: number;
};

const SORT_VALUES = new Set<ArchiveSearchSort>([
  "updated_desc",
  "year_desc",
  "title_asc",
]);

export function parseArchiveSearchParams(
  input: Record<string, string | string[] | undefined> | URLSearchParams,
): ArchiveSearchParams {
  const get = (key: string): string | undefined => {
    if (input instanceof URLSearchParams) {
      return input.get(key) ?? undefined;
    }
    const raw = input[key];
    if (Array.isArray(raw)) return raw[0];
    return raw;
  };

  const q = get("q")?.trim() || undefined;
  const yearRaw = get("year");
  const process = get("process")?.trim() || undefined;
  const sortRaw = get("sort") || undefined;
  const limitRaw = get("limit");
  const offsetRaw = get("offset");

  const year =
    yearRaw && Number.isInteger(Number(yearRaw))
      ? Number(yearRaw)
      : undefined;

  const sort =
    sortRaw && SORT_VALUES.has(sortRaw as ArchiveSearchSort)
      ? (sortRaw as ArchiveSearchSort)
      : "updated_desc";

  const limit = limitRaw ? Math.min(Math.max(Number(limitRaw) || 48, 1), 100) : 48;
  const offset = offsetRaw ? Math.max(Number(offsetRaw) || 0, 0) : 0;

  return { q, year, process, sort, limit, offset };
}

export function archiveSearchToQueryString(
  params: ArchiveSearchParams,
): string {
  const sp = new URLSearchParams();
  if (params.q?.trim()) sp.set("q", params.q.trim());
  if (params.year != null) sp.set("year", String(params.year));
  if (params.process?.trim()) sp.set("process", params.process.trim());
  if (params.sort && params.sort !== "updated_desc") {
    sp.set("sort", params.sort);
  }
  if (params.limit != null && params.limit !== 48) {
    sp.set("limit", String(params.limit));
  }
  if (params.offset != null && params.offset > 0) {
    sp.set("offset", String(params.offset));
  }
  return sp.toString();
}

export function matchesArchiveSearch(
  artwork: {
    id: string;
    metadata: {
      title: string;
      year?: number;
      process?: string;
      accessionId?: string;
    };
  },
  filters: ArchiveSearchParams,
): boolean {
  if (filters.year != null && artwork.metadata.year !== filters.year) {
    return false;
  }
  if (
    filters.process &&
    (artwork.metadata.process || "").toLowerCase() !==
      filters.process.toLowerCase()
  ) {
    return false;
  }
  const q = filters.q?.trim().toLowerCase();
  if (!q) return true;
  const title = artwork.metadata.title.toLowerCase();
  const accession = (artwork.metadata.accessionId || "").toLowerCase();
  const slug = artwork.id.toLowerCase();
  return title.includes(q) || accession.includes(q) || slug.includes(q);
}
