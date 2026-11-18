import { createClient } from "@/src/lib/supabase/server";
import { isUuid } from "@/src/lib/utils/search-term";
import type { SalesDealStatus } from "@/src/lib/types/sales";

/*
|--------------------------------------------------------------------------
| TEST DRIVE ↔ SALES (Phase 15, Features 5 and 6)
|--------------------------------------------------------------------------
|
| Two small reads that keep the Test Drive module and the Sales module aware
| of each other without either one absorbing the other.
*/

/** The deal that was started from one test drive. */
export interface TestDriveDealLink {
  id: string;
  deal_number: string;
  status: SalesDealStatus;
  vehicle_title: string;
  owner_name: string | null;
  created_at: string;
}

/** Null means the lookup failed; undefined-free "no deal" is an empty result. */
export type TestDriveDealResult = { status: "ok"; deal: TestDriveDealLink | null } | { status: "error" };

const DEAL_COLUMNS = "id, deal_number, status, vehicle_title, owner_name, created_at";

/**
 * The deal created from this test drive, if any.
 *
 * Reads sales_deal_list so row-level security applies: a person who may not
 * see the deal gets "no deal" rather than a link they cannot open.
 */
export async function getDealForTestDrive(testDriveId: string): Promise<TestDriveDealResult> {
  if (!isUuid(testDriveId)) return { status: "ok", deal: null };

  const supabase = await createClient();

  /*
   * Two steps on purpose. source_test_drive_id lives on the sales_deals
   * table, and the reporting view sales_deal_list is left exactly as Phase
   * 1-14 built it, so nothing about the view has to change for Phase 15.
   *
   * The second read goes through the view, so its row-level policies decide
   * what the signed-in person sees: someone without access to the deal gets
   * "no deal" rather than a link they cannot open.
   */
  const { data: base, error: baseError } = await supabase
    .from("sales_deals")
    .select("id")
    .eq("source_test_drive_id", testDriveId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (baseError) {
    console.error("getDealForTestDrive base error:", baseError);
    return { status: "error" };
  }

  const dealId = (base as { id: string } | null)?.id;
  if (!dealId) return { status: "ok", deal: null };

  const { data, error } = await supabase
    .from("sales_deal_list")
    .select(DEAL_COLUMNS)
    .eq("id", dealId)
    .maybeSingle();

  if (error) {
    console.error("getDealForTestDrive view error:", error);
    return { status: "error" };
  }

  return { status: "ok", deal: data ? (data as unknown as TestDriveDealLink) : null };
}

/**
 * The number of the test drive a deal was started from, or null.
 *
 * Only the number is needed: the Deal Detail card shows it as provenance, and
 * the drive itself is listed alongside with its own link.
 */
export async function getSourceTestDriveForDeal(dealId: string): Promise<string | null> {
  if (!isUuid(dealId)) return null;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sales_deals")
    .select(
      "source_test_drive_id, source_drive:test_drives!sales_deals_source_test_drive_id_fkey(test_drive_number)",
    )
    .eq("id", dealId)
    .maybeSingle();

  if (error) {
    console.error("getSourceTestDriveForDeal error:", error);
    return null;
  }

  const row = data as unknown as {
    source_test_drive_id: string | null;
    source_drive: { test_drive_number: string } | { test_drive_number: string }[] | null;
  } | null;

  if (!row?.source_test_drive_id) return null;

  const drive = Array.isArray(row.source_drive) ? row.source_drive[0] : row.source_drive;
  return drive?.test_drive_number ?? null;
}
