"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/src/lib/supabase/server";
import { canEditCategory, currentSettingsAccess } from "@/src/lib/supabase/settings-permissions";
import { findLookupTable } from "@/src/lib/types/lookup-registry";
import { buildLookupWrite } from "@/src/lib/utils/lookup-payload";
import { mapSalesDbError } from "@/src/lib/utils/sales-errors";
import type { SettingsActionResult } from "@/src/lib/types/sales-pricing";

/*
|------------------------------------------------------------------------------
| Writing one lookup row
|------------------------------------------------------------------------------
|
| One action for roughly twenty tables, because twenty near-identical actions
| would be twenty chances to get the two rules below wrong.
|
| RULE 1 — NOTHING IS EVER DELETED.
|
| There is no delete action in this file and the editor has no delete button.
| Every one of these values is referenced by historical records: a car's fuel
| type, a lead's stage, an enquiry's source. The brief says "when disabling a
| value, preserve historical vehicles that use it" and "do not break existing
| vehicle records", and the only way to be sure of that is for the capability
| not to exist. Switching a value off removes it from every picker and leaves
| every record that used it untouched.
|
| RULE 2 — THE MODE IS ENFORCED HERE, NOT IN THE FORM.
|
| Four tables are rename-and-reorder only: vehicle statuses, lead stages,
| enquiry types and enquiry statuses. Code reasons about those — matching them
| by slug or key, computing won and lost totals from stage_type, deciding
| which status may follow which. The editor hides the add button and the
| on/off switch for them, but hiding a control is not a rule. A server action
| is callable directly, so the checks are below, and the restriction is
| checked against the registry rather than against what the form sent.
|
| `slug` is never written for the same reason: three places in the code find a
| row by slug, so a renamed slug silently breaks a lookup that has no error to
| report.
|
|------------------------------------------------------------------------------
*/

const payloadSchema = z.object({
  tableId: z.string().min(1),
  /** null to add a new row. */
  key: z.string().min(1).nullable(),
  label: z.string().trim().min(1, "Give it a name.").max(120, "Keep the name under 120 characters."),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(9999),
  parentKey: z.string().min(1).nullable(),
  /** Values for the spec's declared extra columns. */
  extra: z.record(z.string(), z.string()),
});

/** Every page that shows a lookup value, so a change is visible straight away. */
const AFFECTED: Record<string, string[]> = {
  inventory: ["/admin/settings/operations/inventory", "/admin/inventory", "/admin/inventory/new"],
  crm: ["/admin/settings/operations/crm", "/admin/customers", "/admin/leads"],
  enquiries: ["/admin/settings/operations/enquiries", "/admin/enquiries"],
};

export async function saveLookupRowAction(input: unknown): Promise<SettingsActionResult> {
  const access = await currentSettingsAccess();
  if (!canEditCategory(access, "operations")) {
    return { error: "You don't have permission to change these lists." };
  }

  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the values and try again." };
  }
  const v = parsed.data;

  const spec = findLookupTable(v.tableId);
  if (!spec) return { error: "That list could not be found." };

  const isNew = v.key === null;

  /*
   * Everything about WHAT gets written lives in buildLookupWrite, tested in
   * settings-lookup-test.mts: which columns are allowed, which choice values
   * are allowed, and the fact that is_active is only written for a table that
   * may be switched off. Checked against the registry, never against what the
   * form sent — a server action is callable directly, so a hidden button is
   * not a rule.
   */
  const built = buildLookupWrite(spec, v, isNew);
  if (!built.ok) {
    return { error: spec.restriction ? `${built.error} ${spec.restriction}` : built.error };
  }
  const payload = built.payload;

  const supabase = await createClient();

  const result = isNew
    ? await supabase.from(spec.table).insert(payload).select(spec.keyColumn)
    : await supabase
        .from(spec.table)
        .update(payload)
        .eq(spec.keyColumn, v.key as string)
        .select(spec.keyColumn);

  if (result.error) {
    console.error(`saveLookupRowAction(${spec.table}) error:`, result.error);
    return { error: mapSalesDbError(result.error) };
  }
  if (!result.data || result.data.length === 0) {
    // An RLS refusal is an UPDATE that matched nothing, not an error.
    return {
      error: isNew
        ? `The ${spec.singular} could not be added. You may not have permission.`
        : `That ${spec.singular} could not be saved. You may not have permission to change it.`,
    };
  }

  (AFFECTED[spec.group] ?? []).forEach((path) => revalidatePath(path));
  return { error: null };
}

/**
 * Switch one value on or off.
 *
 * Separate from the save so the list can have a single-click switch without
 * sending the whole row back, and so a rename-only table can refuse it in one
 * place.
 */
export async function toggleLookupRowAction(input: unknown): Promise<SettingsActionResult> {
  const access = await currentSettingsAccess();
  if (!canEditCategory(access, "operations")) {
    return { error: "You don't have permission to change these lists." };
  }

  const parsed = z
    .object({ tableId: z.string().min(1), key: z.string().min(1), isActive: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return { error: "Please try again." };

  const spec = findLookupTable(parsed.data.tableId);
  if (!spec) return { error: "That list could not be found." };

  if (spec.mode !== "full") {
    return {
      error: `${spec.label} can't be switched on and off here. ${spec.restriction ?? ""}`.trim(),
    };
  }

  const supabase = await createClient();
  const result = await supabase
    .from(spec.table)
    .update({ is_active: parsed.data.isActive })
    .eq(spec.keyColumn, parsed.data.key)
    .select(spec.keyColumn);

  if (result.error) {
    console.error(`toggleLookupRowAction(${spec.table}) error:`, result.error);
    return { error: mapSalesDbError(result.error) };
  }
  if (!result.data || result.data.length === 0) {
    return { error: `That ${spec.singular} could not be changed. You may not have permission.` };
  }

  (AFFECTED[spec.group] ?? []).forEach((path) => revalidatePath(path));
  return { error: null };
}
