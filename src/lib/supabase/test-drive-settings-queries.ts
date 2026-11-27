import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { DEFAULT_CHECK_IN_OPENS_MINUTES } from "@/src/lib/utils/test-drive-check-in";

/*
|------------------------------------------------------------------------------
| Check-in windows, per showroom
|------------------------------------------------------------------------------
|
| `test_drive_location_settings` holds one number per showroom: how many
| minutes before a booking staff may record the customer as arrived. It is
| genuinely enforced — loadCheckInOpensMinutes reads it on every check-in, and
| the arrivals board uses it to decide which bookings are open — which is why
| it gets a real control rather than an explanation.
|
| A showroom with no row uses the default, and the editor shows that as the
| default rather than as a stored value. Those are different things: somebody
| looking at "30 minutes" should be able to tell whether that was chosen or
| inherited, because changing the default later moves one and not the other.
|
|------------------------------------------------------------------------------
*/

export interface CheckInWindowRow {
  locationId: string;
  locationName: string;
  /** null when the showroom has no row and is using the default. */
  storedMinutes: number | null;
  /** What the check-in flow will actually use. */
  effectiveMinutes: number;
}

export async function getCheckInWindows(): Promise<
  { status: "ok"; rows: CheckInWindowRow[]; defaultMinutes: number } | { status: "error" }
> {
  const supabase = await createClient();

  const [locations, settings] = await Promise.all([
    supabase.from("locations").select("id, name").eq("is_active", true).order("sort_order").order("name"),
    supabase.from("test_drive_location_settings").select("location_id, check_in_opens_minutes_before"),
  ]);

  if (locations.error || settings.error) {
    console.error("getCheckInWindows error:", locations.error ?? settings.error);
    return { status: "error" };
  }

  const stored = new Map<string, number>();
  ((settings.data ?? []) as { location_id: string; check_in_opens_minutes_before: number }[]).forEach(
    (row) => stored.set(row.location_id, Number(row.check_in_opens_minutes_before)),
  );

  const rows = ((locations.data ?? []) as { id: string; name: string | null }[]).map((location) => {
    const value = stored.get(location.id);
    return {
      locationId: location.id,
      locationName: location.name?.trim() || "Unnamed showroom",
      storedMinutes: value ?? null,
      effectiveMinutes: value ?? DEFAULT_CHECK_IN_OPENS_MINUTES,
    };
  });

  return { status: "ok", rows, defaultMinutes: DEFAULT_CHECK_IN_OPENS_MINUTES };
}
