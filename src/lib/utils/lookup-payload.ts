import type { LookupTableSpec } from "@/src/lib/types/lookup-registry";

/*
|------------------------------------------------------------------------------
| What gets written when a lookup row is saved
|------------------------------------------------------------------------------
|
| Pulled out of the server action so it can be tested, because it is where
| three rules are actually enforced rather than merely intended:
|
|   1. A column the registry did not declare is never written.
|
|      The extra values arrive from the client as a map keyed by column name.
|      Passing that through would let a caller name any column in the table —
|      is_active on a rename-only list, or slug, or anything else. So the
|      declared fields are iterated and the submitted map is only ever read
|      from, never spread.
|
|   2. A choice value outside its declared options is dropped.
|
|      lead_stages.stage_type is the reason this matters. The won, lost and
|      open totals on the dashboard and in the Sprint 9 lead report are
|      computed from it, so a value the database happens to accept but the
|      registry does not list would move leads between won and lost with
|      nothing to show it.
|
|   3. is_active is only written for a "full" table.
|
|      Four lists are rename-and-reorder only. For those the column is left
|      out of the statement entirely rather than written with its current
|      value, so this cannot switch one off even by accident.
|
| `slug` is never written at all. Three places in the code find a row by slug,
| so a changed slug breaks a lookup silently — there is no error to report
| because the row simply is not found.
|
|------------------------------------------------------------------------------
*/

export interface LookupWriteInput {
  label: string;
  isActive: boolean;
  sortOrder: number;
  parentKey: string | null;
  extra: Record<string, string>;
}

/**
 * The columns to write for one lookup row, or an error explaining why not.
 *
 * `isNew` matters: a rename-only table refuses an insert outright, and a
 * table with a parent needs one chosen when the row is created. An existing
 * row never has its parent rewritten — a variant cannot be moved to another
 * model, because vehicles are already filed against that pairing.
 */
export function buildLookupWrite(
  spec: LookupTableSpec,
  input: LookupWriteInput,
  isNew: boolean,
): { ok: true; payload: Record<string, unknown> } | { ok: false; error: string } {
  if (spec.mode === "rename" && isNew) {
    return {
      ok: false,
      error: `${spec.label} can be renamed and reordered, but a new ${spec.singular} can't be added here.`,
    };
  }

  const label = input.label.trim();
  if (label.length === 0) return { ok: false, error: "Give it a name." };
  if (label.length > 120) return { ok: false, error: "Keep the name under 120 characters." };

  const payload: Record<string, unknown> = { [spec.labelColumn]: label };

  for (const field of spec.fields) {
    if (!(field.column in input.extra)) continue;

    // Rule 3's sibling: a rename-only table writes nothing but its label and
    // position, so none of the declared extras are written either.
    if (spec.mode !== "full") continue;

    const raw = input.extra[field.column];

    if (field.kind === "choice") {
      const allowed = (field.choices ?? []).map((choice) => choice.value);
      if (!allowed.includes(raw)) continue;
      payload[field.column] = raw === "true" ? true : raw === "false" ? false : raw;
      continue;
    }

    const trimmed = raw.trim();
    if (field.maxLength && trimmed.length > field.maxLength) {
      return { ok: false, error: `Keep ${field.label.toLowerCase()} under ${field.maxLength} characters.` };
    }
    payload[field.column] = trimmed === "" ? null : trimmed;
  }

  if (spec.hasSortOrder) {
    if (!Number.isInteger(input.sortOrder) || input.sortOrder < 0 || input.sortOrder > 9999) {
      return { ok: false, error: "Display order must be a whole number from 0 to 9999." };
    }
    payload.sort_order = input.sortOrder;
  }

  if (spec.parent) {
    if (isNew) {
      if (!input.parentKey) {
        return { ok: false, error: `Choose a ${spec.parent.label.toLowerCase()} for this ${spec.singular}.` };
      }
      payload[spec.parent.column] = input.parentKey;
    }
    // Existing rows keep their parent. Not rewritten, not even to the same
    // value: a variant that changes model changes what every vehicle carrying
    // it says it is.
  }

  if (spec.mode === "full") payload.is_active = input.isActive;

  return { ok: true, payload };
}
