"use server";

import { revalidatePath } from "next/cache";

import { createCustomer } from "@/app/admin/customers/new/actions";
import { beginEnquiryAction, type BeginEnquiryResult } from "@/src/lib/supabase/enquiry-permissions";
import { addCustomerDefaults } from "@/src/lib/validation/customer";
import { logEnquiryAudit } from "@/src/lib/supabase/enquiry-audit";
import { getEnquiryWorkflow } from "@/src/lib/supabase/enquiry-workflow-queries";
import {
  notifyEnquiryAssigned,
  notifyEnquiryReceived,
  notifyEnquiryStatusChanged,
  notifyEnquiryUrgent,
} from "@/src/lib/notifications/enquiry-notifications";
import { canTransition, describeRefusal, findStatus } from "@/src/lib/utils/enquiry-workflow";
import type { CustomerVehicleValues } from "@/src/lib/validation/enquiry";
import {
  assignEnquirySchema,
  bulkAssignEnquiriesSchema,
  bulkSetEnquiryStatusSchema,
  bulkSetEnquiryPrioritySchema,
  archiveEnquirySchema,
  bulkArchiveEnquiriesSchema,
  convertEnquirySchema,
  deleteEnquirySchema,
  enquiryCustomerSearchSchema,
  linkEnquiryCustomerSchema,
  manualEnquirySchema,
  setEnquiryPrioritySchema,
  setEnquiryStatusSchema,
} from "@/src/lib/validation/enquiry";

import type {
  EnquiryActionResult,
  EnquiryBulkResult,
  EnquiryConvertResult,
  EnquiryCustomerMatch,
} from "@/src/lib/types/enquiry";

/* =========================================================
   SHARED
========================================================= */

function refresh(id?: string) {
  revalidatePath("/admin/enquiries");
  if (id) revalidatePath(`/admin/enquiries/${id}`);
}

function firstIssue(error: { issues: { message: string }[] }, fallback: string): string {
  return error.issues[0]?.message ?? fallback;
}

/** What somebody sees when two people edited the same enquiry at once. */
const STALE =
  "This enquiry was changed by another staff member. Refresh the page to see their change before saving yours.";

/** The Supabase client a successful beginEnquiryAction hands back. */
type ActionClient = Extract<BeginEnquiryResult, { ok: true }>["supabase"];

interface EnquiryState {
  status: string;
  enquiry_type: string;
  assigned_to: string | null;
  priority: string;
  version: number;
}

/**
 * The few fields every changing action has to see first.
 *
 * Read before the write rather than trusting what the browser sent: the
 * client's idea of the current status can be a minute old, and the whole
 * point of the workflow rules is that they are checked against what is
 * actually in the database.
 */
async function loadEnquiryState(
  supabase: ActionClient,
  id: string,
): Promise<{ state: EnquiryState | null; error: string | null }> {
  const { data, error } = await supabase
    .from("enquiries")
    .select("status, enquiry_type, assigned_to, priority, version")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("loadEnquiryState error:", error);
    return { state: null, error: "Unable to read this enquiry. Please try again." };
  }

  if (!data) return { state: null, error: "This enquiry no longer exists." };

  return { state: data as EnquiryState, error: null };
}

/* =========================================================
   STATUS
========================================================= */

/**
 * Moves an enquiry to another status.
 *
 * Which moves are legal comes from enquiry_status_transitions and depends on
 * the enquiry's type, so a Sell My Car request can reach Offer Sent and a
 * Dream Car request cannot. The check happens here rather than only in the
 * browser, because a server action is a public endpoint.
 *
 * Converted is not reachable here — it is set by convertEnquiryAction, which
 * is the only path that creates the customer and lead that status implies.
 */
export async function setEnquiryStatusAction(input: unknown): Promise<EnquiryActionResult> {
  const start = await beginEnquiryAction("manage");
  if (!start.ok) return { error: start.error };

  const parsed = setEnquiryStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstIssue(parsed.error, "Please check the details and try again.") };
  }

  const v = parsed.data;

  const { state, error: readError } = await loadEnquiryState(start.supabase, v.id);
  if (!state) return { error: readError };

  if (v.expectedVersion !== undefined && v.expectedVersion !== state.version) {
    return { error: STALE };
  }

  if (state.status === v.status) return { error: null };

  /*
   * Converted means a lead exists behind this enquiry. Moving it would leave
   * that lead with no record of where it came from.
   */
  if (state.status === "Converted") {
    return { error: "This enquiry has already been converted, so its status can't be changed." };
  }

  const workflow = await getEnquiryWorkflow();

  if (!canTransition(workflow, state.status, v.status, state.enquiry_type)) {
    return { error: describeRefusal(workflow, state.status, v.status, state.enquiry_type) };
  }

  const reason = v.reason.trim() === "" ? null : v.reason.trim();

  /*
   * A terminal status is where an enquiry finishes, so that is when it gets
   * stamped. Converted has its own stamp, written by convertEnquiryAction.
   */
  const target = findStatus(workflow, v.status);
  const finishing = Boolean(target?.isTerminal) && v.status !== "Converted";

  const { data, error } = await start.supabase
    .from("enquiries")
    .update({
      status: v.status,
      close_reason: finishing ? reason : null,
      closed_at: finishing ? new Date().toISOString() : null,
      closed_by: finishing ? start.userId : null,
    })
    .eq("id", v.id)
    // Guards the gap between the read above and this write.
    .eq("version", state.version)
    .select("id");

  if (error) {
    console.error("setEnquiryStatusAction error:", error);
    return { error: "Unable to update this enquiry. Please try again." };
  }

  if ((data ?? []).length === 0) return { error: STALE };

  await notifyEnquiryStatusChanged(v.id, state.status, v.status, start.userId);

  refresh(v.id);
  return { error: null };
}

/* =========================================================
   PRIORITY
========================================================= */

/** How urgent this enquiry is. Separate from status: a New enquiry can be Urgent. */
export async function setEnquiryPriorityAction(input: unknown): Promise<EnquiryActionResult> {
  const start = await beginEnquiryAction("manage");
  if (!start.ok) return { error: start.error };

  const parsed = setEnquiryPrioritySchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstIssue(parsed.error, "Please choose a priority.") };
  }

  const v = parsed.data;

  const { state, error: readError } = await loadEnquiryState(start.supabase, v.id);
  if (!state) return { error: readError };

  if (v.expectedVersion !== undefined && v.expectedVersion !== state.version) {
    return { error: STALE };
  }

  const { data, error } = await start.supabase
    .from("enquiries")
    .update({ priority: v.priority })
    .eq("id", v.id)
    .eq("version", state.version)
    .select("id");

  if (error) {
    console.error("setEnquiryPriorityAction error:", error);
    return { error: "Unable to update the priority. Please try again." };
  }

  if ((data ?? []).length === 0) return { error: STALE };

  await logEnquiryAudit(start.supabase, {
    enquiryId: v.id,
    type: "edited",
    description: `Priority changed from ${state.priority} to ${v.priority}`,
    oldValue: state.priority,
    newValue: v.priority,
    actorId: start.userId,
  });

  /* Only on the way up: being told something became less urgent is noise. */
  if (v.priority === "Urgent" && state.priority !== "Urgent") {
    await notifyEnquiryUrgent(v.id, start.userId);
  }

  refresh(v.id);
  return { error: null };
}

/* =========================================================
   ASSIGNMENT
========================================================= */

export async function assignEnquiryAction(input: unknown): Promise<EnquiryActionResult> {
  const start = await beginEnquiryAction("manage");
  if (!start.ok) return { error: start.error };

  const parsed = assignEnquirySchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstIssue(parsed.error, "Please choose who should handle this.") };
  }

  const v = parsed.data;

  const { state, error: readError } = await loadEnquiryState(start.supabase, v.id);
  if (!state) return { error: readError };

  if (v.expectedVersion !== undefined && v.expectedVersion !== state.version) {
    return { error: STALE };
  }

  if (state.assigned_to === v.assignedTo) return { error: null };

  /*
   * Picking up an unanswered enquiry moves it to Assigned in the same step,
   * if the workflow allows that move. Leaving it at New after someone has
   * taken it on is how two people end up calling the same customer.
   */
  let nextStatus: string | null = null;

  if (v.assignedTo !== null && state.status === "New") {
    const workflow = await getEnquiryWorkflow();
    if (canTransition(workflow, state.status, "Assigned", state.enquiry_type)) {
      nextStatus = "Assigned";
    }
  }

  const { data, error } = await start.supabase
    .from("enquiries")
    .update({ assigned_to: v.assignedTo, ...(nextStatus ? { status: nextStatus } : {}) })
    .eq("id", v.id)
    .eq("version", state.version)
    .select("id");

  if (error) {
    console.error("assignEnquiryAction error:", error);
    return { error: "Unable to update this enquiry. Please try again." };
  }

  if ((data ?? []).length === 0) return { error: STALE };

  /*
   * The reason belongs on the history row the trigger just wrote. It is
   * attached afterwards because a trigger cannot see an argument the caller
   * never put in a column.
   */
  if (v.reason.trim() !== "") {
    const { error: reasonError } = await start.supabase
      .from("enquiry_staff_assignment_history")
      .update({ reason: v.reason.trim() })
      .eq("enquiry_id", v.id)
      .is("reason", null)
      .order("assigned_at", { ascending: false })
      .limit(1);

    if (reasonError) console.error("assignEnquiryAction reason error:", reasonError);
  }

  await notifyEnquiryAssigned(v.id, v.assignedTo, state.assigned_to, start.userId);

  refresh(v.id);
  return { error: null };
}

/* =========================================================
   CUSTOMER SEARCH
========================================================= */

/**
 * Customers matching what somebody typed into the create form.
 *
 * A server action rather than a query the browser makes, because the list
 * holds contact details and the enquiry permission is what decides who may
 * see them. The same name typed by somebody without it returns nothing.
 */
export async function searchEnquiryCustomersAction(
  input: unknown,
): Promise<{ matches: EnquiryCustomerMatch[]; error: string | null }> {
  const start = await beginEnquiryAction("manage");
  if (!start.ok) return { matches: [], error: start.error };

  const parsed = enquiryCustomerSearchSchema.safeParse(input);
  if (!parsed.success) return { matches: [], error: null };

  const term = parsed.data.query;

  /* Commas and dots end an or() list, so a name with either would break it. */
  const like = `%${term.replace(/[,."()]/g, " ")}%`;

  const { data, error } = await start.supabase
    .from("customer_profiles")
    .select("id, full_name, customer_number, email, phone")
    .is("archived_at", null)
    .or(
      [
        `full_name.ilike."${like}"`,
        `customer_number.ilike."${like}"`,
        `email.ilike."${like}"`,
        `phone.ilike."${like}"`,
      ].join(","),
    )
    .order("full_name")
    .limit(8);

  if (error) {
    console.error("searchEnquiryCustomersAction error:", error);
    return { matches: [], error: "Unable to search customers right now." };
  }

  type Row = {
    id: string;
    full_name: string;
    customer_number: string;
    email: string | null;
    phone: string | null;
  };

  return {
    matches: ((data ?? []) as Row[]).map((row) => ({ ...row, matchedOn: "name" as const })),
    error: null,
  };
}

/* =========================================================
   BULK
========================================================= */

/**
 * Runs a single-enquiry action over a selection.
 *
 * Each id goes through the very same function the one-at-a-time control
 * calls, so the workflow rules, the version check and the history rows are
 * identical. Doing it as one big UPDATE would be faster and would quietly
 * skip every rule those functions exist to enforce.
 *
 * Nothing is rolled back when one fails. A selection of forty routinely
 * contains two the rules refuse, and throwing away thirty-eight good changes
 * because of them helps nobody. The count says what happened.
 */
async function runBulk(
  ids: string[],
  each: (id: string) => Promise<EnquiryActionResult>,
): Promise<EnquiryBulkResult> {
  let done = 0;
  let skipped = 0;
  let firstProblem: string | null = null;

  for (const id of ids) {
    const result = await each(id);

    if (result.error) {
      skipped += 1;
      firstProblem ??= result.error;
    } else {
      done += 1;
    }
  }

  return { done, skipped, firstProblem, error: null };
}

/** Hands a selection of enquiries to one person, or clears their owner. */
export async function bulkAssignEnquiriesAction(input: unknown): Promise<EnquiryBulkResult> {
  const start = await beginEnquiryAction("manage");
  if (!start.ok) return { done: 0, skipped: 0, firstProblem: null, error: start.error };

  const parsed = bulkAssignEnquiriesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      done: 0,
      skipped: 0,
      firstProblem: null,
      error: firstIssue(parsed.error, "Please choose who should handle these."),
    };
  }

  const v = parsed.data;

  /*
   * No expectedVersion. Nobody has read a version for forty rows, and
   * inventing one would fail every row. Each call still re-reads the row and
   * writes against the version it found, so a concurrent edit is caught.
   */
  return runBulk(v.ids, (id) => assignEnquiryAction({ id, assignedTo: v.assignedTo, reason: v.reason }));
}

/** Moves a selection of enquiries to one status. */
export async function bulkSetEnquiryStatusAction(input: unknown): Promise<EnquiryBulkResult> {
  const start = await beginEnquiryAction("manage");
  if (!start.ok) return { done: 0, skipped: 0, firstProblem: null, error: start.error };

  const parsed = bulkSetEnquiryStatusSchema.safeParse(input);
  if (!parsed.success) {
    return {
      done: 0,
      skipped: 0,
      firstProblem: null,
      error: firstIssue(parsed.error, "Please choose a status."),
    };
  }

  const v = parsed.data;

  return runBulk(v.ids, (id) => setEnquiryStatusAction({ id, status: v.status, reason: v.reason }));
}

/* =========================================================
   LINK A KNOWN CUSTOMER
========================================================= */

/** Ties an enquiry to a customer already on file, without converting it. */
export async function linkEnquiryCustomerAction(input: unknown): Promise<EnquiryActionResult> {
  const start = await beginEnquiryAction("manage");
  if (!start.ok) return { error: start.error };

  const parsed = linkEnquiryCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstIssue(parsed.error, "Please choose a customer.") };
  }

  const v = parsed.data;

  const { error } = await start.supabase
    .from("enquiries")
    .update({ customer_id: v.customerId })
    .eq("id", v.id);

  if (error) {
    console.error("linkEnquiryCustomerAction error:", error);
    return { error: "Unable to link this customer. Please try again." };
  }

  await logEnquiryAudit(start.supabase, {
    enquiryId: v.id,
    type: "edited",
    description: "Linked to a customer on file",
    newValue: v.customerId,
    actorId: start.userId,
  });

  refresh(v.id);
  return { error: null };
}

/* =========================================================
   MANUAL ENTRY
========================================================= */

/** An enquiry taken over the phone or at the counter. */
export async function createManualEnquiryAction(
  input: unknown,
): Promise<EnquiryActionResult & { id: string | null }> {
  const start = await beginEnquiryAction("manage");
  if (!start.ok) return { error: start.error, id: null };

  const parsed = manualEnquirySchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstIssue(parsed.error, "Please fix the highlighted fields."), id: null };
  }

  const v = parsed.data;

  /*
   * The type and source came from a browser, and both are configurable, so
   * they are checked against the lookup tables before they reach a column
   * with a foreign key on it. A clear sentence beats a constraint violation.
   */
  const workflow = await getEnquiryWorkflow();

  if (workflow.loaded) {
    if (!workflow.types.some((item) => item.key === v.enquiryType)) {
      return { error: `"${v.enquiryType}" is not an enquiry type. Please choose another.`, id: null };
    }

    if (!workflow.sources.some((item) => item.key === v.source)) {
      return { error: `"${v.source}" is not a source. Please choose another.`, id: null };
    }
  }

  const { data, error } = await start.supabase
    .from("enquiries")
    .insert({
      status: v.assignedTo ? "Assigned" : "New",
      enquiry_type: v.enquiryType,
      source: v.source,
      priority: v.priority,
      subject: v.subject === "" ? null : v.subject,
      full_name: v.fullName,
      email: v.email === "" ? null : v.email.toLowerCase(),
      phone: v.phone === "" ? null : v.phone,
      preferred_contact: v.preferredContact ?? null,
      message: v.message === "" ? null : v.message,
      car_id: v.carId,
      vehicle_text: v.vehicleText === "" ? null : v.vehicleText,
      assigned_to: v.assignedTo,
      customer_id: v.customerId,
      location_id: v.locationId,
      general_category: v.generalCategory,
      created_by: start.userId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("createManualEnquiryAction error:", error);
    return { error: "Unable to save this enquiry. Please try again.", id: null };
  }

  const id = (data as { id: string }).id;

  /*
   * The type-specific row, written only when the form sent one.
   *
   * Deliberately after the enquiry rather than in one transaction: a failure
   * here leaves a real enquiry with a name, a number and a message, which
   * somebody can work from and fill in. Rolling the whole thing back would
   * throw away a phone call because an optional figure didn't save.
   */
  if (v.finance) {
    const { error: financeError } = await start.supabase.from("enquiry_finance_details").insert({
      enquiry_id: id,
      vehicle_price: v.finance.vehiclePrice,
      down_payment: v.finance.downPayment,
      term_months: v.finance.termMonths,
      monthly_budget: v.finance.monthlyBudget,
      employment_type: v.finance.employmentType,
      bank_preference: v.finance.bankPreference === "" ? null : v.finance.bankPreference,
      notes: v.finance.notes === "" ? null : v.finance.notes,
    });

    if (financeError) {
      console.error("createManualEnquiryAction finance error:", financeError);

      refresh();
      return {
        error: "The enquiry was saved, but its finance details weren't. Add them from the enquiry itself.",
        id,
      };
    }
  }

  /*
   * The customer's own car, for a Sell My Car or Trade-In request.
   *
   * Same reasoning as the finance row: written after the enquiry, and a
   * failure here reports itself rather than destroying a saved enquiry.
   * Nothing about this creates an inventory record — the car may never have
   * been near the showroom, and somebody has to look at it first.
   */
  const ownedVehicles: { role: "selling" | "trade_in"; data: CustomerVehicleValues }[] = [
    ...(v.sellingVehicle ? [{ role: "selling" as const, data: v.sellingVehicle }] : []),
    ...(v.tradeInVehicle ? [{ role: "trade_in" as const, data: v.tradeInVehicle }] : []),
  ];

  for (const owned of ownedVehicles) {
    const sv = owned.data;

    const { data: vehicle, error: vehicleError } = await start.supabase
      .from("enquiry_customer_vehicles")
      .insert({
        enquiry_id: id,
        role: owned.role,
        brand_id: sv.brandId,
        brand_other: sv.brandOther === "" ? null : sv.brandOther,
        model: sv.model === "" ? null : sv.model,
        variant: sv.variant === "" ? null : sv.variant,
        year: sv.year,
        mileage_km: sv.mileageKm,
        registration_emirate: sv.registrationEmirate,
        spec: sv.spec,
        exterior_color: sv.exteriorColor === "" ? null : sv.exteriorColor,
        interior_color: sv.interiorColor === "" ? null : sv.interiorColor,
        condition: sv.condition,
        has_accident_history: sv.hasAccidentHistory,
        accident_notes: sv.accidentNotes === "" ? null : sv.accidentNotes,
        has_service_history: sv.hasServiceHistory,
        service_notes: sv.serviceNotes === "" ? null : sv.serviceNotes,
        asking_price: sv.askingPrice,
        location_id: sv.locationId,
        description: sv.description === "" ? null : sv.description,
      })
      .select("id")
      .single();

    if (vehicleError || !vehicle) {
      console.error("createManualEnquiryAction vehicle error:", vehicleError);

      refresh();
      return {
        error: "The enquiry was saved, but the vehicle details weren't. Add them from the enquiry itself.",
        id,
      };
    }

    /*
     * The photos are already in the bucket; these rows are what tie them to
     * this car. Losing them would leave files nobody can find, so a failure
     * is reported rather than swallowed.
     */
    if (sv.photoPaths.length > 0) {
      const { error: mediaError } = await start.supabase.from("enquiry_media").insert(
        sv.photoPaths.map((path, index) => ({
          enquiry_id: id,
          customer_vehicle_id: (vehicle as { id: string }).id,
          media_type: "image",
          storage_path: path,
          sort_order: index,
          uploaded_by: start.userId,
        })),
      );

      if (mediaError) {
        console.error("createManualEnquiryAction media error:", mediaError);

        refresh();
        return { error: "The enquiry saved, but its photos didn't attach. Please add them again.", id };
      }
    }
  }

  /*
   * The brief for a car we haven't got.
   *
   * Nothing here matches it against stock. The table has columns for a
   * match, and they are only ever written by a person who has looked —
   * there is no rule that would make an automatic match reliable, and a
   * wrong one means ringing a customer about a car they didn't ask for.
   */
  if (v.dreamCar) {
    const dc = v.dreamCar;
    const text = (value: string) => (value === "" ? null : value);

    const { error: dreamError } = await start.supabase.from("enquiry_dream_car_details").insert({
      enquiry_id: id,
      brand_id: dc.brandId,
      brand_other: text(dc.brandOther),
      model: text(dc.model),
      variant: text(dc.variant),
      year_from: dc.yearFrom,
      year_to: dc.yearTo,
      budget_min: dc.budgetMin,
      budget_max: dc.budgetMax,
      exterior_color: text(dc.exteriorColor),
      interior_color: text(dc.interiorColor),
      max_mileage_km: dc.maxMileageKm,
      fuel_type: text(dc.fuelType),
      transmission: text(dc.transmission),
      spec: dc.spec,
      features: text(dc.features),
      timeline: dc.timeline,
      notes: text(dc.notes),
    });

    if (dreamError) {
      console.error("createManualEnquiryAction dream car error:", dreamError);

      refresh();
      return {
        error: "The enquiry was saved, but what they're looking for wasn't. Add it from the enquiry itself.",
        id,
      };
    }
  }

  /*
   * Only when nobody was named on the form. Logging an enquiry and
   * assigning it to yourself in one step should not then announce it to the
   * team as unclaimed work — notifyEnquiryReceived checks that too, but
   * saying so here is cheaper than a round-trip to find out.
   */
  await notifyEnquiryReceived(id, start.userId);

  refresh();
  return { error: null, id };
}

/* =========================================================
   CONVERT
========================================================= */

/**
 * Turns an enquiry into a lead.
 *
 * The order matters: the customer first, then the lead, then the enquiry is
 * stamped. If the lead fails to insert, the enquiry is left alone rather than
 * marked converted with nothing behind it — a customer created along the way
 * is harmless and still useful, a converted enquiry with no lead is not.
 */
export async function convertEnquiryAction(input: unknown): Promise<EnquiryConvertResult> {
  const start = await beginEnquiryAction("manage");
  if (!start.ok) return { error: start.error, leadId: null, customerId: null };

  const parsed = convertEnquirySchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: firstIssue(parsed.error, "Please fix the highlighted fields."),
      leadId: null,
      customerId: null,
    };
  }

  const v = parsed.data;
  const supabase = start.supabase;

  /* ---- The enquiry, and whether it can still be converted ---- */

  const { data: enquiryRow, error: enquiryError } = await supabase
    .from("enquiries")
    .select("id, status, source, message, car_id, enquiry_number, lead_id")
    .eq("id", v.id)
    .maybeSingle();

  if (enquiryError) {
    console.error("convertEnquiryAction read error:", enquiryError);
    return { error: "Unable to read this enquiry. Please try again.", leadId: null, customerId: null };
  }

  const enquiry = enquiryRow as {
    id: string;
    status: string;
    source: string;
    message: string | null;
    car_id: string | null;
    enquiry_number: string;
    lead_id: string | null;
  } | null;

  if (!enquiry) {
    return { error: "This enquiry no longer exists.", leadId: null, customerId: null };
  }

  if (enquiry.status === "Converted" || enquiry.lead_id) {
    return {
      error: "This enquiry has already been converted. Open its lead to carry on there.",
      leadId: enquiry.lead_id,
      customerId: null,
    };
  }

  /* ---- The stage has to be an open one ---- */

  const { data: stageRow, error: stageError } = await supabase
    .from("lead_stages")
    .select("stage_type")
    .eq("id", v.stageId)
    .maybeSingle();

  if (stageError || !stageRow) {
    console.error("convertEnquiryAction stage error:", stageError);
    return { error: "Unable to check the lead stage. Please try again.", leadId: null, customerId: null };
  }

  if ((stageRow as { stage_type: string }).stage_type !== "open") {
    return {
      error: "A new lead has to start in an open stage.",
      leadId: null,
      customerId: null,
    };
  }

  /* ---- The source, matched by name so the lead carries the attribution ---- */

  const { data: sourceRows } = await supabase.from("customer_sources").select("id, name").order("sort_order");

  const sources = (sourceRows ?? []) as { id: string; name: string }[];

  const sourceId =
    sources.find((item) => item.name.toLowerCase() === enquiry.source.toLowerCase())?.id ??
    sources[0]?.id ??
    null;

  /* ---- The customer ---- */

  let customerId = v.customerId;

  if (customerId === null) {
    if (!sourceId) {
      return {
        error:
          "No customer sources are set up, so a customer can't be created. Add one in your customer settings first.",
        leadId: null,
        customerId: null,
      };
    }

    const created = await createCustomer(
      {
        ...addCustomerDefaults,
        first_name: v.firstName,
        last_name: v.lastName,
        email: v.email,
        phone: v.phone,
        source_id: sourceId,
        source_detail: `Enquiry ${enquiry.enquiry_number}`,
      },
      [],
    );

    if (created.error || !created.customerId) {
      return {
        error: created.error ?? "Unable to create a customer from this enquiry.",
        leadId: null,
        customerId: null,
      };
    }

    customerId = created.customerId;
  }

  /* ---- The lead ---- */

  const { data: leadRow, error: leadError } = await supabase
    .from("leads")
    .insert({
      customer_id: customerId,
      car_id: enquiry.car_id,
      stage_id: v.stageId,
      temperature: v.temperature,
      source_id: sourceId,
      source_detail: `Enquiry ${enquiry.enquiry_number}`,
      assigned_staff_id: v.assignedStaffId,
    })
    .select("id")
    .single();

  if (leadError) {
    console.error("convertEnquiryAction lead error:", leadError);
    return {
      error: "The customer was saved, but the lead could not be created. Please try converting again.",
      leadId: null,
      customerId,
    };
  }

  const leadId = (leadRow as { id: string }).id;

  /* ---- The first note: what they actually asked for ---- */

  const note = v.note.trim() || enquiry.message?.trim() || "";

  if (note) {
    const { error: noteError } = await supabase.from("lead_notes").insert({
      lead_id: leadId,
      note_text: `From enquiry ${enquiry.enquiry_number}:\n\n${note}`,
    });

    if (noteError) console.error("convertEnquiryAction note error:", noteError);
  }

  /* ---- Stamp the enquiry ---- */

  const { error: stampError } = await supabase
    .from("enquiries")
    .update({
      status: "Converted",
      lead_id: leadId,
      customer_id: customerId,
      converted_at: new Date().toISOString(),
      converted_by: start.userId,
      assigned_to: v.assignedStaffId,
    })
    .eq("id", v.id);

  if (stampError) {
    console.error("convertEnquiryAction stamp error:", stampError);

    return {
      error:
        "The lead was created, but this enquiry couldn't be marked converted. Open the lead to carry on, and let someone know.",
      leadId,
      customerId,
    };
  }

  refresh(v.id);
  revalidatePath("/admin/leads");
  revalidatePath(`/admin/leads/${leadId}`);
  revalidatePath("/admin/customers");

  return { error: null, leadId, customerId };
}

/* =========================================================
   DELETE
========================================================= */

/**
 * Removes an enquiry for good.
 *
 * Only for junk. A converted enquiry is the start of a customer's history, so
 * it is refused — close it instead if it needs to leave the list.
 */
export async function deleteEnquiryAction(input: unknown): Promise<EnquiryActionResult> {
  const start = await beginEnquiryAction("delete");
  if (!start.ok) return { error: start.error };

  const parsed = deleteEnquirySchema.safeParse(input);
  if (!parsed.success) return { error: "Please try again." };

  const { data, error } = await start.supabase
    .from("enquiries")
    .delete()
    .eq("id", parsed.data.id)
    .neq("status", "Converted")
    .select("id");

  if (error) {
    console.error("deleteEnquiryAction error:", error);
    return { error: "Unable to delete this enquiry. Please try again." };
  }

  if ((data ?? []).length === 0) {
    return {
      error: "A converted enquiry can't be deleted, because it is part of a customer's history.",
    };
  }

  refresh();
  return { error: null };
}

/* =========================================================
   ARCHIVE
========================================================= */

/**
 * Takes an enquiry off the working lists without destroying it.
 *
 * Archiving is the honest middle between leaving junk in the way and
 * deleting a record of a real conversation: the list, the counts and the
 * dashboard all filter archived rows, so it disappears from the work while
 * staying on file and reversible.
 *
 * Needs `manage` rather than `delete` because nothing is lost — but it does
 * hide the enquiry from everybody, so it is logged with a name against it.
 */
export async function archiveEnquiryAction(input: unknown): Promise<EnquiryActionResult> {
  const start = await beginEnquiryAction("manage");
  if (!start.ok) return { error: start.error };

  const parsed = archiveEnquirySchema.safeParse(input);
  if (!parsed.success) return { error: "Please try again." };

  const v = parsed.data;

  const { data, error } = await start.supabase
    .from("enquiries")
    .update({ archived_at: v.archived ? new Date().toISOString() : null })
    .eq("id", v.id)
    .select("id");

  if (error) {
    console.error("archiveEnquiryAction error:", error);
    return { error: "Unable to archive this enquiry. Please try again." };
  }

  if ((data ?? []).length === 0) return { error: "This enquiry no longer exists." };

  await logEnquiryAudit(start.supabase, {
    enquiryId: v.id,
    type: "archived",
    description: v.archived ? "Archived" : "Restored from the archive",
    actorId: start.userId,
  });

  refresh(v.id);
  return { error: null };
}

/* =========================================================
   MORE BULK ACTIONS
========================================================= */

/** Sets one priority across a selection. */
export async function bulkSetEnquiryPriorityAction(input: unknown): Promise<EnquiryBulkResult> {
  const start = await beginEnquiryAction("manage");
  if (!start.ok) return { done: 0, skipped: 0, firstProblem: null, error: start.error };

  const parsed = bulkSetEnquiryPrioritySchema.safeParse(input);
  if (!parsed.success) {
    return {
      done: 0,
      skipped: 0,
      firstProblem: null,
      error: firstIssue(parsed.error, "Please choose a priority."),
    };
  }

  const v = parsed.data;

  /*
   * Through the single action for each, so every row gets the same version
   * check, audit row and urgent notification it would get on its own. A
   * bulk update straight to the table would be one query and would skip all
   * three.
   */
  return runBulk(v.ids, (id) => setEnquiryPriorityAction({ id, priority: v.priority }));
}

/** Archives or restores a selection. */
export async function bulkArchiveEnquiriesAction(input: unknown): Promise<EnquiryBulkResult> {
  const start = await beginEnquiryAction("manage");
  if (!start.ok) return { done: 0, skipped: 0, firstProblem: null, error: start.error };

  const parsed = bulkArchiveEnquiriesSchema.safeParse(input);
  if (!parsed.success) {
    return { done: 0, skipped: 0, firstProblem: null, error: "Please try again." };
  }

  const v = parsed.data;

  return runBulk(v.ids, (id) => archiveEnquiryAction({ id, archived: v.archived }));
}
