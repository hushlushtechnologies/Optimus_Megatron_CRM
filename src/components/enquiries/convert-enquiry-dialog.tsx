"use client";

import { TriangleAlert, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { convertEnquiryAction } from "@/app/admin/enquiries/actions";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Modal } from "@/src/components/ui/modal";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import type { EnquiryCustomerMatch, EnquiryListRow } from "@/src/lib/types/enquiry";
import { cn } from "@/src/lib/utils/cn";
import { splitFullName } from "@/src/lib/utils/enquiry-format";

interface ConvertEnquiryDialogProps {
  enquiry: EnquiryListRow;
  matches: EnquiryCustomerMatch[];
  stages: { id: string; name: string }[];
  staff: { id: string; full_name: string }[];
  currentUserId: string;
  onClose: () => void;
}

const TEMPERATURES = ["Hot", "Warm", "Cold"] as const;

/**
 * Turning an enquiry into a lead.
 *
 * A review step rather than a button, because a customer record needs more
 * than a website form collects: a first and last name, a working email and a
 * UAE mobile. Anything missing is asked for here, where the person has the
 * enquiry in front of them — not reported as a failure afterwards.
 */
export function ConvertEnquiryDialog({
  enquiry,
  matches,
  stages,
  staff,
  currentUserId,
  onClose,
}: ConvertEnquiryDialogProps) {
  const router = useRouter();

  const suggested = splitFullName(enquiry.full_name);

  /*
   * An existing customer is pre-selected when there is exactly one match.
   * With two or more, nothing is chosen: guessing which of two people wrote
   * in is how a lead ends up on the wrong customer's record.
   */
  const [customerId, setCustomerId] = useState<string | null>(
    enquiry.customer_id ?? (matches.length === 1 ? matches[0].id : null),
  );

  const [firstName, setFirstName] = useState(suggested.firstName);
  const [lastName, setLastName] = useState(suggested.lastName);
  const [email, setEmail] = useState(enquiry.email ?? "");
  const [phone, setPhone] = useState(enquiry.phone ?? "");

  const [stageId, setStageId] = useState(stages[0]?.id ?? "");
  const [temperature, setTemperature] = useState<(typeof TEMPERATURES)[number]>("Warm");
  const [assignedStaffId, setAssignedStaffId] = useState<string | null>(enquiry.assigned_to ?? currentUserId);
  const [note, setNote] = useState(enquiry.message ?? "");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const creatingCustomer = customerId === null;

  const canSubmit =
    !saving &&
    stageId !== "" &&
    (!creatingCustomer ||
      (firstName.trim() !== "" && lastName.trim() !== "" && email.trim() !== "" && phone.trim() !== ""));

  const submit = async () => {
    setError(null);
    setSaving(true);

    try {
      const result = await convertEnquiryAction({
        id: enquiry.id,
        customerId,
        firstName,
        lastName,
        email,
        phone,
        stageId,
        temperature,
        assignedStaffId,
        note,
      });

      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      toast.success("Converted. Opening the lead.");

      if (result.leadId) router.push(`/admin/leads/${result.leadId}`);
      else router.refresh();
    } catch {
      const message = "Something went wrong. Check the enquiry before trying again.";
      setError(message);
      toast.error(message);
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
      size="lg"
      title="Convert to a lead"
      description="This creates the lead, and the customer record behind it if there isn't one yet."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Go back
          </Button>

          <Button onClick={submit} isLoading={saving} disabled={!canSubmit}>
            Convert
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {/* =================================================
            THE CUSTOMER
        ================================================= */}

        <div className="flex flex-col gap-2">
          <p className="text-label">Who is this?</p>

          {matches.length > 0 && (
            <p className="text-caption text-text-subtle">
              {matches.length === 1
                ? "Someone already on file matches this enquiry."
                : `${matches.length} people on file match this enquiry.`}{" "}
              Check it is the same person before choosing them.
            </p>
          )}

          <div className="flex flex-col gap-2">
            {matches.map((match) => (
              <button
                key={match.id}
                type="button"
                onClick={() => setCustomerId(match.id)}
                className={cn(
                  "focus-visible:ring-primary flex items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none",
                  customerId === match.id
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:bg-card-hover",
                )}
              >
                <UserCheck
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    customerId === match.id ? "text-primary" : "text-text-subtle",
                  )}
                  aria-hidden="true"
                />

                <span className="min-w-0">
                  <span className="text-body-sm text-text-primary block font-medium">
                    {match.full_name}
                    <span className="text-text-subtle font-normal"> · {match.customer_number}</span>
                  </span>

                  <span className="text-caption text-text-subtle block">
                    Matched on {match.matchedOn === "email" ? "email address" : "phone number"}
                    {match.matchedOn === "email" ? "" : ` · ${match.phone ?? ""}`}
                  </span>
                </span>
              </button>
            ))}

            <button
              type="button"
              onClick={() => setCustomerId(null)}
              className={cn(
                "focus-visible:ring-primary rounded-md border px-3 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none",
                creatingCustomer
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-card-hover",
              )}
            >
              <span className="text-body-sm text-text-primary block font-medium">Create a new customer</span>
              <span className="text-caption text-text-subtle block">
                From the details below, which you can correct first
              </span>
            </button>
          </div>
        </div>

        {/* =================================================
            NEW CUSTOMER DETAILS
        ================================================= */}

        {creatingCustomer && (
          <div className="border-border grid grid-cols-1 gap-4 rounded-md border border-dashed p-4 sm:grid-cols-2">
            <Input
              label="First name"
              required
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />

            <Input
              label="Last name"
              required
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />

            <Input
              label="Email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              hint={enquiry.email ? undefined : "The enquiry didn't include one."}
            />

            <Input
              label="Mobile"
              required
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              hint="A UAE mobile, such as 0501234567."
            />
          </div>
        )}

        {/* =================================================
            THE LEAD
        ================================================= */}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select
            label="Starting stage"
            required
            options={stages.map((stage) => ({ value: stage.id, label: stage.name }))}
            value={stageId}
            onChange={(event) => setStageId(event.target.value)}
            hint={stages.length === 0 ? "No open stages are set up." : undefined}
          />

          <Select
            label="How warm?"
            options={TEMPERATURES.map((item) => ({ value: item, label: item }))}
            value={temperature}
            onChange={(event) => setTemperature(event.target.value as (typeof TEMPERATURES)[number])}
          />

          <Select
            label="Who will handle it?"
            options={[
              { value: "", label: "Nobody yet" },
              ...staff.map((person) => ({ value: person.id, label: person.full_name })),
            ]}
            value={assignedStaffId ?? ""}
            onChange={(event) => setAssignedStaffId(event.target.value || null)}
          />
        </div>

        <Textarea
          label="First note on the lead"
          rows={3}
          maxLength={1000}
          showCharacterCount
          value={note}
          onChange={(event) => setNote(event.target.value)}
          hint="Starts as what they wrote. Edit it if a summary would serve the next person better."
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
  );
}
