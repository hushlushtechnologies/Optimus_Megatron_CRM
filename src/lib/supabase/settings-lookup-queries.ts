import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import type { LookupGroup, LookupTableSpec } from "@/src/lib/types/lookup-registry";
import { lookupTablesFor } from "@/src/lib/types/lookup-registry";

/*
|------------------------------------------------------------------------------
| Reading the lookup tables for their editors
|------------------------------------------------------------------------------
|
| These reads deliberately DO NOT filter is_active. Everywhere else in the app
| a lookup read must hide retired values — checks/check-lookup-active-filter.py
| enforces that — but this is the screen that switches them back on. If it
| filtered, a value switched off would vanish from the only page that could
| ever restore it, and the apparent fix would be to delete it and retype it,
| which is exactly what breaks history.
|
| That script names this file as an intentional exception, with that reason.
|
|------------------------------------------------------------------------------
*/

export interface LookupRow {
  /** The primary key, as a string whatever its column is called. */
  key: string;
  label: string;
  isActive: boolean;
  sortOrder: number;
  /** The parent's key, for models and variants. */
  parentKey: string | null;
  /** Everything else the spec declares, as display strings. */
  extra: Record<string, string | null>;
  /** Only present where the table has one. Never written. */
  slug: string | null;
}

export interface LookupTableData {
  spec: LookupTableSpec;
  rows: LookupRow[];
  /** Options for the parent select, where the table has a parent. */
  parents: { key: string; label: string }[];
  /** True when the read failed. The page shows an error rather than an empty list. */
  failed: boolean;
}

function columnsFor(spec: LookupTableSpec): string {
  const columns = [spec.keyColumn, spec.labelColumn, "is_active"];
  if (spec.hasSortOrder) columns.push("sort_order");
  if (spec.hasSlug) columns.push("slug");
  if (spec.parent) columns.push(spec.parent.column);
  spec.fields.forEach((field) => columns.push(field.column));
  return Array.from(new Set(columns)).join(", ");
}

function toRow(spec: LookupTableSpec, raw: Record<string, unknown>): LookupRow {
  const extra: Record<string, string | null> = {};
  spec.fields.forEach((field) => {
    const value = raw[field.column];
    extra[field.column] = value === null || value === undefined ? null : String(value);
  });

  return {
    key: String(raw[spec.keyColumn] ?? ""),
    label: String(raw[spec.labelColumn] ?? "").trim() || "(no name)",
    isActive: Boolean(raw.is_active),
    sortOrder: spec.hasSortOrder ? Number(raw.sort_order ?? 0) : 0,
    parentKey: spec.parent ? ((raw[spec.parent.column] as string | null) ?? null) : null,
    extra,
    slug: spec.hasSlug ? ((raw.slug as string | null) ?? null) : null,
  };
}

async function readTable(spec: LookupTableSpec): Promise<LookupTableData> {
  const supabase = await createClient();

  const query = supabase.from(spec.table).select(columnsFor(spec));
  const ordered = spec.hasSortOrder
    ? query.order("sort_order").order(spec.labelColumn)
    : query.order(spec.labelColumn);

  const { data, error } = await ordered;

  if (error) {
    console.error(`readTable(${spec.table}) error:`, error);
    return { spec, rows: [], parents: [], failed: true };
  }

  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((raw) => toRow(spec, raw));

  let parents: { key: string; label: string }[] = [];
  if (spec.parent) {
    /*
     * The parent list DOES filter is_active: you should not be able to file a
     * new model under a brand that has been retired. Existing rows keep their
     * parent either way — the editor shows the stored parent even when it is
     * no longer offered.
     */
    const parentResult = await supabase
      .from(spec.parent.table)
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order")
      .order("name");

    if (parentResult.error) {
      console.error(`readTable(${spec.table}) parents error:`, parentResult.error);
      return { spec, rows, parents: [], failed: true };
    }
    parents = ((parentResult.data ?? []) as { id: string; name: string | null }[]).map((row) => ({
      key: row.id,
      label: row.name?.trim() || "(no name)",
    }));
  }

  return { spec, rows, parents, failed: false };
}

/** Every lookup table for one settings page, read in parallel. */
export async function getLookupTablesForGroup(group: LookupGroup): Promise<LookupTableData[]> {
  const specs = lookupTablesFor(group);
  return Promise.all(specs.map((spec) => readTable(spec)));
}
