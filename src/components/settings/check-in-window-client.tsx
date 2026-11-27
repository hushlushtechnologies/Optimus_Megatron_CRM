"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { setCheckInWindowAction } from "@/app/admin/settings/operations/test-drive-actions";
import type { CheckInWindowRow } from "@/src/lib/supabase/test-drive-settings-queries";

/*
|--------------------------------------------------------------------------
| CHECK-IN WINDOWS
|--------------------------------------------------------------------------
|
| One number per showroom, saved per row rather than through a page-wide
| save bar — these are independent values and nothing is validated across
| them, so a single Save would only create the chance of one showroom's
| change overwriting another's.
|
| "Using the default" is shown as its own state rather than as the default
| number typed into the box. Somebody looking at 60 minutes should be able
| to tell whether that was chosen for this showroom or inherited, because
| changing the default later moves one and not the other.
*/

export function CheckInWindowClient({
  rows,
  defaultMinutes,
  canEdit,
}: {
  rows: CheckInWindowRow[];
  defaultMinutes: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const valueFor = (row: CheckInWindowRow) =>
    drafts[row.locationId] ?? (row.storedMinutes === null ? "" : String(row.storedMinutes));

  const save = async (row: CheckInWindowRow, clear: boolean) => {
    setBusy(row.locationId);
    try {
      const raw = valueFor(row).trim();
      const minutes = clear || raw === "" ? null : Number(raw);

      if (minutes !== null && !Number.isInteger(minutes)) {
        toast.error("Enter a whole number of minutes.");
        return;
      }

      const result = await setCheckInWindowAction({ locationId: row.locationId, minutes });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        minutes === null
          ? `${row.locationName} is back on the default`
          : `${row.locationName} set to ${minutes} minutes`,
      );
      setDrafts((previous) => {
        const next = { ...previous };
        delete next[row.locationId];
        return next;
      });
      router.refresh();
    } catch {
      toast.error("Something went wrong. Refresh the page and try again.");
    } finally {
      setBusy(null);
    }
  };

  if (rows.length === 0) {
    return (
      <p className="border-border text-body-sm text-text-muted rounded-md border border-dashed px-4 py-6 text-center">
        No active showrooms, so there is nothing to set a window for.
      </p>
    );
  }

  return (
    <ul className="divide-border border-border divide-y overflow-hidden rounded-md border">
      {rows.map((row) => (
        <li key={row.locationId} className="flex flex-col gap-2 px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-body-sm text-text-primary font-medium">{row.locationName}</p>
            <p className="text-caption text-text-subtle">
              {row.storedMinutes === null
                ? `Using the default of ${defaultMinutes} minutes`
                : `Set to ${row.storedMinutes} minutes`}
            </p>
          </div>

          {canEdit && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-40">
                <Input
                  label="Minutes before"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={1440}
                  placeholder={String(defaultMinutes)}
                  value={valueFor(row)}
                  onChange={(event) =>
                    setDrafts((previous) => ({ ...previous, [row.locationId]: event.target.value }))
                  }
                />
              </div>
              <Button
                size="sm"
                variant="secondary"
                isLoading={busy === row.locationId}
                onClick={() => void save(row, false)}
              >
                Save
              </Button>
              {row.storedMinutes !== null && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() => void save(row, true)}
                >
                  Use the default
                </Button>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
