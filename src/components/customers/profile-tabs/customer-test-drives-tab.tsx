import Link from "next/link";
import { CalendarPlus } from "lucide-react";

import { getTestDrivesForPanel } from "@/src/lib/supabase/test-drive-panel-queries";
import { currentUserTestDrivePermissions } from "@/src/lib/supabase/test-drive-permissions";
import { TestDrivePanelList } from "@/src/components/test-drives/panel/test-drive-panel-list";

/**
 * Every test drive this customer has had, newest first.
 *
 * Reuses the same panel the Lead Detail page uses, so a drive looks and reads
 * identically wherever it appears. `showLead` is on here because a customer
 * can have drives across several leads.
 */
export async function CustomerTestDrivesTab({ customerId }: { customerId: string }) {
  const [load, permissions] = await Promise.all([
    getTestDrivesForPanel({ customerId }),
    currentUserTestDrivePermissions(),
  ]);

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-sm text-text-muted">Every test drive booked for this customer.</p>

        {permissions.create && (
          <Link
            href={`/admin/test-drives/new?customerId=${customerId}`}
            className="bg-primary text-body-sm hover:bg-primary-hover focus-visible:ring-primary inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-[#0b1220] transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <CalendarPlus className="size-4" aria-hidden="true" />
            Schedule test drive
          </Link>
        )}
      </div>

      <TestDrivePanelList
        load={load}
        showLead
        emptyTitle="No test drives for this customer yet"
        emptyDescription={
          permissions.create
            ? "Schedule one and it appears here, with its result once it has happened."
            : "Test drives booked for this customer appear here."
        }
      />
    </div>
  );
}
