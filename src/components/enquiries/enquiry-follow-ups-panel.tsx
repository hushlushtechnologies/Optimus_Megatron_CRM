"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarClock,
  CalendarPlus,
  Check,
  CircleSlash,
  Clock,
  MessageSquarePlus,
  PhoneOff,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Modal } from "@/src/components/ui/modal";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";

import { EnquirySection } from "@/src/components/enquiries/enquiry-detail-section";
import {
  completeEnquiryFollowUpAction,
  createEnquiryFollowUpAction,
  logEnquiryContactAction,
  rescheduleEnquiryFollowUpAction,
  setEnquiryFollowUpStatusAction,
} from "@/app/admin/enquiries/work-actions";
import {
  CONTACT_FOLLOW_UP_TYPES,
  FOLLOW_UP_STATUS_TONES,
  FOLLOW_UP_TYPES,
  isOverdue,
  REMINDER_CHOICES,
  type EnquiryFollowUp,
} from "@/src/lib/types/enquiry-work";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";

/* =========================================================
   HELPERS
========================================================= */

/**
 * Now, as a datetime-local input wants it.
 *
 * Built from the Dubai wall clock rather than UTC, because the value goes
 * straight into a box somebody reads as local time — and the schema appends
 * +04:00 when it comes back.
 */
function dubaiLocalNow(offsetMinutes = 0): string {
  const dubai = new Date(Date.now() + (4 * 60 + offsetMinutes) * 60 * 1000);
  return dubai.toISOString().slice(0, 16);
}

/* =========================================================
   ONE FOLLOW-UP
========================================================= */

function FollowUpRow({
  followUp,
  canManage,
  busy,
  onComplete,
  onReschedule,
  onStatus,
}: {
  followUp: EnquiryFollowUp;
  canManage: boolean;
  busy: boolean;
  onComplete: (followUp: EnquiryFollowUp) => void;
  onReschedule: (followUp: EnquiryFollowUp) => void;
  onStatus: (followUp: EnquiryFollowUp, status: "Missed" | "Cancelled") => void;
}) {
  const overdue = isOverdue(followUp);
  const open =
    followUp.status === "Scheduled" || followUp.status === "Rescheduled" || followUp.status === "Missed";

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-body-sm text-text-primary font-medium">{followUp.type}</span>

        <Badge status={FOLLOW_UP_STATUS_TONES[followUp.status]}>{followUp.status}</Badge>

        {/* Overdue is the one thing on this row somebody has to act on. */}
        {overdue && (
          <span className="text-caption flex items-center gap-1 text-amber-400">
            <TriangleAlert className="size-3.5" aria-hidden="true" />
            overdue
          </span>
        )}
      </div>

      <p className="text-caption text-text-subtle flex flex-wrap items-center gap-1.5">
        <Clock className="size-3" aria-hidden="true" />
        {formatDateTimeFull(followUp.scheduledAt)}
        {followUp.assignedToName && (
          <>
            <span>·</span>
            <span>{followUp.assignedToName}</span>
          </>
        )}
        {followUp.reminderMinutesBefore !== null && followUp.status === "Scheduled" && (
          <>
            <span>·</span>
            <span>
              {REMINDER_CHOICES.find((item) => item.minutes === followUp.reminderMinutesBefore)?.label ??
                `reminder ${followUp.reminderMinutesBefore} min before`}
            </span>
          </>
        )}
      </p>

      {followUp.notes && (
        <p className="text-body-sm text-text-muted break-words whitespace-pre-wrap">{followUp.notes}</p>
      )}

      {/* The outcome is the useful half of a completed follow-up. */}
      {followUp.outcomeNotes && (
        <div className="border-border border-l-2 pl-3">
          <p className="text-body-sm text-text-primary break-words whitespace-pre-wrap">
            {followUp.outcomeNotes}
          </p>
          <p className="text-caption text-text-subtle mt-0.5">
            {followUp.completedByName ?? "Someone"}
            {followUp.completedAt ? ` · ${formatDateTimeFull(followUp.completedAt)}` : ""}
          </p>
        </div>
      )}

      {canManage && open && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onComplete(followUp)}
            leftIcon={<Check className="size-4" aria-hidden="true" />}
          >
            Done
          </Button>

          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => onReschedule(followUp)}
            leftIcon={<CalendarClock className="size-4" aria-hidden="true" />}
          >
            Move
          </Button>

          {followUp.status === "Scheduled" && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => onStatus(followUp, "Missed")}
              leftIcon={<PhoneOff className="size-4" aria-hidden="true" />}
            >
              Missed
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => onStatus(followUp, "Cancelled")}
            leftIcon={<CircleSlash className="size-4" aria-hidden="true" />}
          >
            Call it off
          </Button>
        </div>
      )}
    </li>
  );
}

/* =========================================================
   PANEL
========================================================= */

type OpenDialog = "schedule" | "log" | "complete" | "reschedule" | null;

interface EnquiryFollowUpsPanelProps {
  enquiryId: string;
  /** null means they couldn't be read, which is not the same as none. */
  followUps: EnquiryFollowUp[] | null;
  staff: { id: string; full_name: string }[];
  canManage: boolean;
  index?: number;
}

/**
 * What is planned, and what has already been said.
 *
 * Two lists from one table. A completed follow-up of type Phone Call,
 * WhatsApp or Email *is* a record that somebody made contact — who, when,
 * and what came of it are already on the row. A separate communications
 * table would hold the same six columns and immediately start disagreeing
 * with this one about which calls had happened.
 *
 * "Log contact" exists because the most common thing anybody does to an
 * enquiry is speak to the customer without having scheduled it first, and
 * making them schedule a call into the past before they can record it ends
 * with the call not being recorded.
 */
export function EnquiryFollowUpsPanel({
  enquiryId,
  followUps,
  staff,
  canManage,
  index = 0,
}: EnquiryFollowUpsPanelProps) {
  const router = useRouter();

  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [subject, setSubject] = useState<EnquiryFollowUp | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Scheduling */
  const [type, setType] = useState<string>("Phone Call");
  const [when, setWhen] = useState(() => dubaiLocalNow(60));
  const [assignee, setAssignee] = useState("");
  const [notes, setNotes] = useState("");
  const [reminder, setReminder] = useState<string>("60");

  /* Completing and logging */
  const [outcome, setOutcome] = useState("");

  const close = () => {
    if (busy) return;
    setDialog(null);
    setSubject(null);
    setError(null);
    setOutcome("");
    setNotes("");
  };

  const run = async (work: () => Promise<{ error: string | null }>, success: string) => {
    setError(null);
    setBusy(true);

    try {
      const result = await work();

      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      toast.success(success);
      close();
      router.refresh();
    } catch {
      const message = "Something went wrong. Refresh the page and try again.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const all = followUps ?? [];

  /*
   * Outstanding above done, because one is work and the other is record.
   * Cancelled ones sit with the done: they are finished, just not usefully.
   */
  const outstanding = all.filter(
    (item) => item.status === "Scheduled" || item.status === "Rescheduled" || item.status === "Missed",
  );
  const finished = all.filter((item) => item.status === "Completed" || item.status === "Cancelled");

  const contact = finished.filter(
    (item) => item.status === "Completed" && CONTACT_FOLLOW_UP_TYPES.includes(item.type),
  );

  return (
    <>
      <EnquirySection
        title="Follow-ups and contact"
        index={index}
        icon={<CalendarClock className="size-4" aria-hidden="true" />}
        description="What is planned, and what has already been said."
        action={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setType("Phone Call");
                  setWhen(dubaiLocalNow(60));
                  setAssignee("");
                  setReminder("60");
                  setDialog("schedule");
                }}
                leftIcon={<CalendarPlus className="size-4" aria-hidden="true" />}
              >
                Schedule
              </Button>

              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setType("Phone Call");
                  /* Now, not the hour ahead the schedule dialog wants. */
                  setWhen(dubaiLocalNow());
                  setOutcome("");
                  setDialog("log");
                }}
                leftIcon={<MessageSquarePlus className="size-4" aria-hidden="true" />}
              >
                Log contact
              </Button>
            </div>
          ) : undefined
        }
      >
        {followUps === null ? (
          <p
            role="alert"
            className="text-body-sm text-text-primary rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2"
          >
            The follow-ups couldn&apos;t be loaded. Refresh the page to try again.
          </p>
        ) : all.length === 0 ? (
          <p className="text-body-sm text-text-muted">
            Nothing planned and nothing logged. If you have spoken to this customer, log it — the next person
            will not know otherwise.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {outstanding.length > 0 && (
              <div>
                <p className="text-label">Outstanding</p>
                <ul className="divide-border mt-2 divide-y">
                  {outstanding.map((item) => (
                    <FollowUpRow
                      key={item.id}
                      followUp={item}
                      canManage={canManage}
                      busy={busy}
                      onComplete={(f) => {
                        setSubject(f);
                        setOutcome("");
                        setDialog("complete");
                      }}
                      onReschedule={(f) => {
                        setSubject(f);
                        setWhen(dubaiLocalNow(60));
                        setNotes("");
                        setDialog("reschedule");
                      }}
                      onStatus={(f, status) =>
                        void run(
                          () => setEnquiryFollowUpStatusAction({ followUpId: f.id, status, reason: "" }),
                          status === "Missed" ? "Marked as missed." : "Called off.",
                        )
                      }
                    />
                  ))}
                </ul>
              </div>
            )}

            {/* ---- Communications: the contact that actually happened ---- */}

            {contact.length > 0 && (
              <div>
                <p className="text-label">Contact so far</p>
                <p className="text-caption text-text-subtle mt-0.5">
                  Calls, messages and emails somebody recorded. Nothing is sent from here.
                </p>

                <ul className="divide-border mt-2 divide-y">
                  {contact.map((item) => (
                    <FollowUpRow
                      key={item.id}
                      followUp={item}
                      canManage={false}
                      busy={busy}
                      onComplete={() => {}}
                      onReschedule={() => {}}
                      onStatus={() => {}}
                    />
                  ))}
                </ul>
              </div>
            )}

            {/* Everything else that is finished — visits, inspections, calls called off. */}
            {finished.length > contact.length && (
              <div>
                <p className="text-label">Also done</p>
                <ul className="divide-border mt-2 divide-y">
                  {finished
                    .filter((item) => !contact.includes(item))
                    .map((item) => (
                      <FollowUpRow
                        key={item.id}
                        followUp={item}
                        canManage={false}
                        busy={busy}
                        onComplete={() => {}}
                        onReschedule={() => {}}
                        onStatus={() => {}}
                      />
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </EnquirySection>

      {/* ===================================================
          SCHEDULE
      =================================================== */}

      {dialog === "schedule" && (
        <Modal
          isOpen
          onClose={close}
          size="md"
          title="Schedule a follow-up"
          description="It appears in the list and on the enquiry's next-follow-up date."
          footer={
            <>
              <Button variant="outline" onClick={close} disabled={busy}>
                Go back
              </Button>

              <Button
                isLoading={busy}
                disabled={busy || when === ""}
                onClick={() =>
                  void run(
                    () =>
                      createEnquiryFollowUpAction({
                        enquiryId,
                        type,
                        scheduledAt: when,
                        assignedTo: assignee || null,
                        notes,
                        reminderMinutesBefore: reminder === "" ? null : Number(reminder),
                      }),
                    "Follow-up scheduled.",
                  )
                }
              >
                Schedule it
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Select
              label="What kind"
              required
              options={FOLLOW_UP_TYPES.map((item) => ({ value: item, label: item }))}
              value={type}
              onChange={(event) => setType(event.target.value)}
            />

            <Input
              label="When"
              required
              type="datetime-local"
              value={when}
              min={dubaiLocalNow()}
              onChange={(event) => setWhen(event.target.value)}
              hint="Dubai time."
            />

            <Select
              label="Who does it"
              options={[
                { value: "", label: "Whoever has the enquiry" },
                ...staff.map((person) => ({ value: person.id, label: person.full_name })),
              ]}
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
            />

            <Select
              label="Remind"
              options={REMINDER_CHOICES.map((item) => ({
                value: item.minutes === null ? "" : String(item.minutes),
                label: item.label,
              }))}
              value={reminder}
              onChange={(event) => setReminder(event.target.value)}
            />

            <Textarea
              label="Anything to prepare"
              rows={2}
              maxLength={2000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />

            {error && (
              <p role="alert" className="text-body-sm text-text-primary">
                {error}
              </p>
            )}
          </div>
        </Modal>
      )}

      {/* ===================================================
          LOG CONTACT THAT ALREADY HAPPENED
      =================================================== */}

      {dialog === "log" && (
        <Modal
          isOpen
          onClose={close}
          size="md"
          title="Log contact"
          description="For a call, message or email that has already happened."
          footer={
            <>
              <Button variant="outline" onClick={close} disabled={busy}>
                Go back
              </Button>

              <Button
                isLoading={busy}
                disabled={busy || outcome.trim().length === 0}
                onClick={() =>
                  void run(
                    () =>
                      logEnquiryContactAction({
                        enquiryId,
                        type,
                        happenedAt: when,
                        outcomeNotes: outcome,
                      }),
                    "Logged.",
                  )
                }
              >
                Log it
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Select
              label="How"
              required
              options={CONTACT_FOLLOW_UP_TYPES.map((item) => ({ value: item, label: item }))}
              value={type}
              onChange={(event) => setType(event.target.value)}
            />

            {/*
              Defaults to now, because most contact is logged straight after
              it happens. Editable because plenty of it isn't: a morning of
              calls written up at five o'clock would otherwise all read as
              five o'clock, and the follow-up history would be wrong about
              the one thing it exists to record.
            */}
            <Input
              label="When"
              type="datetime-local"
              required
              max={dubaiLocalNow()}
              value={when}
              onChange={(event) => setWhen(event.target.value)}
              hint="Now, unless you are writing up something earlier."
            />

            <Textarea
              label="What came of it"
              required
              rows={4}
              maxLength={2000}
              showCharacterCount
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
              hint="The part worth keeping. Whoever picks this up next will not have heard the call."
            />

            {error && (
              <p role="alert" className="text-body-sm text-text-primary">
                {error}
              </p>
            )}
          </div>
        </Modal>
      )}

      {/* ===================================================
          COMPLETE
      =================================================== */}

      {dialog === "complete" && subject && (
        <Modal
          isOpen
          onClose={close}
          size="md"
          title={`Mark this ${subject.type.toLowerCase()} done`}
          description="Say what came of it. A follow-up ticked off with no note says somebody made contact and nothing about what was said."
          footer={
            <>
              <Button variant="outline" onClick={close} disabled={busy}>
                Go back
              </Button>

              <Button
                isLoading={busy}
                disabled={busy || outcome.trim().length === 0}
                onClick={() =>
                  void run(
                    () =>
                      completeEnquiryFollowUpAction({
                        followUpId: subject.id,
                        outcomeNotes: outcome,
                      }),
                    "Marked done.",
                  )
                }
              >
                Done
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Textarea
              label="What came of it"
              required
              rows={4}
              maxLength={2000}
              showCharacterCount
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
            />

            {error && (
              <p role="alert" className="text-body-sm text-text-primary">
                {error}
              </p>
            )}
          </div>
        </Modal>
      )}

      {/* ===================================================
          RESCHEDULE
      =================================================== */}

      {dialog === "reschedule" && subject && (
        <Modal
          isOpen
          onClose={close}
          size="md"
          title="Move this follow-up"
          description={`Currently ${formatDateTimeFull(subject.scheduledAt)}.`}
          footer={
            <>
              <Button variant="outline" onClick={close} disabled={busy}>
                Go back
              </Button>

              <Button
                isLoading={busy}
                disabled={busy || when === ""}
                onClick={() =>
                  void run(
                    () =>
                      rescheduleEnquiryFollowUpAction({
                        followUpId: subject.id,
                        scheduledAt: when,
                        reason: notes,
                      }),
                    "Moved.",
                  )
                }
              >
                Move it
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Input
              label="New time"
              required
              type="datetime-local"
              value={when}
              onChange={(event) => setWhen(event.target.value)}
              hint="Dubai time."
            />

            <Textarea
              label="Why it moved"
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              hint="Kept with the follow-up, so the next person knows it slipped rather than wondering."
            />

            {error && (
              <p role="alert" className="text-body-sm text-text-primary">
                {error}
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
