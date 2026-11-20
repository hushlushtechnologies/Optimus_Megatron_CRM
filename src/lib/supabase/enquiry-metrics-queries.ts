import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { getEnquiryWorkflow } from "@/src/lib/supabase/enquiry-workflow-queries";
import { closedStatusKeys } from "@/src/lib/utils/enquiry-workflow";
import {
  computeEnquiryMetrics,
  type MetricsDreamRow,
  type MetricsEnquiryRow,
  type MetricsFollowUpRow,
} from "@/src/lib/utils/enquiry-metrics";
import type { EnquiryMetrics } from "@/src/lib/types/enquiry-metrics";

/*
|--------------------------------------------------------------------------
| THE PREPARED METRICS — READS ONLY
|--------------------------------------------------------------------------
|
| Phase 20 asks for the nine figures to be prepared and for the Analytics
| module to come later, so this is the data and the arithmetic and nothing
| else: no dashboard, no charts, no page.
|
| Three reads, then computeEnquiryMetrics does the sums. The split is on
| purpose — every definition that could be subtly wrong (what counts as a
| reply, what counts as on time, what spam does to a rate) lives in a pure
| function with a worked example behind it, and this file only fetches.
|
| Aggregation happens in TypeScript because PostgREST has no GROUP BY. That
| is the same approach getEnquirySummary already takes for its trend.
*/

/** The most rows one window will read. Beyond this the figures are a sample. */
const METRICS_ROW_CAP = 5000;

interface MetricsWindow {
  /** Inclusive. */
  from: Date;
  /** Exclusive. */
  to: Date;
}

export async function getEnquiryMetrics(window: MetricsWindow): Promise<EnquiryMetrics | null> {
  const supabase = await createClient();

  const from = window.from.toISOString();
  const to = window.to.toISOString();

  const workflow = await getEnquiryWorkflow();
  const closedStatuses = new Set(closedStatusKeys(workflow));

  const { data: enquiryData, error: enquiryError } = await supabase
    .from("enquiry_list")
    .select("id, enquiry_type, source, status, assigned_to_name, created_at, status_is_open")
    .gte("created_at", from)
    .lt("created_at", to)
    .is("archived_at", null)
    /* Junk is not performance: it belongs in neither half of a rate. */
    .neq("status", "Spam")
    .limit(METRICS_ROW_CAP);

  if (enquiryError) {
    console.error("getEnquiryMetrics enquiries error:", enquiryError);
    return null;
  }

  const enquiries = (enquiryData ?? []) as unknown as MetricsEnquiryRow[];
  const ids = enquiries.map((row) => row.id);

  /* ---- Follow-ups belonging to those enquiries ---- */

  let followUps: MetricsFollowUpRow[] = [];

  if (ids.length > 0) {
    const { data, error } = await supabase
      .from("enquiry_follow_ups")
      .select("enquiry_id, type, status, scheduled_at, completed_at")
      .in("enquiry_id", ids)
      .limit(METRICS_ROW_CAP);

    if (error) console.error("getEnquiryMetrics follow-ups error:", error);
    else followUps = (data ?? []) as unknown as MetricsFollowUpRow[];
  }

  /* ---- Dream car briefs among them ---- */

  type RawDreamRow = {
    enquiry_id: string;
    brand_other: string | null;
    matched_car_id: string | null;
    brands: { name: string } | { name: string }[] | null;
  };

  let dreamCars: MetricsDreamRow[] = [];

  if (ids.length > 0) {
    const { data, error } = await supabase
      .from("enquiry_dream_car_details")
      .select("enquiry_id, brand_other, matched_car_id, brands ( name )")
      .in("enquiry_id", ids)
      .limit(METRICS_ROW_CAP);

    if (error) {
      console.error("getEnquiryMetrics dream cars error:", error);
    } else {
      dreamCars = ((data ?? []) as unknown as RawDreamRow[]).map((row) => ({
        enquiry_id: row.enquiry_id,
        brand_other: row.brand_other,
        matched_car_id: row.matched_car_id,
        /* The embed arrives as an object or a one-item array. */
        brandName: Array.isArray(row.brands) ? (row.brands[0]?.name ?? null) : (row.brands?.name ?? null),
      }));
    }
  }

  return computeEnquiryMetrics({
    from,
    to,
    enquiries,
    followUps,
    dreamCars,
    closedStatuses,
    capped:
      enquiries.length >= METRICS_ROW_CAP ||
      followUps.length >= METRICS_ROW_CAP ||
      dreamCars.length >= METRICS_ROW_CAP,
  });
}
