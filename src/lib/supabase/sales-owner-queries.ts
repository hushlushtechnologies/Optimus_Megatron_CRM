import { createClient } from "@/src/lib/supabase/server";
import type { AssignmentHistoryItem } from "@/src/lib/types/sales-owner";

interface AssignmentRow {
  id: string;
  previous_owner_id: string | null;
  new_owner_id: string | null;
  changed_by: string | null;
  changed_at: string;
  reason: string | null;
}

/** Every owner change on a deal, newest first. Returns null (not an empty list) when it can't be loaded. */
export async function getDealAssignmentHistory(dealId: string): Promise<AssignmentHistoryItem[] | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sales_deal_assignments")
    .select("id, previous_owner_id, new_owner_id, changed_by, changed_at, reason")
    .eq("deal_id", dealId)
    .order("changed_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("getDealAssignmentHistory error:", error);
    return null;
  }

  const rows = (data ?? []) as unknown as AssignmentRow[];
  const ids = new Set<string>();
  rows.forEach((row) => {
    [row.previous_owner_id, row.new_owner_id, row.changed_by].forEach((id) => {
      if (id) ids.add(id);
    });
  });

  const { data: profiles, error: profilesError } = ids.size
    ? await supabase.from("profiles").select("id, full_name").in("id", Array.from(ids))
    : { data: [] as { id: string; full_name: string | null }[], error: null };
  if (profilesError) console.error("getDealAssignmentHistory names error:", profilesError);

  const name = (id: string | null): string | null =>
    id ? profiles?.find((profile) => profile.id === id)?.full_name?.trim() || "Unnamed staff" : null;

  return rows.map((row) => ({
    id: row.id,
    previous_owner_name: name(row.previous_owner_id),
    new_owner_name: name(row.new_owner_id),
    changed_by_name: row.changed_by ? (name(row.changed_by) ?? "Unknown") : "System",
    changed_at: row.changed_at,
    reason: row.reason,
  }));
}
