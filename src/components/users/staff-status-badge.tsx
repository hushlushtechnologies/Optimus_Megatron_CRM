"use client";

import { StatusBadge } from "@/src/components/ui/status-badge";
import { STAFF_STATUS_DISPLAY, type StaffStatus } from "@/src/lib/types/staff";

/*
| One badge, four states, and the colours mean something:
|
|   Active       green   works here and can sign in
|   Invited      blue    invited, has not signed in yet
|   Suspended    amber   works here, access blocked — a thing to resolve
|   Deactivated  grey    has left; the record is kept for the history
|
| Suspended is amber rather than red on purpose: red reads as an error in this
| interface, and a suspension is a decision somebody made, not a fault.
*/

export function StaffStatusBadge({ status }: { status: StaffStatus }) {
  const display = STAFF_STATUS_DISPLAY[status];
  return <StatusBadge label={display.label} colorHex={display.colorHex} />;
}
