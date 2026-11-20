"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TriangleAlert, UserCog, UserPlus } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Modal } from "@/src/components/ui/modal";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";

import { assignEnquiryAction } from "@/app/admin/enquiries/actions";

interface EnquiryAssignControlProps {
  enquiryId: string;
  /** null when nobody has it. */
  assignedTo: string | null;
  assignedToName: string | null;
  /** The version last read, so a concurrent change is caught. */
  version: number;
  staff: { id: string; full_name: string }[];
  currentUserId: string;
  canManage: boolean;
  onDone?: () => void;
}

/**
 * Who is handling this enquiry.
 *
 * Three ways in, because they are three different intentions:
 *
 *   - Taking it on yourself is one click. It is the common case and nobody
 *     should have to find their own name in a list of thirty to do it.
 *   - Handing it to somebody else opens a dialog and asks why, because the
 *     person receiving it will want to know, and the reason is written onto
 *     the history row rather than lost in a conversation.
 *   - Clearing it puts it back in the unassigned queue.
 *
 * The server re-reads the row and writes against the version it finds, so
 * two people reassigning at once get a clear refusal rather than one of them
 * silently overwriting the other.
 */
export function EnquiryAssignControl({
  enquiryId,
  assignedTo,
  assignedToName,
  version,
  staff,
  currentUserId,
  canManage,
  onDone,
}: EnquiryAssignControlProps) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const mine = assignedTo === currentUserId;

  const finish = () => {
    if (onDone) onDone();
    else router.refresh();
  };

  const send = async (next: string | null, reasonText: string, success: string) => {
    setError(null);
    setSaving(true);

    try {
      const result = await assignEnquiryAction({
        id: enquiryId,
        assignedTo: next,
        reason: reasonText,
        expectedVersion: version,
      });

      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      toast.success(success);
      setOpen(false);
      setTarget("");
      setReason("");
      finish();
    } catch {
      const message = "Something went wrong. Refresh the page and try again.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  /* Reassigning to whoever already has it is a no-op, so it isn't offered. */
  const others = staff.filter((person) => person.id !== assignedTo);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-body-sm text-text-primary">
          {assignedToName ? (
            <>
              {mine ? "You have this" : <span className="font-medium">{assignedToName}</span>}
              {mine ? "" : " has this"}
            </>
          ) : (
            <span className="text-text-subtle">Nobody has picked this up</span>
          )}
        </p>

        {canManage && (
          <div className="flex flex-wrap gap-2">
            {!mine && (
              <Button
                size="sm"
                variant="outline"
                className="h-11 sm:h-9"
                disabled={saving}
                onClick={() => void send(currentUserId, "", "This is yours now.")}
                leftIcon={<UserPlus className="size-4" aria-hidden="true" />}
              >
                Take it on
              </Button>
            )}

            {others.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-11 sm:h-9"
                disabled={saving}
                onClick={() => setOpen(true)}
                leftIcon={<UserCog className="size-4" aria-hidden="true" />}
              >
                {assignedTo ? "Hand over" : "Assign"}
              </Button>
            )}

            {assignedTo && (
              <Button
                size="sm"
                variant="ghost"
                className="h-11 sm:h-9"
                disabled={saving}
                onClick={() => void send(null, "", "Back in the unassigned queue.")}
              >
                Unassign
              </Button>
            )}
          </div>
        )}
      </div>

      {open && (
        <Modal
          isOpen
          onClose={() => {
            if (!saving) setOpen(false);
          }}
          size="md"
          title={assignedTo ? "Hand this over" : "Assign this enquiry"}
          description={
            assignedTo
              ? `${assignedToName ?? "Somebody"} has this at the moment. Whoever takes it over will see your reason on the history.`
              : "Whoever you pick will see it in their queue."
          }
          footer={
            <>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Go back
              </Button>

              <Button
                onClick={() => void send(target, reason, "Handed over.")}
                isLoading={saving}
                disabled={saving || target === ""}
              >
                {assignedTo ? "Hand over" : "Assign"}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Select
              label="To"
              required
              options={[
                { value: "", label: "Choose somebody" },
                ...others.map((person) => ({ value: person.id, label: person.full_name })),
              ]}
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            />

            <Textarea
              label="Why?"
              rows={2}
              maxLength={300}
              showCharacterCount
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              hint="Optional, but it saves the next person a phone call."
            />

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
