"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { SettingsToggle } from "@/src/components/settings/settings-toggle";
import { setNotificationPreferenceAction } from "@/app/admin/settings/communications/notification-actions";
import type { PreferenceGroup } from "@/src/lib/types/notification-catalog";

/*
|--------------------------------------------------------------------------
| PERSONAL NOTIFICATION PREFERENCES — PHASE 18
|--------------------------------------------------------------------------
|
| A mandatory group is not rendered as a disabled switch. A greyed-out
| toggle reads as something broken, or as something you could turn off if
| only you had the right role — and neither is true here: nobody can turn
| these off, including the person who owns the business. So it is shown as
| a statement with the reason, which is what it actually is.
|
| No optimistic update. A toggle that flips immediately and then silently
| fails leaves somebody believing they have switched off a notification
| they are still receiving. It waits for the server and refreshes.
*/

export function NotificationPreferenceList({
  groups,
  disabledKeys,
}: {
  groups: readonly PreferenceGroup[];
  /** Keys this person has switched off. Everything else is on. */
  disabledKeys: readonly string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const off = new Set(disabledKeys);

  const optional = groups.filter((group) => !group.mandatory);
  const mandatory = groups.filter((group) => group.mandatory);

  const change = async (group: PreferenceGroup, enabled: boolean) => {
    setBusy(group.key);
    try {
      const result = await setNotificationPreferenceAction({
        preferenceKey: group.key,
        enabled,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(enabled ? `${group.label} back on` : `${group.label} switched off`);
      router.refresh();
    } catch {
      toast.error("Something went wrong. Refresh the page to see where it stands.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {optional.map((group) => (
          <div key={group.key} className={busy === group.key ? "opacity-60" : undefined}>
            <SettingsToggle
              label={group.label}
              description={group.description}
              checked={!off.has(group.key)}
              disabled={busy !== null}
              onChange={(value) => void change(group, value)}
            />
          </div>
        ))}
      </div>

      {mandatory.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-body-sm text-text-primary font-medium">Always on</p>
          {mandatory.map((group) => (
            <div
              key={group.key}
              className="border-border bg-card-hover/40 flex items-start gap-2.5 rounded-md border px-3 py-3"
            >
              <Lock className="text-text-subtle mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-body-sm text-text-primary font-medium">{group.label}</p>
                <p className="text-caption text-text-muted">{group.description}</p>
                {group.mandatoryReason && (
                  <p className="text-caption text-text-subtle mt-1">{group.mandatoryReason}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
