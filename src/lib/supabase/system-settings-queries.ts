import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { describeSettingsChange } from "@/src/lib/utils/sales-settings-history";
import type { SettingsHistoryItem } from "@/src/lib/types/sales-pricing";

/*
|------------------------------------------------------------------------------
| The system pages: history, and what is actually enforced
|------------------------------------------------------------------------------
|
| Phase 23: "any security control shown in the UI must be backed by an actual
| enforceable implementation." These reads exist so the security page can
| state facts it has checked rather than describe a policy somebody intended.
|
|------------------------------------------------------------------------------
*/

export type HistoryResult =
  | { status: "ok"; items: SettingsHistoryItem[] }
  /** The table is not there. Different from "nothing has changed". */
  | { status: "absent" }
  | { status: "error" };

/**
 * Every settings change, across all entities, newest first.
 *
 * Unlike the per-page history panels from Batch 2, this is deliberately
 * unscoped: it is the one place to answer "who changed a setting, and when".
 */
export async function getAllSettingsHistory(limit = 60): Promise<HistoryResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sales_settings_history")
    .select("id, entity, changed_by, changed_at, old_values, new_values")
    .order("changed_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (error.code === "42P01") return { status: "absent" };
    console.error("getAllSettingsHistory error:", error);
    return { status: "error" };
  }

  const rows = (data ?? []) as unknown as {
    id: string;
    entity: "settings" | "fee" | "company" | "checklist";
    changed_by: string | null;
    changed_at: string;
    old_values: Record<string, unknown> | null;
    new_values: Record<string, unknown>;
  }[];

  const ids = Array.from(new Set(rows.map((row) => row.changed_by).filter((id): id is string => !!id)));
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, full_name").in("id", ids)
    : { data: [] as { id: string; full_name: string | null }[] };

  const items = rows
    .map((row) => ({
      id: row.id,
      entity: row.entity,
      changed_at: row.changed_at,
      changed_by_name: row.changed_by
        ? (profiles?.find((profile) => profile.id === row.changed_by)?.full_name ?? "Unknown")
        : "System",
      changes: describeSettingsChange(row.entity, row.old_values, row.new_values),
    }))
    .filter((item) => item.changes.length > 0);

  return { status: "ok", items };
}

export interface EnforcedFact {
  label: string;
  value: string;
  /** How this was established, so nothing here is a claim taken on trust. */
  evidence: string;
}

/**
 * Security facts, each checked rather than asserted.
 *
 * What is NOT here is as important: no session timeout, no password policy,
 * no two-factor status. Those are Supabase Auth project settings, not
 * something this application can read or enforce, and showing a value for
 * them would be showing a number nothing here honours.
 */
export async function getSecurityFacts(): Promise<{
  facts: EnforcedFact[];
  permissionKeyCount: number | null;
  roleCount: number | null;
}> {
  const supabase = await createClient();

  const [keys, roles] = await Promise.all([
    supabase.from("app_permissions").select("key", { count: "exact", head: true }),
    supabase.from("roles").select("id", { count: "exact", head: true }),
  ]);

  if (keys.error) console.error("getSecurityFacts keys error:", keys.error);
  if (roles.error) console.error("getSecurityFacts roles error:", roles.error);

  return {
    facts: [],
    permissionKeyCount: keys.error ? null : (keys.count ?? 0),
    roleCount: roles.error ? null : (roles.count ?? 0),
  };
}
