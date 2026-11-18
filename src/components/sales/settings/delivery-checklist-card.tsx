"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ClipboardCheck, Plus } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Modal } from "@/src/components/ui/modal";
import { saveDeliveryTemplateAction } from "@/app/admin/sales/delivery-actions";
import { useMotion } from "@/src/hooks/use-motion";
import { DELIVERY_RULE_NOTE } from "@/src/lib/utils/sales-delivery";
import type { DeliveryTemplate } from "@/src/lib/types/sales-delivery";
import { cn } from "@/src/lib/utils/cn";

function TemplateDialog({
  template,
  onClose,
  onDone,
}: {
  template: DeliveryTemplate | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [label, setLabel] = useState(template?.label ?? "");
  const [required, setRequired] = useState(template?.is_required ?? true);
  const [active, setActive] = useState(template?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const result = await saveDeliveryTemplateAction({
        id: template?.id ?? null,
        label,
        isRequired: required,
        isActive: active,
      });
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(template ? "Check updated" : "Check added");
      onDone();
    } catch {
      setError("Something went wrong. Refresh the page and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={() => {
        if (!saving) onClose();
      }}
      size="md"
      title={template ? "Edit check" : "Add a check"}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Go back
          </Button>
          <Button onClick={submit} isLoading={saving} disabled={label.trim().length < 3}>
            {template ? "Save check" : "Add check"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="What needs to be done?"
          value={label}
          maxLength={80}
          onChange={(event) => setLabel(event.target.value)}
        />

        {template?.rule && (
          <p className="text-body-sm text-text-muted">
            {DELIVERY_RULE_NOTE[template.rule]} You can rename it, make it optional, or switch it off.
          </p>
        )}

        <label className="border-border flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-3 py-3">
          <input
            type="checkbox"
            checked={required}
            onChange={(event) => setRequired(event.target.checked)}
            className="accent-primary mt-1 size-4"
          />
          <span>
            <span className="text-body-sm text-text-primary block font-medium">Required for handover</span>
            <span className="text-caption text-text-subtle block">
              A vehicle can&apos;t be handed over until a required check is ready.
            </span>
          </span>
        </label>

        <label className="border-border flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-3 py-3">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
            className="accent-primary mt-1 size-4"
          />
          <span>
            <span className="text-body-sm text-text-primary block font-medium">
              Include on new deliveries
            </span>
            <span className="text-caption text-text-subtle block">
              Deliveries already prepared keep the checks they started with.
            </span>
          </span>
        </label>

        {error && (
          <p
            role="alert"
            className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5"
          >
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

/** The checks on the handover checklist. null templates means they couldn't be loaded. */
export function DeliveryChecklistCard({ templates }: { templates: DeliveryTemplate[] | null }) {
  const router = useRouter();
  const { fadeUp } = useMotion();
  const [editing, setEditing] = useState<DeliveryTemplate | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggle = async (template: DeliveryTemplate) => {
    setBusyId(template.id);
    try {
      const result = await saveDeliveryTemplateAction({
        id: template.id,
        label: template.label,
        isRequired: template.is_required,
        isActive: !template.is_active,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(template.is_active ? "Check switched off" : "Check switched on");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <motion.section
      {...fadeUp(4)}
      aria-label="Delivery checklist"
      className="surface-card flex flex-col gap-4 p-5"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="text-primary">
            <ClipboardCheck className="size-5" aria-hidden="true" />
          </span>
          <h2 className="text-h3">Delivery checklist</h2>
        </div>
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<Plus className="size-4" aria-hidden="true" />}
          onClick={() => setEditing("new")}
        >
          Add a check
        </Button>
      </header>

      <p className="text-body-sm text-text-muted">
        The checks to finish before a vehicle is handed over. Each delivery copies these when it is prepared,
        so changes here apply to new deliveries.
      </p>

      {templates === null ? (
        <p
          role="alert"
          className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5"
        >
          The checklist couldn&apos;t be loaded. Refresh the page to try again.
        </p>
      ) : templates.length === 0 ? (
        <p className="border-border text-body-sm text-text-muted rounded-md border border-dashed px-4 py-6 text-center">
          There are no checks yet, so a vehicle can be handed over straight away. Add some if you want a
          checklist.
        </p>
      ) : (
        <ul className="divide-border border-border divide-y overflow-hidden rounded-md border">
          {templates.map((template) => (
            <li
              key={template.id}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-body-sm font-medium",
                    template.is_active ? "text-text-primary" : "text-text-subtle",
                  )}
                >
                  {template.label}
                  {!template.is_active && <span className="text-caption ml-2 font-normal">Off</span>}
                </p>
                <p className="text-caption text-text-subtle">
                  {template.is_required ? "Required" : "Optional"}
                  {template.rule ? " · Checked automatically" : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(template)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  isLoading={busyId === template.id}
                  onClick={() => void toggle(template)}
                >
                  {template.is_active ? "Switch off" : "Switch on"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <TemplateDialog
          key={editing === "new" ? "new" : editing.id}
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </motion.section>
  );
}
