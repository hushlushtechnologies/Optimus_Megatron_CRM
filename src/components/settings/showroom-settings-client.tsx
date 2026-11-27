"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Plus } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Modal } from "@/src/components/ui/modal";
import { SettingsSection } from "@/src/components/settings/settings-section";
import { SettingsToggle } from "@/src/components/settings/settings-toggle";
import { saveShowroomAction } from "@/app/admin/settings/organization/location-actions";
import { locationSchema } from "@/src/lib/validation/settings-sections";
import { cn } from "@/src/lib/utils/cn";
import type { ShowroomRow } from "@/src/lib/supabase/settings-section-queries";

/*
|--------------------------------------------------------------------------
| SHOWROOMS — PHASE 6
|--------------------------------------------------------------------------
|
| Nine modules filter and file records by showroom. Until now nothing in
| the app could add or rename one, so this is new writing rather than a
| move, and location-actions.ts sets out what that rests on.
|
| THERE IS NO DELETE, and that is deliberate. Cars, deals, test drives,
| reservations and enquiries reference locations.id with on delete set
| null, so deleting a showroom would succeed silently and blank the
| location on every historical record pointing at it. Switching one off
| keeps the history and takes it out of every picker, which is what
| closing a branch actually means. The dialog says so.
|
| Switched-off showrooms are listed, greyed, rather than hidden. Every
| other screen in the app only loads active ones, so if this page hid
| them too there would be no screen anywhere that could switch one back
| on.
*/

interface Draft {
  id: string | null;
  name: string;
  address: string;
  isActive: boolean;
  sortOrder: string;
}

function toDraft(showroom: ShowroomRow): Draft {
  return {
    id: showroom.id,
    name: showroom.name,
    address: showroom.address ?? "",
    isActive: showroom.isActive,
    sortOrder: String(showroom.sortOrder),
  };
}

function nextSortOrder(showrooms: readonly ShowroomRow[]): string {
  const highest = showrooms.reduce((max, showroom) => Math.max(max, showroom.sortOrder), 0);
  return String(highest + 10);
}

export function ShowroomSettingsClient({
  showrooms,
  addressSupported,
  canEdit,
}: {
  showrooms: ShowroomRow[];
  addressSupported: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const patch = (change: Partial<Draft>) =>
    setDraft((previous) => (previous ? { ...previous, ...change } : previous));

  const close = () => {
    setDraft(null);
    setErrors({});
  };

  const submit = async (payload: unknown, onDone: () => void) => {
    const parsed = locationSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        const key = String(issue.path[0] ?? "form");
        if (!next[key]) next[key] = issue.message;
      });
      setErrors(next);
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setErrors({});

    const result = await saveShowroomAction(parsed.data);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    onDone();
    router.refresh();
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await submit(
        {
          id: draft.id,
          name: draft.name,
          address: draft.address,
          isActive: draft.isActive,
          sortOrder: Number(draft.sortOrder),
        },
        () => {
          toast.success(draft.id ? "Showroom saved" : "Showroom added");
          close();
        },
      );
    } catch {
      toast.error("Something went wrong. Refresh the page and try again.");
    } finally {
      setSaving(false);
    }
  };

  /** Switching one off from the list, without opening the dialog. */
  const toggleActive = async (showroom: ShowroomRow) => {
    setBusyId(showroom.id);
    try {
      await submit(
        {
          id: showroom.id,
          name: showroom.name,
          address: showroom.address ?? "",
          isActive: !showroom.isActive,
          sortOrder: showroom.sortOrder,
        },
        () => toast.success(showroom.isActive ? "Showroom switched off" : "Showroom switched on"),
      );
    } catch {
      toast.error("Something went wrong. Refresh the page and try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      <SettingsSection
        title="Showrooms"
        icon={Building2}
        description="The locations vehicles sit at, test drives start from and deliveries happen at."
        effect="Switching a showroom off takes it out of every picker across the app. Records already filed against it keep it, so your history and your reports do not change."
      >
        {canEdit && (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Plus className="size-4" aria-hidden="true" />}
              onClick={() => {
                setDraft({
                  id: null,
                  name: "",
                  address: "",
                  isActive: true,
                  sortOrder: nextSortOrder(showrooms),
                });
                setErrors({});
              }}
            >
              Add a showroom
            </Button>
          </div>
        )}

        {!addressSupported && (
          <p
            role="status"
            className="border-border bg-card-hover/40 text-body-sm text-text-muted rounded-md border px-3 py-2.5"
          >
            Addresses aren&apos;t stored for showrooms yet, so there is no address field below. Running{" "}
            <code className="text-text-primary">sql/13-sprint-10-showroom-address.sql</code> adds the column
            and the field appears.
          </p>
        )}

        {showrooms.length === 0 ? (
          <p className="border-border text-body-sm text-text-muted rounded-md border border-dashed px-4 py-6 text-center">
            No showrooms yet. Add one and it becomes available everywhere a location is chosen.
          </p>
        ) : (
          <ul className="divide-border border-border divide-y overflow-hidden rounded-md border">
            {showrooms.map((showroom) => (
              <li
                key={showroom.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p
                    className={cn(
                      "text-body-sm font-medium",
                      showroom.isActive ? "text-text-primary" : "text-text-subtle",
                    )}
                  >
                    {showroom.name}
                    {!showroom.isActive && <span className="text-caption ml-2 font-normal">Off</span>}
                  </p>
                  <p className="text-caption text-text-subtle">
                    {showroom.address?.trim()
                      ? showroom.address
                      : addressSupported
                        ? "No address"
                        : `Order ${showroom.sortOrder}`}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDraft(toDraft(showroom));
                        setErrors({});
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      isLoading={busyId === showroom.id}
                      onClick={() => void toggleActive(showroom)}
                    >
                      {showroom.isActive ? "Switch off" : "Switch on"}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      <Modal
        isOpen={draft !== null}
        onClose={close}
        size="md"
        title={draft?.id ? "Edit showroom" : "Add a showroom"}
        description="A showroom can be switched off but not deleted, so records filed against it keep their location."
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={close} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" isLoading={saving} onClick={() => void save()}>
              {draft?.id ? "Save showroom" : "Add showroom"}
            </Button>
          </div>
        }
      >
        {draft && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Input
                label="Name"
                value={draft.name}
                onChange={(event) => patch({ name: event.target.value })}
              />
              {errors.name && (
                <p role="alert" className="text-body-sm text-red-500">
                  {errors.name}
                </p>
              )}
            </div>

            {addressSupported && (
              <div className="flex flex-col gap-1.5">
                <Input
                  label="Address"
                  value={draft.address}
                  onChange={(event) => patch({ address: event.target.value })}
                />
                {errors.address && (
                  <p role="alert" className="text-body-sm text-red-500">
                    {errors.address}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Input
                label="Display order"
                type="number"
                inputMode="numeric"
                min={0}
                max={9999}
                value={draft.sortOrder}
                onChange={(event) => patch({ sortOrder: event.target.value })}
              />
              <p className="text-caption text-text-subtle">
                Lower numbers come first in every showroom list across the app.
              </p>
              {errors.sortOrder && (
                <p role="alert" className="text-body-sm text-red-500">
                  {errors.sortOrder}
                </p>
              )}
            </div>

            <SettingsToggle
              label="Available to choose"
              description="When off, this showroom disappears from every picker. Records already filed against it keep it."
              checked={draft.isActive}
              onChange={(value) => patch({ isActive: value })}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
