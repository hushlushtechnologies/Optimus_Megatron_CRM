import { createClient } from "@/src/lib/supabase/server";
import {
  AGGREGATE_PAGE,
  figureFailed,
  figureFrom,
  figureOf,
  interpretCounted,
  type ReportFigure,
} from "@/src/lib/supabase/report-aggregate";
import { averageFils, money, sumFils, type Money } from "@/src/lib/utils/report-money";
import { resolveReportRange, type ReportRangeId } from "@/src/lib/utils/report-time";
import type { ReportFilters } from "@/src/lib/utils/report-filters";
import type { NamedCount } from "@/src/lib/types/report-customers";
import {
  LOYALTY_ENTRY_LABELS,
  LOYALTY_ENTRY_TYPES,
  PROMOTION_LIVE_STATUS,
  PROMOTION_PAUSED_STATUS,
  type CampaignPerformanceRow,
  type LoyaltyEntryType,
  type PointsMovementRow,
  type PromotionsReportData,
} from "@/src/lib/types/report-promotions";

/*
|--------------------------------------------------------------------------
| THE PROMOTIONS AND LOYALTY REPORT
|--------------------------------------------------------------------------
|
| Three date bases, each the honest one for its own table:
|
|   campaigns     starts_at / ends_at   when the campaign was running
|   redemptions   redeemed_at           when the discount was applied
|   points        created_at            when the entry was written
|
| Note redeemed_at, not created_at. offer_redemptions carries both, and they
| differ: a redemption recorded today against a deal closed last week is a
| last-week discount. Sprint 8 learned this the hard way on the export.
|
| The live and paused campaign counts, and the wallet count, deliberately
| ignore the period. A campaign that is live is live now; a balance that is
| held is held now. Filtering those by a date range would produce a figure
| that reads like a current state and is not one. The metric definitions say
| so on the page and in the export.
*/

interface RedemptionRow {
  discount_fils: number | string | null;
  reversed_at: string | null;
  promotion_id: string | null;
}

interface CampaignRow {
  id: string;
  name: string;
  reference: string | null;
  status: string;
  discount_type: string | null;
}

interface LedgerRow {
  entry_type: string;
  points: number | null;
}

export async function getPromotionsReport(
  range: ReportRangeId,
  filters: ReportFilters,
  options: { customFrom?: string; customTo?: string } = {},
): Promise<PromotionsReportData> {
  const supabase = await createClient();

  const resolved = resolveReportRange(range, {
    customFrom: options.customFrom,
    customTo: options.customTo,
  });

  const { fromIso, toIso, label: rangeLabel } = resolved;

  const { data: settings } = await supabase.from("sales_settings").select("currency").maybeSingle();
  const currency = (settings?.currency as string | undefined) ?? "AED";

  /* ---- campaigns ---- */

  const liveQuery = supabase
    .from("promotions")
    .select("id", { count: "exact", head: true })
    .is("archived_at", null)
    .eq("status", PROMOTION_LIVE_STATUS);

  const pausedQuery = supabase
    .from("promotions")
    .select("id", { count: "exact", head: true })
    .is("archived_at", null)
    .eq("status", PROMOTION_PAUSED_STATUS);

  /*
   * "Running in the period" is an overlap, not a containment: a campaign
   * that started in October and ends in December was running through all of
   * November. Asking for campaigns that started inside the window would
   * miss it, and that is the campaign most likely to matter.
   *
   * A null ends_at means open-ended, so it overlaps anything after its
   * start — hence the or() rather than a plain comparison.
   */
  let overlapQuery = supabase
    .from("promotions")
    .select("id", { count: "exact", head: true })
    .is("archived_at", null)
    .lt("starts_at", toIso);

  if (fromIso) overlapQuery = overlapQuery.or(`ends_at.is.null,ends_at.gte.${fromIso}`);

  const campaignListQuery = supabase
    .from("promotions")
    .select("id, name, reference, status, discount_type", { count: "exact" })
    .is("archived_at", null)
    .limit(AGGREGATE_PAGE);

  /* ---- redemptions, by when the discount was applied ---- */

  let redemptionsQuery = supabase
    .from("offer_redemptions")
    .select("discount_fils, reversed_at, promotion_id", { count: "exact" })
    .lt("redeemed_at", toIso)
    .limit(AGGREGATE_PAGE);

  if (fromIso) redemptionsQuery = redemptionsQuery.gte("redeemed_at", fromIso);

  /* ---- the points ledger ---- */

  let ledgerQuery = supabase
    .from("loyalty_ledger")
    .select("entry_type, points", { count: "exact" })
    .lt("created_at", toIso)
    .limit(AGGREGATE_PAGE);

  if (fromIso) ledgerQuery = ledgerQuery.gte("created_at", fromIso);

  const walletsQuery = supabase
    .from("loyalty_wallets")
    .select("customer_id", { count: "exact", head: true })
    .gt("available_points", 0);

  const [live, paused, overlap, campaignList, redemptions, ledger, wallets] = await Promise.all([
    liveQuery,
    pausedQuery,
    overlapQuery,
    campaignListQuery,
    redemptionsQuery,
    ledgerQuery,
    walletsQuery,
  ]);

  /* ---- head counts ---- */

  const headFigure = (
    result: { count: number | null; error: { message: string } | null },
  ): ReportFigure<number> =>
    result.error ? figureFailed<number>(result.error.message) : figureOf(result.count ?? 0);

  /* ---- redemptions ---- */

  const countedRedemptions = interpretCounted<RedemptionRow>(
    redemptions,
    AGGREGATE_PAGE,
    "promotion redemptions",
  );

  /*
   * The split that this whole report turns on. A reversed redemption is a
   * real historical event and a discount that was not, in the end, given.
   * Both halves are kept and reported; neither is folded into the other.
   */
  const liveRedemptions = countedRedemptions.rows.filter((row) => row.reversed_at === null);
  const reversedRedemptions = countedRedemptions.rows.filter((row) => row.reversed_at !== null);

  const discountOf = (rows: RedemptionRow[]): Money =>
    money(sumFils(rows, (row) => row.discount_fils), currency);

  const discountGiven = figureFrom(countedRedemptions, () => discountOf(liveRedemptions));

  const averageDiscount = figureFrom<RedemptionRow, Money | null>(countedRedemptions, () => {
    /* averageFils returns null on an empty count, which is the same answer
     * this figure wants: no redemptions means there is no average, not an
     * average of nought. */
    const average = averageFils(
      sumFils(liveRedemptions, (row) => row.discount_fils),
      liveRedemptions.length,
    );

    return average === null ? null : money(average, currency);
  });

  /* ---- campaign performance ---- */

  const countedCampaigns = interpretCounted<CampaignRow>(
    campaignList,
    AGGREGATE_PAGE,
    "campaigns",
  );

  const byCampaign = figureFrom<CampaignRow, CampaignPerformanceRow[]>(countedCampaigns, (rows) => {
    if (countedRedemptions.error) return [];

    const live = new Map<string, RedemptionRow[]>();
    const reversed = new Map<string, number>();

    for (const row of liveRedemptions) {
      if (!row.promotion_id) continue;
      const existing = live.get(row.promotion_id);
      if (existing) existing.push(row);
      else live.set(row.promotion_id, [row]);
    }

    for (const row of reversedRedemptions) {
      if (!row.promotion_id) continue;
      reversed.set(row.promotion_id, (reversed.get(row.promotion_id) ?? 0) + 1);
    }

    return rows
      .map((campaign) => {
        const mine = live.get(campaign.id) ?? [];

        return {
          id: campaign.id,
          name: campaign.name,
          reference: campaign.reference,
          status: campaign.status,
          redemptions: mine.length,
          reversals: reversed.get(campaign.id) ?? 0,
          discount: discountOf(mine),
        };
      })
      /* Campaigns with no activity in the period are noise in a period
       * report — they are already on the campaigns list page. */
      .filter((row) => row.redemptions > 0 || row.reversals > 0)
      .sort(
        (a, b) =>
          Number(BigInt(b.discount.fils) - BigInt(a.discount.fils)) ||
          b.redemptions - a.redemptions ||
          a.name.localeCompare(b.name),
      );
  });

  const byDiscountType = figureFrom<CampaignRow, NamedCount[]>(countedCampaigns, (rows) => {
    const groups = new Map<string, number>();

    for (const row of rows) {
      const name = row.discount_type?.trim() || "Not set";
      groups.set(name, (groups.get(name) ?? 0) + 1);
    }

    return Array.from(groups.entries())
      .map(([name, count]) => ({ id: name, name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  });

  /* ---- loyalty ---- */

  const countedLedger = interpretCounted<LedgerRow>(ledger, AGGREGATE_PAGE, "loyalty ledger");

  const sumWhere = (rows: LedgerRow[], type: LoyaltyEntryType): number =>
    rows.reduce((total, row) => (row.entry_type === type ? total + (row.points ?? 0) : total), 0);

  /*
   * Redeem and expire are stored negative, by the table's own CHECK
   * constraint. Reported as positive here, because "points redeemed: -4,200"
   * invites somebody to add it to the earn figure and get a number that is
   * neither the net nor the gross.
   */
  const pointsEarned = figureFrom(countedLedger, (rows) => sumWhere(rows, "earn"));
  const pointsRedeemed = figureFrom(countedLedger, (rows) => Math.abs(sumWhere(rows, "redeem")));
  const pointsExpired = figureFrom(countedLedger, (rows) => Math.abs(sumWhere(rows, "expire")));

  const pointsNet = figureFrom(countedLedger, (rows) =>
    rows.reduce((total, row) => total + (row.points ?? 0), 0),
  );

  const pointsMovement = figureFrom<LedgerRow, PointsMovementRow[]>(countedLedger, (rows) =>
    LOYALTY_ENTRY_TYPES.map((type) => ({
      id: type,
      label: LOYALTY_ENTRY_LABELS[type],
      entries: rows.filter((row) => row.entry_type === type).length,
      points: sumWhere(rows, type),
    })).filter((row) => row.entries > 0),
  );

  return {
    liveCampaigns: headFigure(live),
    pausedCampaigns: headFigure(paused),
    campaignsInPeriod: headFigure(overlap),

    redemptions: figureFrom(countedRedemptions, () => liveRedemptions.length),
    reversals: figureFrom(countedRedemptions, () => reversedRedemptions.length),
    discountGiven,
    discountReversed: figureFrom(countedRedemptions, () => discountOf(reversedRedemptions)),
    averageDiscount,

    byCampaign,
    byDiscountType,

    pointsEarned,
    pointsRedeemed,
    pointsExpired,
    pointsNet,
    walletsWithBalance: headFigure(wallets),

    pointsMovement,

    currency,
    rangeLabel,
  };
}

/* Unused import guard: filters are accepted for signature parity with the
 * other report queries. This report has no filters of its own yet — the
 * section registry lists none for it, so parseReportFilters returns an
 * empty set and there is nothing here to narrow. */
export type { ReportFilters };
