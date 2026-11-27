"use client";

import { saveLookupRowAction, toggleLookupRowAction } from "@/app/admin/settings/lookup-actions";
import { SettingsSection } from "@/src/components/settings/settings-section";
import { SettingsToggle } from "@/src/components/settings/settings-toggle";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Modal } from "@/src/components/ui/modal";
import { Select } from "@/src/components/ui/select";
import type { LookupRow, LookupTableData } from "@/src/lib/supabase/settings-lookup-queries";
import type { LookupFieldSpec, LookupTableSpec } from "@/src/lib/types/lookup-registry";
import { cn } from "@/src/lib/utils/cn";
import { Info, Lock, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

/*
|--------------------------------------------------------------------------
| ONE EDITOR FOR EVERY LOOKUP LIST
|--------------------------------------------------------------------------
|
| Driven by lookup-registry.ts. Twenty bespoke editors would be twenty
| chances to get "switch off, never delete" wrong.
|
| THERE IS NO DELETE BUTTON, anywhere, on purpose — and no delete action
| behind it either. Every value here is referenced by records that already
| exist. A retired value stays in the list, greyed, because this is the
| only screen that can switch it back on; every other screen in the app
| filters it out.
|
| Four lists are rename-and-reorder only. For those the add button and the
| switch are absent and the reason is on screen — not as a disabled
| control with a tooltip, which reads as something being broken, but as a
| sentence saying what this list is and why it is the way it is. The
| server checks the same rule against the registry, because a hidden
| button is not a rule.
*/

function fieldInput(
  field: LookupFieldSpec,
  value: string,
  onChange: (next: string) => void,
  disabled: boolean,
) {
  if (field.kind === "choice") {
    return (
      <Select
        label={field.label}
        disabled={disabled}
        value={value}
        options={(field.choices ?? []).map((choice) => ({ value: choice.value, label: choice.label }))}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  if (field.kind === "color") {
    return (
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            label={field.label}
            value={value}
            disabled={disabled}
            placeholder="#1F6FEB"
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
        {/* A swatch rather than a colour picker: the stored value is a hex
            string that appears in badges, and seeing it matters more than
            picking it. */}
        <span
          aria-hidden="true"
          className="border-border mb-1 size-9 shrink-0 rounded-md border"
          style={{ backgroundColor: /^#[0-9a-fA-F]{6}$/.test(value) ? value : "transparent" }}
        />
      </div>
    );
  }

  return (
    <Input
      label={field.label}
      value={value}
      disabled={disabled}
      maxLength={field.maxLength}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

interface Draft {
  key: string | null;
  label: string;
  isActive: boolean;
  sortOrder: string;
  parentKey: string | null;
  extra: Record<string, string>;
}

function draftFrom(spec: LookupTableSpec, row: LookupRow): Draft {
  const extra: Record<string, string> = {};
  spec.fields.forEach((field) => {
    extra[field.column] = row.extra[field.column] ?? "";
  });
  return {
    key: row.key,
    label: row.label,
    isActive: row.isActive,
    sortOrder: String(row.sortOrder),
    parentKey: row.parentKey,
    extra,
  };
}

function emptyDraft(spec: LookupTableSpec, rows: readonly LookupRow[], parentKey: string | null): Draft {
  const extra: Record<string, string> = {};
  spec.fields.forEach((field) => {
    extra[field.column] = field.kind === "choice" ? (field.choices?.[0]?.value ?? "") : "";
  });
  const highest = rows.reduce((max, row) => Math.max(max, row.sortOrder), 0);
  return {
    key: null,
    label: "",
    isActive: true,
    sortOrder: String(highest + 10),
    parentKey,
    extra,
  };
}

export function LookupEditor({ data, canEdit }: { data: LookupTableData; canEdit: boolean }) {
  const { spec, rows, parents, failed } = data;
  const router = useRouter();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** For models and variants: which parent's children to show. */
  const [parentFilter, setParentFilter] = useState<string>("all");

  const restricted = spec.mode !== "full";
  const patch = (change: Partial<Draft>) =>
    setDraft((previous) => (previous ? { ...previous, ...change } : previous));

  const visible =
    spec.parent && parentFilter !== "all" ? rows.filter((row) => row.parentKey === parentFilter) : rows;

  const parentName = (key: string | null) =>
    key ? (parents.find((parent) => parent.key === key)?.label ?? "(retired)") : "—";

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const result = await saveLookupRowAction({
        tableId: spec.id,
        key: draft.key,
        label: draft.label,
        isActive: draft.isActive,
        sortOrder: Number(draft.sortOrder) || 0,
        parentKey: draft.parentKey,
        extra: draft.extra,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success(draft.key ? `${spec.singular} saved` : `${spec.singular} added`);
      setDraft(null);
      router.refresh();
    } catch {
      setError("Something went wrong. Refresh the page and try again.");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (row: LookupRow) => {
    setBusyKey(row.key);
    try {
      const result = await toggleLookupRowAction({
        tableId: spec.id,
        key: row.key,
        isActive: !row.isActive,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(row.isActive ? `${row.label} switched off` : `${row.label} switched on`);
      router.refresh();
    } catch {
      toast.error("Something went wrong. Refresh the page and try again.");
    } finally {
      setBusyKey(null);
    }
  };

  const activeCount = rows.filter((row) => row.isActive).length;

  return (
    <SettingsSection title={spec.label} description={spec.description} effect={spec.usedBy}>
      {failed ? (
        <p
          role="alert"
          className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
        >
          This list couldn&apos;t be loaded, so nothing is shown. It has not been changed. Refresh the page to
          try again.
        </p>
      ) : (
        <>
          {restricted && (
            <p className="border-border bg-card-hover/40 text-body-sm text-text-muted flex items-start gap-2 rounded-md border px-3 py-2.5">
              <Lock className="text-text-subtle mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{spec.restriction}</span>
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-caption text-text-subtle">
              {activeCount} of {rows.length} available
            </p>
            <div className="flex items-center gap-2">
              {spec.parent && parents.length > 0 && (
                <Select
                  aria-label={`Filter by ${spec.parent.label.toLowerCase()}`}
                  value={parentFilter}
                  options={[
                    { value: "all", label: `All ${spec.parent.label.toLowerCase()}s` },
                    ...parents.map((parent) => ({ value: parent.key, label: parent.label })),
                  ]}
                  onChange={(event) => setParentFilter(event.target.value)}
                />
              )}
              {canEdit && !restricted && (
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<Plus className="size-4" aria-hidden="true" />}
                  onClick={() =>
                    setDraft(
                      emptyDraft(
                        spec,
                        rows,
                        parentFilter !== "all" ? parentFilter : (parents[0]?.key ?? null),
                      ),
                    )
                  }
                >
                  Add {spec.singular === "status" ? "a status" : `a ${spec.singular}`}
                </Button>
              )}
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="border-border text-body-sm text-text-muted rounded-md border border-dashed px-4 py-6 text-center">
              Nothing in this list yet.
            </p>
          ) : (
            <ul className="divide-border border-border divide-y overflow-hidden rounded-md border">
              {visible.map((row) => (
                <li
                  key={row.key}
                  className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    {row.extra.color_hex && /^#[0-9a-fA-F]{6}$/.test(row.extra.color_hex) && (
                      <span
                        aria-hidden="true"
                        className="border-border size-3 shrink-0 rounded-full border"
                        style={{ backgroundColor: row.extra.color_hex }}
                      />
                    )}
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "text-body-sm font-medium",
                          row.isActive ? "text-text-primary" : "text-text-subtle",
                        )}
                      >
                        {row.label}
                        {!row.isActive && (
                          <span className="text-caption ml-2 font-normal">
                            Off — kept on records that used it
                          </span>
                        )}
                      </p>
                      {spec.parent && (
                        <p className="text-caption text-text-subtle">{parentName(row.parentKey)}</p>
                      )}
                    </div>
                  </div>

                  {canEdit && (
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="outline" onClick={() => setDraft(draftFrom(spec, row))}>
                        Edit
                      </Button>
                      {!restricted && (
                        <Button
                          size="sm"
                          variant="ghost"
                          isLoading={busyKey === row.key}
                          onClick={() => void toggle(row)}
                        >
                          {row.isActive ? "Switch off" : "Switch on"}
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Modal
        isOpen={draft !== null}
        onClose={() => {
          setDraft(null);
          setError(null);
        }}
        size="md"
        title={draft?.key ? `Edit ${spec.singular}` : `Add a ${spec.singular}`}
        description={
          restricted
            ? "The name and position can change. Nothing else about this value can."
            : `Values are switched off rather than deleted, so records that used this ${spec.singular} keep it.`
        }
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" isLoading={saving} onClick={() => void save()}>
              Save
            </Button>
          </div>
        }
      >
        {draft && (
          <div className="flex flex-col gap-4">
            {error && (
              <p
                role="alert"
                className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
              >
                {error}
              </p>
            )}

            <Input
              label="Name"
              value={draft.label}
              onChange={(event) => patch({ label: event.target.value })}
            />

            {spec.parent && (
              <Select
                label={spec.parent.label}
                value={draft.parentKey ?? ""}
                disabled={draft.key !== null}
                options={[
                  ...(draft.parentKey && !parents.some((parent) => parent.key === draft.parentKey)
                    ? [{ value: draft.parentKey, label: parentName(draft.parentKey) }]
                    : []),
                  ...parents.map((parent) => ({ value: parent.key, label: parent.label })),
                ]}
                onChange={(event) => patch({ parentKey: event.target.value })}
              />
            )}
            {spec.parent && draft.key !== null && (
              <p className="text-caption text-text-subtle flex items-start gap-1.5">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  A {spec.singular} can&apos;t be moved to a different {spec.parent.label.toLowerCase()}.
                  Vehicles are already filed against this pairing, and moving it would change what they say
                  they are.
                </span>
              </p>
            )}

            {spec.fields.map((field) => (
              <div key={field.column} className="flex flex-col gap-1">
                {fieldInput(
                  field,
                  draft.extra[field.column] ?? "",
                  (next) => patch({ extra: { ...draft.extra, [field.column]: next } }),
                  restricted,
                )}
                {field.help && <p className="text-caption text-text-subtle">{field.help}</p>}
              </div>
            ))}

            {spec.hasSortOrder && (
              <div className="flex flex-col gap-1">
                <Input
                  label="Display order"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={9999}
                  value={draft.sortOrder}
                  onChange={(event) => patch({ sortOrder: event.target.value })}
                />
                <p className="text-caption text-text-subtle">Lower numbers come first in every list.</p>
              </div>
            )}

            {spec.hasSlug && draft.key !== null && (
              <p className="text-caption text-text-subtle">
                This value also has a fixed internal name that code matches on. It isn&apos;t editable, and
                renaming above doesn&apos;t change it.
              </p>
            )}

            {!restricted && (
              <SettingsToggle
                label="Available to choose"
                description={`When off, this ${spec.singular} disappears from every picker. Records that already use it keep it.`}
                checked={draft.isActive}
                onChange={(value) => patch({ isActive: value })}
              />
            )}
          </div>
        )}
      </Modal>
    </SettingsSection>
  );
}
