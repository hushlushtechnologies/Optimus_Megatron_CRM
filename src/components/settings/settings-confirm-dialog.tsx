"use client";

import { ArrowRight, ShieldAlert, ShieldCheck } from "lucide-react";
import { Modal } from "@/src/components/ui/modal";
import { Button } from "@/src/components/ui/button";
import type { SettingsChangePreview } from "@/src/lib/types/settings-ui";

/*
|--------------------------------------------------------------------------
| CONFIRMING A CHANGE THAT CHANGES WHAT THE BUSINESS ALLOWS
|--------------------------------------------------------------------------
|
| Sprint 10 asks for confirmation on material policy changes, with the
| previous value and the effect shown. Which is worth doing properly,
| because a confirmation dialog that just says "Are you sure?" trains
| people to click through it, and then it is worse than nothing: it costs
| a click and buys no attention.
|
| So this one carries the three things that make someone actually read it:
|
|   what the value was, and what it is about to become
|   what that does in practice, in a sentence about deals and not fields
|   whether it loosens control or tightens it
|
| The direction is the part that matters. "Discount with no approval: 5% to
| 15%" is a number moving. "More discounts will be approved without anyone
| reviewing them" is the thing she would want to stop and think about. Only
| a loosening gets the warning colour; tightening gets a quiet tick, since
| there is nothing to warn about and a wall of red teaches people to ignore
| red.
|
| This dialog does not decide what is high-risk. Each page says which of
| its fields need it, because that depends on what the field does.
*/

export function SettingsConfirmDialog({
  isOpen,
  changes,
  saving,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  changes: readonly SettingsChangePreview[];
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const loosening = changes.some((change) => change.direction === "loosens");

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      size="lg"
      title={loosening ? "This change relaxes a control" : "Confirm this change"}
      description={
        loosening
          ? "Check the effect before applying it. The change is recorded against your name."
          : "The change is recorded against your name."
      }
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Go back
          </Button>
          <Button variant={loosening ? "destructive" : "primary"} onClick={onConfirm} isLoading={saving}>
            Apply
          </Button>
        </div>
      }
    >
      <ul className="flex flex-col gap-3">
        {changes.map((change) => {
          const warn = change.direction === "loosens";
          const Icon = warn ? ShieldAlert : ShieldCheck;

          return (
            <li
              key={change.label}
              className={`rounded-md border px-3 py-3 ${
                warn ? "border-red-500/40 bg-red-500/5" : "border-border bg-card-hover/40"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <Icon
                  className={`mt-0.5 size-4 shrink-0 ${warn ? "text-red-500" : "text-text-subtle"}`}
                  aria-hidden="true"
                />
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-body-sm text-text-primary font-medium">{change.label}</p>

                  <p className="text-body-sm text-text-muted flex flex-wrap items-center gap-1.5">
                    <span className="text-text-subtle line-through">{change.before}</span>
                    <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="text-text-primary font-medium">{change.after}</span>
                  </p>

                  <p className="text-caption text-text-muted">{change.effect}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
