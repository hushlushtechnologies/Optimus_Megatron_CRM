"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { beginSalesAction, requireSalesPermission } from "@/src/lib/supabase/sales-permissions";
import type { SalesSupabaseClient } from "@/src/lib/supabase/sales-permissions";
import {
  getCustomerById,
  getOpenLeadsForCustomer,
  getVehicleById,
  searchCustomers,
  searchVehicles,
   
  getTestDriveById,
} from "@/src/lib/supabase/test-drive-form-queries";
import { createDealSchema } from "@/src/lib/validation/sales-deal";
import { describeVehicleContext } from "@/src/lib/utils/sales-deal-form";
import { filsToDecimalString, toFils } from "@/src/lib/utils/sales-money";
import { SALES_PERMISSION_KEYS } from "@/src/lib/utils/sales-permissions";
import { mapSalesDbError } from "@/src/lib/utils/sales-errors";
import type {
  CreateDealResult,
  VehicleDealContext,
  VehicleDealContextResult,
} from "@/src/lib/types/sales-deal-form";
import type {
  SearchResult,
  TestDriveCustomerOption,
  TestDriveLeadOption,
  TestDriveVehicleOption,
} from "@/src/lib/types/test-drive";

// --- Searches for the form (read-only) ---

export async function searchDealCustomersAction(query: string): Promise<SearchResult<TestDriveCustomerOption>> {
  if (typeof query !== "string") return { results: [], failed: true };
  const permission = await requireSalesPermission("create");
  if (!permission.allowed) return { results: [], failed: true };
  return searchCustomers(query);
}

export async function searchDealVehiclesAction(query: string): Promise<SearchResult<TestDriveVehicleOption>> {
  if (typeof query !== "string") return { results: [], failed: true };
  const permission = await requireSalesPermission("create");
  if (!permission.allowed) return { results: [], failed: true };
  return searchVehicles(query);
}

export async function getDealCustomerLeadsAction(customerId: string): Promise<SearchResult<TestDriveLeadOption>> {
  const permission = await requireSalesPermission("create");
  if (!permission.allowed) return { results: [], failed: true };
  if (!z.string().uuid().safeParse(customerId).success) return { results: [], failed: true };
  return getOpenLeadsForCustomer(customerId);
}

// --- Vehicle context ---

interface ContextRow {
  holder_status: "Reserved" | "Confirmed" | "Completed" | null;
  holder_deal_number: string | null;
  open_deals: number | string | null;
  reservation_number: string | null;
  reservation_expires_at: string | null;
  customer_open_deal_number: string | null;
  lead_deal_number: string | null;
  listed_price: number | string | null;
}

async function fetchContext(
  supabase: SalesSupabaseClient,
  carId: string,
  customerId: string | null,
  leadId: string | null,
): Promise<VehicleDealContext | null> {
  const { data, error } = await supabase.rpc("get_vehicle_deal_context", {
    p_car_id: carId,
    p_customer_id: customerId,
    p_lead_id: leadId,
  });

  if (error) {
    console.error("get_vehicle_deal_context error:", error);
    return null;
  }

  const row = (Array.isArray(data) ? data[0] : data) as ContextRow | undefined;
  if (!row) return null;

  return {
    holderStatus: row.holder_status,
    holderDealNumber: row.holder_deal_number,
    openDeals: Number(row.open_deals ?? 0),
    reservationNumber: row.reservation_number,
    reservationExpiresAt: row.reservation_expires_at,
    customerOpenDealNumber: row.customer_open_deal_number,
    leadDealNumber: row.lead_deal_number,
    listedPrice: row.listed_price === null || row.listed_price === undefined ? null : Number(row.listed_price),
  };
}

const contextInputSchema = z.object({
  carId: z.string().uuid(),
  customerId: z.string().uuid().nullable(),
  leadId: z.string().uuid().nullable(),
});

export async function getVehicleDealContextAction(input: unknown): Promise<VehicleDealContextResult> {
  const start = await beginSalesAction("create");
  if (!start.ok) return { status: "error" };

  const parsed = contextInputSchema.safeParse(input);
  if (!parsed.success) return { status: "error" };

  const context = await fetchContext(start.supabase, parsed.data.carId, parsed.data.customerId, parsed.data.leadId);
  return context ? { status: "ok", context } : { status: "error" };
}

// --- Create ---

function decimalOrNull(value: string): string | null {
  if (value === "") return null;
  const fils = toFils(value);
  return fils === null ? null : filsToDecimalString(fils);
}

export async function createDealAction(input: unknown): Promise<CreateDealResult> {
  const start = await beginSalesAction("create");
  if (!start.ok) return { error: start.error };

  const parsed = createDealSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form and try again." };
  }
  const v = parsed.data;
  const { supabase, userId, permissions } = start;

  // 1. The records the form points at must still exist and be usable.
  const [customer, vehicle] = await Promise.all([getCustomerById(v.customerId), getVehicleById(v.carId)]);
  if (!customer) return { error: "That customer could not be found. Please search again." };
  if (!vehicle) return { error: "That vehicle could not be found, or it has been archived." };

  const { data: location, error: locationError } = await supabase
    .from("locations")
    .select("id")
    .eq("id", v.locationId)
    .eq("is_active", true)
    .maybeSingle();
  if (locationError) console.error("createDealAction location error:", locationError);
  if (!location) return { error: "That showroom could not be found." };

  // 2. Owner: yourself, or anyone if you may assign. Either way they must be able to own deals.
  if (v.ownerId) {
    if (v.ownerId !== userId && !permissions.assign) {
      return { error: "You can only create deals for yourself. Ask a manager to assign someone else." };
    }
    const { data: eligible, error: eligibleError } = await supabase.rpc("has_permission", {
      uid: v.ownerId,
      perm: SALES_PERMISSION_KEYS.create,
    });
    if (eligibleError || eligible !== true) return { error: "That person can't own deals." };
  }

  // 3. The lead must be this customer's, open, and not archived.
  if (v.leadId) {
    const { data: lead } = await supabase
      .from("leads")
      .select("customer_id, archived_at, stage:lead_stages(stage_type)")
      .eq("id", v.leadId)
      .maybeSingle();

    const leadRow = lead as unknown as {
      customer_id: string;
      archived_at: string | null;
      stage: { stage_type: string } | null;
    } | null;

    if (!leadRow || leadRow.archived_at) return { error: "That lead could not be found." };
    if (leadRow.customer_id !== v.customerId) return { error: "The selected lead belongs to a different customer." };
    if (leadRow.stage?.stage_type !== "open") return { error: "That lead is already closed. Choose an open lead." };
  }

    // 3b. A test drive this deal came from must be this customer's, and for this vehicle.
  //     The link records provenance, so a mismatched one is worse than none.
  if (v.testDriveId) {
    const drive = await getTestDriveById(v.testDriveId);

    if (!drive) return { error: "That test drive could not be found." };
    if (drive.customer_id !== v.customerId) {
      return { error: "That test drive belongs to a different customer." };
    }
    if (drive.car_id !== v.carId) {
      return { error: "That test drive was for a different vehicle. Choose the matching vehicle." };
    }
  }



  // 4. The vehicle must be fit to start a deal on. The database refuses to reserve or confirm
  //    a vehicle someone else holds. This stops pointless drafts being created.
  const context = await fetchContext(supabase, v.carId, v.customerId, v.leadId);
  const messages = describeVehicleContext(context, vehicle);
  if (messages.blockers.length > 0) return { error: messages.blockers[0] };

  // 5. Save as a draft.
  const { data: created, error: insertError } = await supabase
    .from("sales_deals")
    .insert({
      customer_id: v.customerId,
      car_id: v.carId,
      location_id: v.locationId,
            lead_id: v.leadId,
      source_test_drive_id: v.testDriveId,
      owner_id: v.ownerId,
      proposed_price: decimalOrNull(v.proposedPrice),
      discount_amount: decimalOrNull(v.discountAmount) ?? "0.00",
      notes: v.notes.trim() || null,
    })
    .select("id, deal_number")
    .single();

  if (insertError || !created) {
    console.error("createDealAction insert error:", insertError);
    return { error: insertError ? mapSalesDbError(insertError) : "Your changes could not be saved. Please try again." };
  }

  revalidatePath("/admin/sales");
  return { error: null, dealId: created.id, dealNumber: created.deal_number };
}