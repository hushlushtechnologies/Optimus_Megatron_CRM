import { History } from "lucide-react";
import { SettingsSection } from "@/src/components/settings/settings-section";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";
import type { SettingsHistoryItem } from "@/src/lib/types/sales-pricing";

/*
|--------------------------------------------------------------------------
| RECENT CHANGES, FOR ONE PAGE
|--------------------------------------------------------------------------
|
| Three states, and keeping them apart is the point:
|
|   null      the history could not be read — say so, loudly
|   empty     nothing on this page has ever changed
|   items     what changed, when, and who did it
|
| "The history couldn't be loaded" and "nothing has changed yet" look
| almost the same on screen and mean opposite things to anybody checking
| whether a financial control was moved. A failed read shown as "no
| changes yet" is the report-shaped version of the same mistake Sprint 9
| spent a lot of effort not making.
*/

export function SettingsHistoryPanel({
  items,
  emptyNote = "No changes recorded yet.",
}: {
  items: SettingsHistoryItem[] | null;
  emptyNote?: string;
}) {
  return (
    <SettingsSection
      title="Recent changes"
      icon={History}
      description="Changes to the settings on this page, newest first."
    >
      {items === null ? (
        <p
          role="alert"
          className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
        >
          The history couldn&apos;t be loaded, so this list is not a record of what has changed. Refresh the
          page to try again.
        </p>
      ) : items.length === 0 ? (
        <p className="text-body-sm text-text-subtle">{emptyNote}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id} className="border-border border-l-2 pl-3">
              {item.changes.map((change) => (
                <p key={change} className="text-body-sm text-text-primary">
                  {change}
                </p>
              ))}
              <p className="text-caption text-text-subtle">
                {formatDateTimeFull(item.changed_at)} · {item.changed_by_name}
              </p>
            </li>
          ))}
        </ol>
      )}
    </SettingsSection>
  );
}
