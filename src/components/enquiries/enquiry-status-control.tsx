"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw, TriangleAlert } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Modal } from "@/src/components/ui/modal";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { EnquiryStatusBadge } from "@/src/components/enquiries/enquiry-status-badge";
import { setEnquiryStatusAction } from "@/app/admin/enquiries/actions";
import { allowedNextStatuses, findStatus } from "@/src/lib/utils/enquiry-workflow";
import type { EnquiryWorkflow } from "@/src/lib/types/enquiry-workflow";

/** The statuses that always need a word about why. Mirrors the server rule. */
const NEEDS_REASON = new Set(["Cancelled", "Rejected"]);

interface EnquiryStatusControlProps {
  enquiryId: string;
  currentStatus: string;
  statusLabel: string;
  enquiryType: string;
  /** The version last read. Sent back so a concurrent edit is caught. */
  version: number;
  workflow: EnquiryWorkflow;
  canManage: boolean;
  onDone?: () => void;
}

/**
 * Moving an enquiry to another status.
 *
 * Only offers the moves the workflow allows for this enquiry's type, so a
 * Dream Car request is never shown Offer Sent. The server checks the same
 * rule — this is about not offering a dead end, not about security.
 */
export function EnquiryStatusControl({
  enquiryId,
  currentStatus,
  statusLabel,
  enquiryType,
  version,
  workflow,
  canManage,
  onDone,
}: EnquiryStatusControlProps) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const options = useMemo(
    () => allowedNextStatuses(workflow, currentStatus, enquiryType),
    [workflow, currentStatus, enquiryType],
  );

  const current = findStatus(workflow, currentStatus);
  const needsReason = NEEDS_REASON.has(target);
  const canSubmit = !saving && target !== "" && (!needsReason || reason.trim().length >= 3);

  const close = () => {
    if (saving) return;
    setOpen(false);
    setTarget("");
    setReason("");
    setError(null);
  };

  const submit = async () => {
    setError(null);
    setSaving(true);

    try {
      const result = await setEnquiryStatusAction({
        id: enquiryId,
        status: target,
        reason,
        expectedVersion: version,
      });

      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      toast.success(`Moved to ${findStatus(workflow, target)?.label ?? target}.`);
      close();
      // The caller refreshes if it wants to; otherwise the page reloads itself.
      if (onDone) onDone();
      else router.refresh();
    } catch {
      const message = "Something went wrong. Refresh the page and try again.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <EnquiryStatusBadge status={currentStatus} label={statusLabel} tone={current?.tone} />

        {canManage && options.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-11 sm:h-9"
            onClick={() => setOpen(true)}
            leftIcon={<RefreshCw className="size-4" aria-hidden="true" />}
          >
            Change
          </Button>
        )}
      </div>

      {/*
        A terminal status is explained rather than left as an absent button,
        so nobody hunts for a control that was never going to be there.
      */}
      {canManage && options.length === 0 && current?.isTerminal && (
        <p className="text-caption text-text-subtle mt-1.5">
          {current.label} is where an enquiry finishes. Nothing follows it.
        </p>
      )}

      {open && (
        <Modal
          isOpen
          onClose={close}
          size="md"
          title="Change status"
          description={`This enquiry is ${current?.label ?? currentStatus}. A ${enquiryType} enquiry can move to the statuses below.`}
          footer={
            <>
              <Button variant="outline" onClick={close} disabled={saving}>
                Go back
              </Button>

              <Button onClick={submit} isLoading={saving} disabled={!canSubmit}>
                Move it
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Select
              label="Move to"
              required
              options={[
                { value: "", label: "Choose a status" },
                ...options.map((item) => ({ value: item.key, label: item.label })),
              ]}
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            />

            {needsReason && (
              <Textarea
                label="Why?"
                required
                rows={3}
                maxLength={300}
                showCharacterCount
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                hint="A sentence is plenty. Whoever reads this next will not have had the conversation you just had."
              />
            )}

            {error && (
              <p
                role="alert"
                className="text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-400" aria-hidden="true" />
                {error}
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
