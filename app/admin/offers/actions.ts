"use server";

import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";

import { beginOfferAction, type BeginOfferResult } from "@/src/lib/supabase/offer-permissions";
import {
  countTargetedVehicles,
  searchCarsForTargeting,
  searchCustomersForAssignment,
  type AssignCustomerOption,
  type TargetCarOption,
} from "@/src/lib/supabase/offer-queries";
import { shapeRuleValue } from "@/src/lib/utils/offer-rule-values";
import { toFils } from "@/src/lib/utils/sales-money";
import {
  archiveOfferSchema,
  assignOfferSchema,
  bulkArchiveOffersSchema,
  cancelAssignmentSchema,
  carSearchSchema,
  createCodeSchema,
  customerSearchSchema,
  reverseRedemptionSchema,
  setCodeActiveSchema,
  bulkSetOfferStatusSchema,
  duplicateOfferSchema,
  setOfferStatusSchema,
  targetPreviewSchema,
  upsertPromotionSchema,
} from "@/src/lib/validation/offers";

/*
|--------------------------------------------------------------------------
| CAMPAIGN ACTIONS
|--------------------------------------------------------------------------
|
| Creating and editing needs `offers.manage`. Changing what is live —
| activating, pausing, expiring, archiving — needs `offers.publish`, because
| that is the act that changes what customers are charged.
|
| Money arrives as text and is parsed to fils here. Nothing in this file
| does arithmetic on a JavaScript number.
*/

/*
 * The client, as it is once the permission check has passed. A conditional
 * `infer` here resolves to never — the same trap as Sprint 7's ownerOf.
 */
type ActionClient = Extract<BeginOfferResult, { ok: true }>["supabase"];

interface ActionResult {
  error: string | null;
}

interface CreateResult extends ActionResult {
  id?: string;
}

function firstIssue(error: ZodError, fallback: string): string {
  return error.issues[0]?.message ?? fallback;
}

function refresh(id?: string) {
  revalidatePath("/admin/offers");
  if (id) revalidatePath(`/admin/offers/${id}`);
  /* The Inventory dropdown reads live promotions, so it can change too. */
  revalidatePath("/admin/inventory");
}

/* =========================================================
   CREATE AND EDIT
========================================================= */

export async function upsertPromotionAction(input: unknown): Promise<CreateResult> {
  const start = await beginOfferAction("manage");
  if (!start.ok) return { error: start.error };

  const parsed = upsertPromotionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstIssue(parsed.error, "Please check the form and try again.") };
  }

  const v = parsed.data;

  /*
   * Publishing is a separate permission. Somebody with `manage` but not
   * `publish` can build a campaign and save it as a draft; they cannot make
   * it live. Silently downgrading is better than refusing the whole save —
   * their work is kept, and the status says what happened.
   */
  const wantsLive = v.status === "active" || v.status === "scheduled";
  const status = wantsLive && !start.permissions.publish ? "draft" : v.status;

  const row = {
    name: v.name,
    reference: v.reference === "" ? null : v.reference.toUpperCase(),
    description: v.description === "" ? null : v.description,
    promotion_type: v.promotionType,
    discount_type: v.discountType,
    discount_value: v.discountValue,
    starts_at: v.startsAt,
    ends_at: v.endsAt,
    priority: v.priority,
    max_redemptions: v.maxRedemptions,
    max_per_customer: v.maxPerCustomer,
    min_purchase_fils: v.minPurchase === "" ? null : (toFils(v.minPurchase)?.toString() ?? null),
    max_discount_fils: v.maxDiscount === "" ? null : (toFils(v.maxDiscount)?.toString() ?? null),
    points_multiplier: v.pointsMultiplier,
    stacking_policy: v.stackingPolicy,
    internal_notes: v.internalNotes === "" ? null : v.internalNotes,
    banner_url: v.bannerUrl === "" ? null : v.bannerUrl,
    status,
    updated_by: start.userId,
  };

  /* ---- Update ---- */

  if (v.id) {
    const { error } = await start.supabase.from("promotions").update(row).eq("id", v.id);

    if (error) {
      console.error("upsertPromotionAction update error:", error);
      return { error: messageFor(error) };
    }

    const replaced = await replaceTargetingAndRules(start.supabase, v.id, v);
    if (replaced) return { error: replaced, id: v.id };

    refresh(v.id);
    return { error: null, id: v.id };
  }

  /* ---- Create ---- */

  const { data, error } = await start.supabase
    .from("promotions")
    .insert({ ...row, created_by: start.userId })
    .select("id")
    .single();

  if (error || !data) {
    console.error("upsertPromotionAction insert error:", error);
    return { error: messageFor(error) };
  }

  const id = (data as { id: string }).id;

  const replaced = await replaceTargetingAndRules(start.supabase, id, v);
  if (replaced) {
    /*
     * The campaign saved but its targeting did not. Saying so, with the id,
     * is better than a bare failure: the campaign exists and can be fixed on
     * its own page rather than created again as a duplicate.
     */
    return {
      error: "The campaign was saved, but its targeting wasn't. Add it from the campaign itself.",
      id,
    };
  }

  refresh(id);
  return { error: null, id };
}

/** A readable message for the constraint names this table can raise. */
function messageFor(error: { message?: string; code?: string } | null): string {
  const text = error?.message ?? "";

  if (text.includes("promotions_reference_key")) {
    return "Another campaign already uses that reference.";
  }
  if (text.includes("promotions_dates_check")) {
    return "The end has to be after the start.";
  }
  if (text.includes("promotions_type_check") || text.includes("promotions_status_check")) {
    return "That combination isn't allowed. Please check the form.";
  }

  return "That campaign couldn't be saved. Please try again.";
}

/**
 * Targeting and eligibility, replaced wholesale.
 *
 * Deleting and re-inserting rather than diffing: these rows carry no history
 * of their own and nothing references them, so a clean replace cannot leave a
 * half-applied state the way a partial diff can.
 */
async function replaceTargetingAndRules(
  supabase: ActionClient,
  promotionId: string,
  v: { targets: { targetKind: string; targetId: string }[]; eligibilityRules: unknown[] },
): Promise<string | null> {
  const { error: clearTargets } = await supabase
    .from("promotion_targets")
    .delete()
    .eq("promotion_id", promotionId);

  if (clearTargets) {
    console.error("replaceTargeting clear error:", clearTargets);
    return "The campaign's targeting couldn't be updated.";
  }

  if (v.targets.length > 0) {
    const { error } = await supabase.from("promotion_targets").insert(
      v.targets.map((target) => ({
        promotion_id: promotionId,
        target_kind: target.targetKind,
        target_id: target.targetId,
      })),
    );

    if (error) {
      console.error("replaceTargeting insert error:", error);
      return "The campaign's targeting couldn't be saved.";
    }
  }

  const { error: clearRules } = await supabase
    .from("promotion_eligibility_rules")
    .delete()
    .eq("promotion_id", promotionId);

  if (clearRules) {
    console.error("replaceRules clear error:", clearRules);
    return "The campaign's conditions couldn't be updated.";
  }

  if (v.eligibilityRules.length > 0) {
    const { error } = await supabase.from("promotion_eligibility_rules").insert(
      (v.eligibilityRules as { ruleKind: string; operator: string; value: unknown }[]).map(
        (rule) => ({
          promotion_id: promotionId,
          rule_kind: rule.ruleKind,
          operator: rule.operator,
          value: shapeRuleValue(rule.ruleKind, rule.operator, rule.value),
        }),
      ),
    );

    if (error) {
      console.error("replaceRules insert error:", error);
      return "The campaign's conditions couldn't be saved.";
    }
  }

  return null;
}

/* =========================================================
   LIFECYCLE
========================================================= */

/**
 * Move a campaign between statuses.
 *
 * `is_active` follows automatically through the database trigger, so pausing
 * a campaign removes it from the Inventory dropdown without this action
 * knowing Inventory exists.
 */
export async function setOfferStatusAction(input: unknown): Promise<ActionResult> {
  const start = await beginOfferAction("publish");
  if (!start.ok) return { error: start.error };

  const parsed = setOfferStatusSchema.safeParse(input);
  if (!parsed.success) return { error: "Please try again." };

  const v = parsed.data;

  const { data, error } = await start.supabase
    .from("promotions")
    .update({ status: v.status, updated_by: start.userId })
    .eq("id", v.id)
    .is("archived_at", null)
    .select("id");

  if (error) {
    console.error("setOfferStatusAction error:", error);
    return { error: "That status couldn't be changed. Please try again." };
  }

  if ((data ?? []).length === 0) {
    return { error: "That campaign is no longer there, or has been archived." };
  }

  refresh(v.id);
  return { error: null };
}

export async function archiveOfferAction(input: unknown): Promise<ActionResult> {
  const start = await beginOfferAction("publish");
  if (!start.ok) return { error: start.error };

  const parsed = archiveOfferSchema.safeParse(input);
  if (!parsed.success) return { error: "Please try again." };

  const v = parsed.data;

  const { data, error } = await start.supabase
    .from("promotions")
    .update({
      archived_at: v.archived ? new Date().toISOString() : null,
      updated_by: start.userId,
    })
    .eq("id", v.id)
    .select("id");

  if (error) {
    console.error("archiveOfferAction error:", error);
    return { error: "That campaign couldn't be archived. Please try again." };
  }

  if ((data ?? []).length === 0) return { error: "That campaign is no longer there." };

  refresh(v.id);
  return { error: null };
}

/**
 * Copy a campaign, as a draft.
 *
 * The copy deliberately does NOT carry over its redemption count, its
 * redemptions, its codes or its customer assignments. Those belong to the
 * campaign that earned them — a duplicate starting at "47 redeemed" would be
 * a lie, and a duplicated code would collide on the unique index anyway.
 */
export async function duplicateOfferAction(input: unknown): Promise<CreateResult> {
  const start = await beginOfferAction("manage");
  if (!start.ok) return { error: start.error };

  const parsed = duplicateOfferSchema.safeParse(input);
  if (!parsed.success) return { error: "Please try again." };

  const { data: original, error: readError } = await start.supabase
    .from("promotions")
    .select(
      `name, description, promotion_type, discount_type, discount_value,
       priority, max_redemptions, max_per_customer, min_purchase_fils,
       max_discount_fils, points_multiplier, stacking_policy, internal_notes,
       promotion_targets ( target_kind, target_id ),
       promotion_eligibility_rules ( rule_kind, operator, value )`,
    )
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (readError || !original) {
    return { error: "That campaign is no longer there." };
  }

  const source = original as unknown as Record<string, unknown> & {
    name: string;
    promotion_targets: { target_kind: string; target_id: string }[] | null;
    promotion_eligibility_rules: { rule_kind: string; operator: string; value: unknown }[] | null;
  };

  const { promotion_targets, promotion_eligibility_rules, ...fields } = source;

  const { data: created, error } = await start.supabase
    .from("promotions")
    .insert({
      ...fields,
      name: `${source.name} (copy)`,
      /* A copy starts as a draft, with no dates and no reference. */
      reference: null,
      status: "draft",
      starts_at: null,
      ends_at: null,
      created_by: start.userId,
      updated_by: start.userId,
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error("duplicateOfferAction error:", error);
    return { error: "That campaign couldn't be duplicated. Please try again." };
  }

  const newId = (created as { id: string }).id;

  if (promotion_targets && promotion_targets.length > 0) {
    await start.supabase.from("promotion_targets").insert(
      promotion_targets.map((target) => ({
        promotion_id: newId,
        target_kind: target.target_kind,
        target_id: target.target_id,
      })),
    );
  }

  if (promotion_eligibility_rules && promotion_eligibility_rules.length > 0) {
    await start.supabase.from("promotion_eligibility_rules").insert(
      promotion_eligibility_rules.map((rule) => ({
        promotion_id: newId,
        rule_kind: rule.rule_kind,
        operator: rule.operator,
        value: rule.value,
      })),
    );
  }

  refresh(newId);
  return { error: null, id: newId };
}

/* =========================================================
   BULK

   Each id goes through the single-row action, so every row is re-read,
   re-checked against the lifecycle rules and audited on its own. Sixty rows
   is sixty round trips, which is slower than one statement and is the point:
   a bulk pause that skipped the rules would be a way to pause a campaign
   somebody else just published.
========================================================= */

export interface OfferBulkResult {
  done: number;
  skipped: number;
  /** Why the first skipped one was skipped, so the message can say. */
  firstProblem: string | null;
  error: string | null;
}

async function runBulk(
  ids: string[],
  each: (id: string) => Promise<ActionResult>,
): Promise<OfferBulkResult> {
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

/** Pauses, resumes or ends a selection of campaigns. */
export async function bulkSetOfferStatusAction(input: unknown): Promise<OfferBulkResult> {
  const start = await beginOfferAction("publish");
  if (!start.ok) return { done: 0, skipped: 0, firstProblem: null, error: start.error };

  const parsed = bulkSetOfferStatusSchema.safeParse(input);
  if (!parsed.success) {
    return {
      done: 0,
      skipped: 0,
      firstProblem: null,
      error: firstIssue(parsed.error, "Please try again."),
    };
  }

  const v = parsed.data;

  return runBulk(v.ids, (id) => setOfferStatusAction({ id, status: v.status, reason: v.reason }));
}

/** Archives or restores a selection of campaigns. */
export async function bulkArchiveOffersAction(input: unknown): Promise<OfferBulkResult> {
  /* Archiving is a publish-level act: the key's own description covers it. */
  const start = await beginOfferAction("publish");
  if (!start.ok) return { done: 0, skipped: 0, firstProblem: null, error: start.error };

  const parsed = bulkArchiveOffersSchema.safeParse(input);
  if (!parsed.success) {
    return {
      done: 0,
      skipped: 0,
      firstProblem: null,
      error: firstIssue(parsed.error, "Please try again."),
    };
  }

  const v = parsed.data;

  return runBulk(v.ids, (id) => archiveOfferAction({ id, archived: v.archived }));
}

/* =========================================================
   THE TARGETING PREVIEW

   Called as somebody picks brands and models on the create form, so the
   count has to come from the server: the browser does not hold every car's
   brand, model, collection and location, and should not.

   Gated on view rather than manage. It reports a number about stock, which
   anybody who can see the module can already see in Inventory — and the
   create form needs it before anything has been saved.
========================================================= */

export interface TargetPreviewResult {
  total: number;
  matched: number;
  error: string | null;
}

export async function previewTargetedVehiclesAction(input: unknown): Promise<TargetPreviewResult> {
  const start = await beginOfferAction("view");
  if (!start.ok) return { total: 0, matched: 0, error: start.error };

  const parsed = targetPreviewSchema.safeParse(input);
  if (!parsed.success) {
    return { total: 0, matched: 0, error: firstIssue(parsed.error, "Please try again.") };
  }

  const count = await countTargetedVehicles(parsed.data.targets);

  if (!count) {
    return { total: 0, matched: 0, error: "The vehicle count couldn't be worked out." };
  }

  return { ...count, error: null };
}

/** Searches stock for the "specific vehicles" targeting option. */
export async function searchTargetCarsAction(
  input: unknown,
): Promise<{ cars: TargetCarOption[]; error: string | null }> {
  const start = await beginOfferAction("view");
  if (!start.ok) return { cars: [], error: start.error };

  const parsed = carSearchSchema.safeParse(input);
  if (!parsed.success) return { cars: [], error: "Please try again." };

  return { cars: await searchCarsForTargeting(parsed.data.term), error: null };
}

/* =========================================================
   CUSTOMER-SPECIFIC OFFERS (Phase 10)

   A private offer is a row in customer_offer_assignments, not a copy of the
   campaign and not a flag on the customer. So:
     - the campaign stays one row, editable in one place
     - the customer profile is not duplicated or extended
     - "other customers cannot use this offer" is enforced by the engine,
       which only treats a campaign as available to someone holding an
       assignment for it
========================================================= */

export async function assignOfferToCustomerAction(input: unknown): Promise<CreateResult> {
  const start = await beginOfferAction("assign");
  if (!start.ok) return { error: start.error };

  const parsed = assignOfferSchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstIssue(parsed.error, "Please check the details and try again.") };
  }

  const v = parsed.data;

  /*
   * The campaign has to exist and not be archived. Assigning somebody an
   * archived campaign would create an offer that can never be used, with
   * nothing on screen to say why.
   */
  const { data: promotion, error: lookupError } = await start.supabase
    .from("promotions")
    .select("id, name, archived_at")
    .eq("id", v.promotionId)
    .maybeSingle();

  if (lookupError) {
    console.error("assignOffer lookup error:", lookupError);
    return { error: "The campaign couldn't be read. Try again." };
  }

  if (!promotion) return { error: "That campaign no longer exists." };

  if ((promotion as { archived_at: string | null }).archived_at !== null) {
    return { error: "That campaign is archived, so it can't be assigned to anyone." };
  }

  const override = toFils(v.discountOverride);

  const { data, error } = await start.supabase
    .from("customer_offer_assignments")
    .insert({
      promotion_id: v.promotionId,
      customer_id: v.customerId,
      car_id: v.carId,
      valid_from: v.validFrom,
      valid_to: v.validTo,
      discount_override_fils: override === null ? null : override.toString(),
      notes: v.notes || null,
      assigned_by: start.userId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("assignOffer insert error:", error);

    /* The unique index on (promotion_id, customer_id, car_id). */
    if (error.code === "23505") {
      return { error: "This customer already holds this offer for that vehicle." };
    }

    return { error: "The offer couldn't be assigned. Try again." };
  }

  refresh(v.promotionId);

  return { error: null, id: (data as { id: string }).id };
}

/**
 * Cancels an assignment.
 *
 * A cancellation, not a delete: the row is the record that this customer was
 * given this offer, and deleting it would make a redemption that references
 * it unexplainable.
 */
export async function cancelAssignmentAction(input: unknown): Promise<ActionResult> {
  const start = await beginOfferAction("assign");
  if (!start.ok) return { error: start.error };

  const parsed = cancelAssignmentSchema.safeParse(input);
  if (!parsed.success) return { error: "Please try again." };

  const v = parsed.data;

  const { data: row, error: readError } = await start.supabase
    .from("customer_offer_assignments")
    .select("id, promotion_id, status")
    .eq("id", v.id)
    .maybeSingle();

  if (readError) {
    console.error("cancelAssignment read error:", readError);
    return { error: "The offer couldn't be read. Try again." };
  }

  if (!row) return { error: "That assignment no longer exists." };

  const current = row as { promotion_id: string; status: string };

  if (current.status === "used") {
    return { error: "This offer has already been used, so it can't be cancelled." };
  }

  if (current.status === "cancelled") {
    return { error: "This offer is already cancelled." };
  }

  const { error } = await start.supabase
    .from("customer_offer_assignments")
    .update({
      status: "cancelled",
      notes: v.reason ? v.reason : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", v.id)
    .eq("status", current.status);

  if (error) {
    console.error("cancelAssignment update error:", error);
    return { error: "The offer couldn't be cancelled. Try again." };
  }

  refresh(current.promotion_id);

  return { error: null };
}

/** Finds customers for the assign dialog. */
export async function searchAssignCustomersAction(
  input: unknown,
): Promise<{ customers: AssignCustomerOption[]; error: string | null }> {
  const start = await beginOfferAction("assign");
  if (!start.ok) return { customers: [], error: start.error };

  const parsed = customerSearchSchema.safeParse(input);
  if (!parsed.success) return { customers: [], error: "Please try again." };

  return { customers: await searchCustomersForAssignment(parsed.data.term), error: null };
}

/* =========================================================
   PROMOTIONAL CODES (Phase 12)

   Creating and deactivating only. Redeeming is a database function —
   redeem_promotion_code — because the limit check and the insert have to
   happen under one row lock, which application code cannot do.
========================================================= */

export async function createPromotionCodeAction(input: unknown): Promise<CreateResult> {
  const start = await beginOfferAction("manage");
  if (!start.ok) return { error: start.error };

  const parsed = createCodeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstIssue(parsed.error, "Please check the code and try again.") };
  }

  const v = parsed.data;

  const { data, error } = await start.supabase
    .from("promotion_codes")
    .insert({
      promotion_id: v.promotionId,
      code: v.code.toUpperCase(),
      usage_limit: v.usageLimit,
      per_customer_limit: v.perCustomerLimit,
      created_by: start.userId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("createPromotionCode error:", error);

    /*
     * The unique index is on upper(code) across every campaign, so a
     * duplicate may belong to a different campaign the person cannot see.
     * The message says the code is taken without saying by what.
     */
    if (error.code === "23505") {
      return { error: `The code ${v.code.toUpperCase()} is already in use.` };
    }

    return { error: "The code couldn't be created. Try again." };
  }

  refresh(v.promotionId);

  return { error: null, id: (data as { id: string }).id };
}

/**
 * Switches a code on or off.
 *
 * Deactivating rather than deleting: redemptions reference the code row, and
 * "which code did they use" is a question somebody will ask about a deal
 * from six months ago.
 */
export async function setCodeActiveAction(input: unknown): Promise<ActionResult> {
  const start = await beginOfferAction("manage");
  if (!start.ok) return { error: start.error };

  const parsed = setCodeActiveSchema.safeParse(input);
  if (!parsed.success) return { error: "Please try again." };

  const v = parsed.data;

  const { data: row, error: readError } = await start.supabase
    .from("promotion_codes")
    .select("id, promotion_id, is_active")
    .eq("id", v.id)
    .maybeSingle();

  if (readError) {
    console.error("setCodeActive read error:", readError);
    return { error: "The code couldn't be read. Try again." };
  }

  if (!row) return { error: "That code no longer exists." };

  const current = row as { promotion_id: string; is_active: boolean };

  if (current.is_active === v.isActive) {
    return { error: v.isActive ? "That code is already active." : "That code is already off." };
  }

  const { error } = await start.supabase
    .from("promotion_codes")
    .update({ is_active: v.isActive })
    .eq("id", v.id);

  if (error) {
    console.error("setCodeActive update error:", error);
    return { error: "The code couldn't be changed. Try again." };
  }

  refresh(current.promotion_id);

  return { error: null };
}

/* =========================================================
   REVERSING A REDEMPTION

   Goes through reverse_offer_redemption rather than an update, so the row
   lock, the already-reversed check and the counter adjustment happen
   together. A direct update would be three statements and a chance to
   reverse the same redemption twice.
========================================================= */

export async function reverseRedemptionAction(input: unknown): Promise<ActionResult> {
  /* publish, not manage: this changes a figure on a completed deal. */
  const start = await beginOfferAction("publish");
  if (!start.ok) return { error: start.error };

  const parsed = reverseRedemptionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: firstIssue(parsed.error, "Say why this is being reversed.") };
  }

  const v = parsed.data;

  const { data: row } = await start.supabase
    .from("offer_redemptions")
    .select("promotion_id")
    .eq("id", v.id)
    .maybeSingle();

  const { error } = await start.supabase.rpc("reverse_offer_redemption", {
    p_redemption_id: v.id,
    p_reason: v.reason,
    p_reversed_by: start.userId,
  });

  if (error) {
    console.error("reverseRedemption error:", error);

    const known: Record<string, string> = {
      redemption_unknown: "That redemption no longer exists.",
      already_reversed: "This redemption has already been reversed.",
      reason_required: "Say why this is being reversed.",
    };

    const reason = Object.keys(known).find((key) => error.message.includes(key));

    return { error: reason ? known[reason] : "The redemption couldn't be reversed. Try again." };
  }

  if (row) refresh((row as { promotion_id: string }).promotion_id);

  return { error: null };
}
