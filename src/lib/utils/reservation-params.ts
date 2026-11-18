import type { ReservationSort, ReservationTab } from "@/src/lib/types/reservations";
import type { ReservationSource } from "@/src/lib/types/sales";
import { readParam } from "@/src/lib/utils/test-drive-list-filters";

export const RESERVATION_PAGE_SIZES = [10, 25, 50, 100];
export const DEFAULT_RESERVATION_PAGE_SIZE = 25;
export const DEFAULT_RESERVATION_TAB: ReservationTab = "active";
export const UNASSIGNED_RESERVATION_OWNER = "unassigned";

export const RESERVATION_SOURCE_LABELS: Record<ReservationSource, string> = {
  staff: "Staff",
  phone: "Phone",
  walk_in: "Walk-in",
  website: "Website",
};

const TABS: ReservationTab[] = ["requests", "active", "history", "all"];
const SORTS: ReservationSort[] = ["expiry", "oldest", "newest", "recently-updated"];
const SOURCES = Object.keys(RESERVATION_SOURCE_LABELS) as ReservationSource[];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ReservationListParams {
  page: number;
  pageSize: number;
  tab: ReservationTab;
  /** null means "use the best order for this tab". */
  sort: ReservationSort | null;
  search: string;
  showroom: string | null;
  /** An owner id, or "unassigned". */
  owner: string | null;
  source: ReservationSource | null;
}

export function parseReservationParams(
  params: Record<string, string | string[] | undefined>,
): ReservationListParams {
  const page = Math.max(1, Math.floor(Number(readParam(params, "page"))) || 1);

  const requestedSize = Math.floor(Number(readParam(params, "pageSize")));
  const pageSize = RESERVATION_PAGE_SIZES.includes(requestedSize)
    ? requestedSize
    : DEFAULT_RESERVATION_PAGE_SIZE;

  const tabRaw = readParam(params, "tab");
  const sortRaw = readParam(params, "sort");
  const showroomRaw = readParam(params, "showroom");
  const ownerRaw = readParam(params, "owner");
  const sourceRaw = readParam(params, "source");

  return {
    page,
    pageSize,
    tab: TABS.includes(tabRaw as ReservationTab) ? (tabRaw as ReservationTab) : DEFAULT_RESERVATION_TAB,
    sort: SORTS.includes(sortRaw as ReservationSort) ? (sortRaw as ReservationSort) : null,
    search: readParam(params, "q").slice(0, 100),
    showroom: UUID_RE.test(showroomRaw) ? showroomRaw.toLowerCase() : null,
    owner:
      ownerRaw === UNASSIGNED_RESERVATION_OWNER
        ? UNASSIGNED_RESERVATION_OWNER
        : UUID_RE.test(ownerRaw)
          ? ownerRaw.toLowerCase()
          : null,
    source: SOURCES.includes(sourceRaw as ReservationSource) ? (sourceRaw as ReservationSource) : null,
  };
}

/** Active holds by soonest expiry, requests by longest wait, everything else newest first. */
export function effectiveReservationSort(tab: ReservationTab, sort: ReservationSort | null): ReservationSort {
  if (sort) return sort;
  if (tab === "active") return "expiry";
  if (tab === "requests") return "oldest";
  return "newest";
}

export function buildReservationSearchParams(input: ReservationListParams): URLSearchParams {
  const params = new URLSearchParams({ page: String(input.page), pageSize: String(input.pageSize) });
  if (input.tab !== DEFAULT_RESERVATION_TAB) params.set("tab", input.tab);
  if (input.sort) params.set("sort", input.sort);
  if (input.search) params.set("q", input.search);
  if (input.showroom) params.set("showroom", input.showroom);
  if (input.owner) params.set("owner", input.owner);
  if (input.source) params.set("source", input.source);
  return params;
}
