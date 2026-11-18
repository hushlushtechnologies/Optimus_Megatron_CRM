"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { beginSalesAction, requireSalesPermission } from "@/src/lib/supabase/sales-permissions";
import { fetchVehicleDealContext } from "@/src/lib/supabase/vehicle-deal-context";
import {
  getCustomerById,
  getOpenLeadsForCustomer,
  getVehicleById,
  searchCustomers,
  searchVehicles,
} from "@/src/lib/supabase/test-drive-form-queries";
import {
  convertReservationSchema,
  createReservationSchema,
  transitionReservationSchema,
} from "@/src/lib/validation/reservation";
import { describeReservationContext } from "@/src/lib/utils/reservation-format";
import { mapSalesDbError } from "@/src/lib/utils/sales-errors";
import type { SalesPermissionName } from "@/src/lib/utils/sales-permissions";
import type { VehicleDealContextResult } from "@/src/lib/types/sales-deal-form";
import type { CreateReservationResult, ReservationActionResult } from "@/src/lib/types/reservations";
import type {
  SearchResult,
  TestDriveCustomerOption,
  TestDriveLeadOption,
  TestDriveVehicleOption,
} from "@/src/lib/types/test-drive";

// --- Searches for the form (read-only) ---

export async function searchReservationCustomersAction(
  query: string,
): Promise<SearchResult<TestDriveCustomerOption>> {
  if (typeof query !== "string") return { results: [], failed: true };
  const permission = await requireSalesPermission("reservationsRequest");
  if (!permission.allowed) return { results: [], failed: true };
  return searchCustomers(query);
}

export async function searchReservationVehiclesAction(
  query: string,
): Promise<SearchResult<TestDriveVehicleOption>> {
  if (typeof query !== "string") return { results: [], failed: true };
  const permission = await requireSalesPermission("reservationsRequest");
  if (!permission.allowed) return { results: [], failed: true };
  return searchVehicles(query);
}

export async function getReservationCustomerLeadsAction(
  customerId: string,
): Promise<SearchResult<TestDriveLeadOption>> {
  const permission = await requireSalesPermission("reservationsRequest");
  if (!permission.allowed) return { results: [], failed: true };
  if (!z.string().uuid().safeParse(customerId).success) return { results: [], failed: true };
  return getOpenLeadsForCustomer(customerId);
}

const contextInputSchema = z.object({
  carId: z.string().uuid(),
  customerId: z.string().uuid().nullable(),
  leadId: z.string().uuid().nullable(),
});

export async function getReservationVehicleContextAction(input: unknown): Promise<VehicleDealContextResult> {
  const start = await beginSalesAction("reservationsRequest");
  if (!start.ok) return { status: "error" };

  const parsed = contextInputSchema.safeParse(input);
  if (!parsed.success) return { status: "error" };

  const context = await fetchVehicleDealContext(
    start.supabase,
    parsed.data.carId,
    parsed.data.customerId,
    parsed.data.leadId,
  );
  return context ? { status: "ok", context } : { status: "error" };
}

// --- Create ---

interface CreatedRow {
  out_id: string;
  out_number: string;
}

export async function createReservationAction(input: unknown): Promise<CreateReservationResult> {
  const start = await beginSalesAction("reservationsRequest");
  if (!start.ok) return { error: start.error };

  const parsed = createReservationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form and try again." };
  }
  const v = parsed.data;
  const { supabase, userId, permissions } = start;

  if (v.mode === "confirm" && !permissions.reservationsConfirm) {
    return { error: "You can request a reservation, but only a manager can confirm one." };
  }
  if (v.ownerId && v.ownerId !== userId && !permissions.reservationsConfirm) {
    return { error: "You can only create reservations for yourself. Ask a manager to assign someone else." };
  }

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
  if (locationError) console.error("createReservationAction location error:", locationError);
  if (!location) return { error: "That showroom could not be found." };

  // 2. The owner must be someone who can take reservations.
  if (v.ownerId) {
    const { data: eligible, error: eligibleError } = await supabase.rpc("has_permission", {
      uid: v.ownerId,
      perm: "reservations.request",
    });
    if (eligibleError || eligible !== true) return { error: "That person can't own reservations." };
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
    if (leadRow.customer_id !== v.customerId)
      return { error: "The selected lead belongs to a different customer." };
    if (leadRow.stage?.stage_type !== "open")
      return { error: "That lead is already closed. Choose an open lead." };
  }

  // 4. The vehicle must be fit to hold. The database refuses conflicts as well, this just says why first.
  const context = await fetchVehicleDealContext(supabase, v.carId, v.customerId, v.leadId);
  const messages = describeReservationContext(context, vehicle, v.mode === "confirm");
  if (messages.blockers.length > 0) return { error: messages.blockers[0] };

  // 5. Save, in one step.
  const { data, error } = await supabase.rpc("create_vehicle_reservation", {
    p_customer_id: v.customerId,
    p_car_id: v.carId,
    p_location_id: v.locationId,
    p_lead_id: v.leadId,
    p_owner_id: v.ownerId,
    p_source: v.source,
    p_confirm: v.mode === "confirm",
    p_days: v.mode === "confirm" ? v.days : null,
    p_notes: v.notes,
  });

  if (error) {
    console.error("createReservationAction error:", error);
    return { error: mapSalesDbError(error) };
  }

  const row = (Array.isArray(data) ? data[0] : data) as CreatedRow | undefined;

  revalidatePath("/admin/reservations");
  return { error: null, reservationId: row?.out_id, reservationNumber: row?.out_number };
}

// --- Change status ---

const PERMISSION_FOR: Partial<
  Record<"confirm" | "reject" | "cancel" | "release" | "extend", SalesPermissionName>
> = {
  confirm: "reservationsConfirm",
  reject: "reservationsConfirm",
  extend: "reservationsConfirm",
  release: "reservationsCancel",
};

export async function transitionReservationAction(input: unknown): Promise<ReservationActionResult> {
  const parsed = transitionReservationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details and try again." };
  }
  const v = parsed.data;

  // A friendly early refusal. The database checks the same permission again, and lets a person
  // withdraw their own request even without the cancel permission.
  const start = await beginSalesAction(PERMISSION_FOR[v.action] ?? "reservationsView");
  if (!start.ok) return { error: start.error };

  const { error } = await start.supabase.rpc("transition_vehicle_reservation", {
    p_id: v.id,
    p_action: v.action,
    p_expected_updated_at: v.expectedUpdatedAt,
    p_reason: v.reason,
    p_days: v.days,
  });

  if (error) {
    console.error("transitionReservationAction error:", error);
    return { error: mapSalesDbError(error) };
  }

  revalidatePath("/admin/reservations");
  revalidatePath(`/admin/reservations/${v.id}`);
  revalidatePath("/admin/sales");
  return { error: null };
}

interface ConvertedRow {
  out_deal_id: string;
  out_deal_number: string;
  out_created: boolean;
}

export async function convertReservationAction(input: unknown): Promise<ReservationActionResult> {
  const parsed = convertReservationSchema.safeParse(input);
  if (!parsed.success) return { error: "Please refresh the page and try again." };
  const v = parsed.data;

  const start = await beginSalesAction("create");
  if (!start.ok) return { error: start.error };

  const { data, error } = await start.supabase.rpc("convert_reservation_to_deal", {
    p_reservation_id: v.id,
    p_expected_updated_at: v.expectedUpdatedAt,
  });

  if (error) {
    console.error("convertReservationAction error:", error);
    return { error: mapSalesDbError(error) };
  }

  const row = (Array.isArray(data) ? data[0] : data) as ConvertedRow | undefined;
  if (!row) return { error: "The deal could not be created. Please try again." };

  revalidatePath("/admin/reservations");
  revalidatePath(`/admin/reservations/${v.id}`);
  revalidatePath("/admin/sales");
  return {
    error: null,
    dealId: row.out_deal_id,
    dealNumber: row.out_deal_number,
    linkedExisting: !row.out_created,
  };
}
