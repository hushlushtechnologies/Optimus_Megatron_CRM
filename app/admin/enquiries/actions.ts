"use server";

import { revalidatePath } from "next/cache";

import { createCustomer } from "@/app/admin/customers/new/actions";
import { beginEnquiryAction } from "@/src/lib/supabase/enquiry-permissions";
import { addCustomerDefaults } from "@/src/lib/validation/customer";
import {
  assignEnquirySchema,
  convertEnquirySchema,
  deleteEnquirySchema,
  linkEnquiryCustomerSchema,
  manualEnquirySchema,
  setEnquiryStatusSchema,
} from "@/src/lib/validation/enquiry";

import type { EnquiryActionResult, EnquiryConvertResult } from "@/src/lib/types/enquiry";

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

/* =========================================================
   STATUS
========================================================= */

/**
 * Moves an enquiry between New, In Review, Spam and Closed.
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
  const reason = v.reason.trim() === "" ? null : v.reason.trim();
  const closing = v.status === "Closed";

  const { data, error } = await start.supabase
    .from("enquiries")
    .update({
      status: v.status,
      close_reason: closing ? reason : null,
      closed_at: closing ? new Date().toISOString() : null,
      closed_by: closing ? start.userId : null,
    })
    .eq("id", v.id)
    // An enquiry already converted has a lead behind it; moving it would orphan that.
    .neq("status", "Converted")
    .select("id");

  if (error) {
    console.error("setEnquiryStatusAction error:", error);
    return { error: "Unable to update this enquiry. Please try again." };
  }

  if ((data ?? []).length === 0) {
    return {
      error: "This enquiry has already been converted, so its status can't be changed.",
    };
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

  /*
   * Picking up an unanswered enquiry moves it to In Review in the same step.
   * Leaving it at New after someone has taken it on is how two people end up
   * calling the same person.
   */
  const { data: current, error: readError } = await start.supabase
    .from("enquiries")
    .select("status")
    .eq("id", v.id)
    .maybeSingle();

  if (readError) {
    console.error("assignEnquiryAction read error:", readError);
    return { error: "Unable to update this enquiry. Please try again." };
  }

  const status = (current as { status: string } | null)?.status;
  const promote = v.assignedTo !== null && status === "New";

  const { error } = await start.supabase
    .from("enquiries")
    .update({ assigned_to: v.assignedTo, ...(promote ? { status: "In Review" } : {}) })
    .eq("id", v.id);

  if (error) {
    console.error("assignEnquiryAction error:", error);
    return { error: "Unable to update this enquiry. Please try again." };
  }

  refresh(v.id);
  return { error: null };
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

  const { data, error } = await start.supabase
    .from("enquiries")
    .insert({
      status: v.assignedTo ? "In Review" : "New",
      enquiry_type: v.enquiryType,
      source: v.source,
      full_name: v.fullName,
      email: v.email === "" ? null : v.email.toLowerCase(),
      phone: v.phone === "" ? null : v.phone,
      preferred_contact: v.preferredContact ?? null,
      message: v.message === "" ? null : v.message,
      car_id: v.carId,
      vehicle_text: v.vehicleText === "" ? null : v.vehicleText,
      assigned_to: v.assignedTo,
      customer_id: v.customerId,
      created_by: start.userId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("createManualEnquiryAction error:", error);
    return { error: "Unable to save this enquiry. Please try again.", id: null };
  }

  refresh();
  return { error: null, id: (data as { id: string }).id };
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
