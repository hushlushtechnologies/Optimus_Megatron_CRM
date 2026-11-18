"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, MapPin, TriangleAlert } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { ConfirmDialog } from "@/src/components/shared/confirm-dialog";
import { CustomerAvatar } from "@/src/components/customers/customer-avatar";
import { FormSection } from "@/src/components/test-drives/form/form-section";
import { SearchSelect } from "@/src/components/test-drives/form/search-select";
import { DealNotices } from "@/src/components/sales/form/deal-form-notice";
import { DealLeadSection } from "@/src/components/sales/form/deal-lead-section";
import {
  createReservationAction,
  getReservationCustomerLeadsAction,
  getReservationVehicleContextAction,
  searchReservationCustomersAction,
  searchReservationVehiclesAction,
} from "@/app/admin/reservations/actions";
import { useMinuteClock } from "@/src/hooks/use-minute-clock";
import { useMotion } from "@/src/hooks/use-motion";
import { createReservationSchema } from "@/src/lib/validation/reservation";
import { describeReservationContext, requiredReservationDeposit } from "@/src/lib/utils/reservation-format";
import { formatFils } from "@/src/lib/utils/sales-money";
import { formatDateTimeFull } from "@/src/lib/utils/test-drive-format";
import type { VehicleDealContextResult } from "@/src/lib/types/sales-deal-form";
import type { ReservationSettings } from "@/src/lib/types/reservations";
import type {
  SearchResult,
  TestDriveCustomerOption,
  TestDriveFormPrefill,
  TestDriveLeadOption,
  TestDriveVehicleOption,
} from "@/src/lib/types/test-drive";
import { cn } from "@/src/lib/utils/cn";

interface AddReservationFormProps {
  lookups: { showrooms: { id: string; name: string }[]; owners: { id: string; name: string }[] };
  settings: ReservationSettings;
  prefill: TestDriveFormPrefill;
  currentUserId: string;
  canConfirm: boolean;
}

type Source = "staff" | "phone" | "walk_in";
type Mode = "request" | "confirm";

const SOURCE_OPTIONS: { value: Source; label: string }[] = [
  { value: "staff", label: "Staff entered it" },
  { value: "phone", label: "Phone call" },
  { value: "walk_in", label: "Walk-in" },
];

const OPTION_CLASS =
  "border-border bg-card hover:border-primary/40 has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-primary flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-3 py-3 transition-colors has-[:focus-visible]:ring-2";

function CustomerRow({ customer }: { customer: TestDriveCustomerOption }) {
  return (
    <div className="flex items-center gap-2.5">
      <CustomerAvatar fullName={customer.full_name} photoUrl={customer.photo_url} size="sm" />
      <div className="min-w-0">
        <p className="text-text-primary truncate font-medium">{customer.full_name}</p>
        <p className="text-caption text-text-subtle truncate">
          {customer.customer_number} · {customer.phone}
        </p>
      </div>
    </div>
  );
}

function VehicleRow({ vehicle }: { vehicle: TestDriveVehicleOption }) {
  return (
    <div className="min-w-0">
      <p className="text-text-primary truncate font-medium">{vehicle.display_title}</p>
      <p className="text-caption text-text-subtle truncate">
        {vehicle.stock_id}
        {vehicle.brand_name ? ` · ${vehicle.brand_name}` : ""}
        {vehicle.location_name ? ` · ${vehicle.location_name}` : ""}
        {vehicle.status_name ? ` · ${vehicle.status_name}` : ""}
      </p>
    </div>
  );
}

export function AddReservationForm({ lookups, settings, prefill, currentUserId, canConfirm }: AddReservationFormProps) {
  const router = useRouter();
    const { fadeUp } = useMotion();
  const now = useMinuteClock();

  const [customer, setCustomer] = useState<TestDriveCustomerOption | null>(prefill.customer);
  const [vehicle, setVehicle] = useState<TestDriveVehicleOption | null>(prefill.vehicle);
  const [leadId, setLeadId] = useState<string | null>(prefill.lead?.id ?? null);
  const [locationId, setLocationId] = useState(
    prefill.vehicle?.location_id && lookups.showrooms.some((s) => s.id === prefill.vehicle?.location_id)
      ? prefill.vehicle.location_id
      : lookups.showrooms.length === 1
        ? lookups.showrooms[0].id
        : "",
  );
  const [ownerId, setOwnerId] = useState<string | null>(
    lookups.owners.some((owner) => owner.id === currentUserId) ? currentUserId : null,
  );
  const [source, setSource] = useState<Source>("staff");
  const [mode, setMode] = useState<Mode>(canConfirm ? "confirm" : "request");
  const [days, setDays] = useState(String(settings.defaultDays));
  const [notes, setNotes] = useState("");
    const [waiveReason, setWaiveReason] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [skipWarning, setSkipWarning] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  const touch = () => setDirty(true);
  const customerId = customer?.id ?? "";
  const carId = vehicle?.id ?? "";

  /* ---------- The customer's open leads ---------- */

  const [leadsState, setLeadsState] = useState<{ customerId: string; result: SearchResult<TestDriveLeadOption> } | null>(null);

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;

    getReservationCustomerLeadsAction(customerId)
      .then((result) => {
        if (!cancelled) setLeadsState({ customerId, result });
      })
      .catch(() => {
        if (!cancelled) setLeadsState({ customerId, result: { results: [], failed: true } });
      });

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const leads = leadsState && leadsState.customerId === customerId ? leadsState.result : null;

  /* ---------- What the database says about this vehicle ---------- */

  const contextKey = carId ? [carId, customerId, leadId ?? ""].join("|") : null;
  const [contextState, setContextState] = useState<{ key: string; result: VehicleDealContextResult } | null>(null);

  useEffect(() => {
    if (!contextKey) return;
    let cancelled = false;

    getReservationVehicleContextAction({ carId, customerId: customerId || null, leadId })
      .then((result) => {
        if (!cancelled) setContextState({ key: contextKey, result });
      })
      .catch(() => {
        if (!cancelled) setContextState({ key: contextKey, result: { status: "error" } });
      });

    return () => {
      cancelled = true;
    };
  }, [contextKey, carId, customerId, leadId]);

  const contextResult = contextKey && contextState && contextState.key === contextKey ? contextState.result : null;
  const context = contextResult?.status === "ok" ? contextResult.context : null;
  const checking = !!contextKey && !contextResult;
  const checkFailed = contextResult?.status === "error";

  const messages = describeReservationContext(context, vehicle, mode === "confirm");
  const blocked = messages.blockers.length > 0;

  /* ---------- Unsaved changes ---------- */

  useEffect(() => {
    if (!dirty || skipWarning) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, skipWarning]);

  /* ---------- Display values ---------- */

  const daysNumber = Number(days);
  const daysValid = Number.isInteger(daysNumber) && daysNumber >= 1 && daysNumber <= settings.maxDays;
  const expiryPreview =
    mode === "confirm" && daysValid && now !== 0
      ? formatDateTimeFull(new Date(now + daysNumber * 86_400_000).toISOString())
      : null;

    const deposit = requiredReservationDeposit(settings, context?.listedPrice ?? null);
  const ownerName = lookups.owners.find((owner) => owner.id === ownerId)?.name ?? null;

  const showroomMismatch =
    vehicle?.location_id && locationId && vehicle.location_id !== locationId
      ? `This vehicle is listed at ${vehicle.location_name ?? "another showroom"}, but the reservation is set for ${lookups.showrooms.find((s) => s.id === locationId)?.name ?? "a different showroom"}. Make sure that is intended.`
      : null;

  /* ---------- Actions ---------- */

  const handleCancel = () => {
    if (dirty) {
      setConfirmCancelOpen(true);
      return;
    }
    router.push("/admin/reservations");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    if (blocked) {
      toast.error(messages.blockers[0]);
      return;
    }

    const parsed = createReservationSchema.safeParse({
      customerId,
      carId,
      locationId,
      leadId,
      ownerId,
      source,
      mode,
      days: mode === "confirm" ? (days === "" ? null : daysNumber) : null,
      notes,
      waiveReason,
    });

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
    if (mode === "confirm" && !daysValid) {
      setErrors({ days: `Enter a whole number from 1 to ${settings.maxDays}.` });
      return;
    }
        if (mode === "confirm" && deposit !== null && waiveReason.trim().length < 3) {
      setErrors({ waiveReason: "Say why the deposit is being waived, or send a request and take the deposit first." });
      return;
    }
    setErrors({});

    setIsSubmitting(true);
    try {
      const result = await createReservationAction(parsed.data);
      if (result.error) {
        setSubmitError(result.error);
        toast.error(result.error);
        return;
      }

      setSkipWarning(true);
      toast.success(
        `${mode === "confirm" ? "Vehicle held" : "Request sent"}${result.reservationNumber ? ` · ${result.reservationNumber}` : ""}`,
      );
      router.push(result.reservationId ? `/admin/reservations/${result.reservationId}` : "/admin/reservations");
    } catch {
      const message = "Something went wrong. Check the Reservations list before trying again.";
      setSubmitError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <motion.div {...fadeUp(0)} className="flex flex-col gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="self-start"
          leftIcon={<ArrowLeft className="size-4" />}
          onClick={handleCancel}
        >
          Reservations
        </Button>
        <div>
          <h1 className="text-h1">New Reservation</h1>
          <p className="text-body-sm text-text-muted">
            A request asks for a vehicle to be held and waits for review. Holding it now reserves the vehicle straight
            away.
          </p>
        </div>
      </motion.div>

      <form onSubmit={handleSubmit} noValidate className="flex max-w-3xl flex-col gap-6">
        <motion.div {...fadeUp(1)}>
          <FormSection step={1} title="Customer" description="Who is the vehicle being held for?">
            <SearchSelect<TestDriveCustomerOption>
              label="Customer"
              required
              placeholder="Search by name, phone number or customer ID…"
              value={customer}
              onChange={(next) => {
                setCustomer(next);
                setLeadId(null);
                touch();
              }}
              search={searchReservationCustomersAction}
              renderOption={(item) => <CustomerRow customer={item} />}
              renderSelected={(item) => <CustomerRow customer={item} />}
              emptyMessage="No customers found. Check the spelling, or add them as a new customer."
              error={errors.customerId}
            />
            <p className="text-caption text-text-subtle">
              Not in the list?{" "}
              <Link
                href="/admin/customers/new"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-text hover:text-primary-hover"
              >
                Add a new customer<span className="sr-only"> (opens in a new tab)</span>
              </Link>
              , then search for them here.
            </p>
          </FormSection>
        </motion.div>

        <motion.div {...fadeUp(2)}>
          <FormSection step={2} title="Vehicle" description="Which vehicle should be held?">
            <SearchSelect<TestDriveVehicleOption>
              label="Vehicle"
              required
              placeholder="Search by name, brand or stock ID…"
              value={vehicle}
              onChange={(next) => {
                setVehicle(next);
                if (next?.location_id && !locationId && lookups.showrooms.some((s) => s.id === next.location_id)) {
                  setLocationId(next.location_id);
                }
                touch();
              }}
              search={searchReservationVehiclesAction}
              renderOption={(item) => <VehicleRow vehicle={item} />}
              renderSelected={(item) => <VehicleRow vehicle={item} />}
              emptyMessage="No vehicles found. Check the name or stock ID."
              isOptionDisabled={(item) => item.is_sold}
              getDisabledReason={() => "Sold"}
              error={errors.carId}
            />

            {vehicle && (
              <div className="text-body-sm text-text-muted flex flex-wrap items-center gap-x-4 gap-y-1">
                {vehicle.location_name && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-3.5" aria-hidden="true" />
                    Listed at {vehicle.location_name}
                  </span>
                )}
                {checking && (
                  <span className="text-text-subtle inline-flex items-center gap-1.5" role="status">
                    <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden="true" />
                    Checking this vehicle…
                  </span>
                )}
              </div>
            )}

            {checkFailed && (
              <p
                role="status"
                className="text-body-sm text-text-primary rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2"
              >
                We couldn&apos;t check this vehicle&apos;s current holds. You can still continue. The system re-checks when you
                save, and it blocks conflicts.
              </p>
            )}

            <DealNotices {...messages} />
          </FormSection>
        </motion.div>

        <motion.div {...fadeUp(3)}>
          <DealLeadSection
            step={3}
            description="Link the lead this reservation came from, so the original source is kept. Optional."
            hasCustomer={!!customerId}
            vehicleId={carId}
            leads={leads}
            leadId={leadId}
            onChange={(next) => {
              setLeadId(next);
              touch();
            }}
            error={errors.leadId}
          />
        </motion.div>

        <motion.div {...fadeUp(4)}>
          <FormSection step={4} title="Request or hold" description="Choose what should happen to the vehicle.">
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">What should happen to the vehicle</legend>

              <label className={cn(OPTION_CLASS, !canConfirm && "cursor-not-allowed opacity-60")}>
                <input
                  type="radio"
                  name="reservation-mode"
                  checked={mode === "confirm"}
                  disabled={!canConfirm}
                  onChange={() => {
                    setMode("confirm");
                    touch();
                  }}
                  className="accent-primary mt-1 size-4"
                />
                <span>
                  <span className="text-body-sm text-text-primary block font-medium">Hold the vehicle now</span>
                  <span className="text-caption text-text-subtle block">
                    {canConfirm
                      ? "The vehicle is held for the customer straight away, until the time you choose."
                      : "Only a manager can hold a vehicle. You can send a request for review."}
                  </span>
                </span>
              </label>

              <label className={OPTION_CLASS}>
                <input
                  type="radio"
                  name="reservation-mode"
                  checked={mode === "request"}
                  onChange={() => {
                    setMode("request");
                    touch();
                  }}
                  className="accent-primary mt-1 size-4"
                />
                <span>
                  <span className="text-body-sm text-text-primary block font-medium">Send as a request</span>
                  <span className="text-caption text-text-subtle block">
                    Waits for a manager to confirm. It doesn&apos;t hold the vehicle in the meantime.
                  </span>
                </span>
              </label>
            </fieldset>

            {mode === "confirm" && (
              <div className="flex flex-col gap-2">
                <Input
                  label="Hold for (days)"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={settings.maxDays}
                  value={days}
                  onChange={(event) => {
                    setDays(event.target.value);
                    touch();
                  }}
                />
                {errors.days && (
                  <p role="alert" className="text-body-sm text-red-500">
                    {errors.days}
                  </p>
                )}
                {expiryPreview && (
                  <p role="status" className="text-body-sm text-text-primary">
                    The hold lasts until <span className="font-medium">{expiryPreview}</span> (longest allowed:{" "}
                    {settings.maxDays} days).
                  </p>
                  
                )}
                                {deposit !== null && (
                  <Textarea
                    label="Reason for holding without a deposit"
                    required
                    placeholder="Or choose “Send as a request” to take the deposit first."
                    rows={2}
                    maxLength={500}
                    showCharacterCount
                    value={waiveReason}
                    onChange={(event) => {
                      setWaiveReason(event.target.value);
                      touch();
                    }}
                    error={errors.waiveReason}
                  />
                )}
              </div>
            )}

            {deposit !== null && (
              <p className="border-border bg-card-hover/40 text-body-sm text-text-primary rounded-md border px-3 py-2.5">
                Your settings ask for a deposit of{" "}
                <span className="font-semibold tabular-nums">{formatFils(deposit, settings.currency)}</span> to hold a
                vehicle.
              </p>
            )}
          </FormSection>
        </motion.div>

        <motion.div {...fadeUp(5)}>
          <FormSection step={5} title="Showroom, owner and notes" description="Where the customer will collect, and who is looking after it.">
            <div className="flex flex-col gap-1.5">
              <Select
                label="Showroom"
                placeholder="Choose a showroom"
                options={lookups.showrooms.map((s) => ({ value: s.id, label: s.name }))}
                value={locationId}
                onChange={(event) => {
                  setLocationId(event.target.value);
                  touch();
                }}
              />
              {errors.locationId && (
                <p role="alert" className="text-body-sm text-red-500">
                  {errors.locationId}
                </p>
              )}
            </div>

            {showroomMismatch && (
              <p
                role="status"
                className="text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
                {showroomMismatch}
              </p>
            )}

            <Select
              label="How did it come in?"
              options={SOURCE_OPTIONS}
              value={source}
              onChange={(event) => {
                setSource(event.target.value as Source);
                touch();
              }}
            />

            {canConfirm ? (
              <Select
                label="Owner"
                placeholder="No owner yet"
                options={lookups.owners.map((o) => ({ value: o.id, label: o.name }))}
                value={ownerId ?? ""}
                onChange={(event) => {
                  setOwnerId(event.target.value || null);
                  touch();
                }}
              />
            ) : (
              <div className="flex flex-col gap-1.5">
                <p className="text-label">Owner</p>
                <p className="border-border bg-card-hover/40 text-body text-text-primary rounded-md border px-3 py-2.5">
                  {ownerName ? `${ownerName} (you)` : "You"}
                </p>
              </div>
            )}

            <Textarea
              label="Notes"
              placeholder="Anything the team should know."
              rows={3}
              maxLength={2000}
              showCharacterCount
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
                touch();
              }}
              error={errors.notes}
            />
          </FormSection>
        </motion.div>

        {submitError && (
          <p
            role="alert"
            className="text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-400" aria-hidden="true" />
            {submitError}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={handleCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="gradient" isLoading={isSubmitting} disabled={blocked}>
            {mode === "confirm" ? "Hold vehicle" : "Send request"}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        isOpen={confirmCancelOpen}
        onClose={() => setConfirmCancelOpen(false)}
        onConfirm={() => {
          setSkipWarning(true);
          router.push("/admin/reservations");
        }}
        title="Discard this reservation?"
        description="You've started filling in this form. If you leave now, nothing will be saved."
        confirmLabel="Discard"
        variant="danger"
      />
    </div>
  );
}