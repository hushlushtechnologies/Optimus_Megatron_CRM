"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type FieldPath, type FieldPathValue } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, CarFront, TriangleAlert } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/shared/confirm-dialog";
import { DealCustomerSection } from "@/src/components/sales/form/deal-customer-section";
import { DealVehicleSection } from "@/src/components/sales/form/deal-vehicle-section";
import { DealLeadSection } from "@/src/components/sales/form/deal-lead-section";
import { DealOwnershipSection } from "@/src/components/sales/form/deal-ownership-section";
import { DealPricingSection } from "@/src/components/sales/form/deal-pricing-section";
import { DealSummaryCard } from "@/src/components/sales/form/deal-summary-card";
import {
  createDealAction,
  getDealCustomerLeadsAction,
  getVehicleDealContextAction,
} from "@/app/admin/sales/new/actions";
import { useMotion } from "@/src/hooks/use-motion";
import { createDealSchema, type CreateDealValues } from "@/src/lib/validation/sales-deal";
import { computeDealPricing, describeVehicleContext } from "@/src/lib/utils/sales-deal-form";
import type { DealFormLookups, VehicleDealContextResult } from "@/src/lib/types/sales-deal-form";
import type {
  SearchResult,
  TestDriveCustomerOption,
  TestDriveFormPrefill,
  TestDriveLeadOption,
  TestDriveVehicleOption,
} from "@/src/lib/types/test-drive";

interface AddDealFormProps {
  lookups: DealFormLookups;
  prefill: TestDriveFormPrefill;
  currentUserId: string;
  canAssign: boolean;
  settings: { autoApprovePercent: number; currency: string };
}

export function AddDealForm({ lookups, prefill, currentUserId, canAssign, settings }: AddDealFormProps) {
  const router = useRouter();
  const { fadeUp, reduce } = useMotion();
  const skipUnloadWarning = useRef(false);

  const [customer, setCustomer] = useState<TestDriveCustomerOption | null>(prefill.customer);
  const [vehicle, setVehicle] = useState<TestDriveVehicleOption | null>(prefill.vehicle);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  const initialLocation =
    prefill.vehicle?.location_id && lookups.showrooms.some((showroom) => showroom.id === prefill.vehicle?.location_id)
      ? prefill.vehicle.location_id
      : lookups.showrooms.length === 1
        ? lookups.showrooms[0].id
        : "";

  const { handleSubmit, control, setValue, formState } = useForm<CreateDealValues>({
    resolver: zodResolver(createDealSchema),
    defaultValues: {
      customerId: prefill.customer?.id ?? "",
      carId: prefill.vehicle?.id ?? "",
      locationId: initialLocation,
      leadId: prefill.lead?.id ?? null,
      testDriveId: prefill.testDrive?.id ?? null,
      ownerId: lookups.owners.some((owner) => owner.id === currentUserId) ? currentUserId : null,
      proposedPrice: "",
      discountAmount: "",
      notes: "",
    },
  });

  const { errors, isDirty, isSubmitting, isSubmitted } = formState;

  const customerId = useWatch({ control, name: "customerId" });
  const carId = useWatch({ control, name: "carId" });
  const locationId = useWatch({ control, name: "locationId" });
  const leadId = useWatch({ control, name: "leadId" });
  const ownerId = useWatch({ control, name: "ownerId" });
  const proposedPrice = useWatch({ control, name: "proposedPrice" });
  const discountAmount = useWatch({ control, name: "discountAmount" });
  const notes = useWatch({ control, name: "notes" });

  const setField = <TName extends FieldPath<CreateDealValues>>(
    name: TName,
    value: FieldPathValue<CreateDealValues, TName>,
  ) => {
    setValue(name, value, { shouldDirty: true, shouldValidate: isSubmitted });
  };

  /* ---------- The customer's open leads ---------- */

  const [leadsState, setLeadsState] = useState<{
    customerId: string;
    result: SearchResult<TestDriveLeadOption>;
  } | null>(null);

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;

    getDealCustomerLeadsAction(customerId)
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

    getVehicleDealContextAction({ carId, customerId: customerId || null, leadId })
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

  const messages = describeVehicleContext(context, vehicle);
  const blocked = messages.blockers.length > 0;

  const pricing = computeDealPricing({
    proposed: proposedPrice,
    discount: discountAmount,
    listedPrice: context?.listedPrice ?? null,
    autoApprovePercent: settings.autoApprovePercent,
  });

  /* ---------- Unsaved changes ---------- */

  useEffect(() => {
    if (!isDirty) return;

    const handler = (event: BeforeUnloadEvent) => {
      if (skipUnloadWarning.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  /* ---------- Changes ---------- */

  const handleCustomerChange = (next: TestDriveCustomerOption | null) => {
    setCustomer(next);
    setField("customerId", next?.id ?? "");
    setField("leadId", null);
  };

  const handleVehicleChange = (next: TestDriveVehicleOption | null) => {
    setVehicle(next);
    setField("carId", next?.id ?? "");

    if (next?.location_id && !locationId && lookups.showrooms.some((showroom) => showroom.id === next.location_id)) {
      setField("locationId", next.location_id);
    }
  };

  const handleCancel = () => {
    if (isDirty) {
      setConfirmCancelOpen(true);
      return;
    }
    router.push("/admin/sales");
  };

  const onValid = async (values: CreateDealValues) => {
    setSubmitError(null);

    const result = await createDealAction(values);

    if (result.error) {
      setSubmitError(result.error);
      toast.error(result.error);
      return;
    }

    skipUnloadWarning.current = true;
    toast.success(`Deal created${result.dealNumber ? ` · ${result.dealNumber}` : ""}`);
    router.push(result.dealNumber ? `/admin/sales?q=${encodeURIComponent(result.dealNumber)}` : "/admin/sales");
  };

  const onInvalid = () => {
    toast.error("Please fix the highlighted fields.");
    document.querySelector('form [role="alert"]')?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "center",
    });
  };

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (blocked) {
      toast.error(messages.blockers[0]);
      return;
    }
    void handleSubmit(onValid, onInvalid)(event);
  };

  /* ---------- Display values ---------- */

  const showroomName = lookups.showrooms.find((showroom) => showroom.id === locationId)?.name ?? null;
  const ownerName = lookups.owners.find((owner) => owner.id === ownerId)?.name ?? null;
  const selectedLead = leads?.results.find((lead) => lead.id === leadId);
  const leadLabel = leadId ? (selectedLead?.lead_number ?? "Linked") : "None";

  const showroomMismatchMessage =
    vehicle?.location_id && locationId && vehicle.location_id !== locationId
      ? `This vehicle is listed at ${vehicle.location_name ?? "another showroom"}, but the deal is set for ${showroomName ?? "a different showroom"}. Make sure that is intended.`
      : null;

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
          Sales
        </Button>
        <div>
          <h1 className="text-h1">New Deal</h1>
          <p className="text-body-sm text-text-muted">
            Start a deal for a customer and a vehicle. It&apos;s saved as a draft, and nothing is held until you
            reserve or confirm it.
          </p>
        </div>
      </motion.div>

      <form onSubmit={handleFormSubmit} noValidate>
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_340px]">
                    <div className="flex flex-col gap-6">
            {/*
              Where this deal came from. Shown only when the form was opened
              from a test drive, so staff can see the origin is being kept and
              can follow the link back to check the outcome.
            */}
            {prefill.testDrive && (
              <motion.p
                {...fadeUp(0)}
                role="status"
                className="border-border bg-card-hover/40 text-body-sm text-text-primary flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-3 py-2.5"
              >
                <CarFront className="size-4 shrink-0 text-amber-400" aria-hidden="true" />
                <span>
                  Started from test drive{" "}
                  <Link
                    href={`/admin/test-drives/${prefill.testDrive.id}`}
                    className="text-primary-text hover:text-primary-hover focus-visible:ring-primary rounded focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {prefill.testDrive.test_drive_number}
                  </Link>
                  . The customer and vehicle below come from it, and the deal will record the link.
                </span>
              </motion.p>
            )}

            <motion.div {...fadeUp(1)}>
              <DealCustomerSection value={customer} onChange={handleCustomerChange} error={errors.customerId?.message} />
            </motion.div>

            <motion.div {...fadeUp(2)}>
              <DealVehicleSection
                value={vehicle}
                onChange={handleVehicleChange}
                messages={messages}
                checking={checking}
                checkFailed={checkFailed}
                error={errors.carId?.message}
              />
            </motion.div>

            <motion.div {...fadeUp(3)}>
              <DealLeadSection
                hasCustomer={!!customerId}
                vehicleId={carId}
                leads={leads}
                leadId={leadId}
                onChange={(next) => setField("leadId", next)}
                error={errors.leadId?.message}
              />
            </motion.div>

            <motion.div {...fadeUp(4)}>
              <DealOwnershipSection
                showrooms={lookups.showrooms}
                locationId={locationId}
                onLocationChange={(next) => setField("locationId", next)}
                owners={lookups.owners}
                ownerId={ownerId}
                onOwnerChange={(next) => setField("ownerId", next)}
                canAssign={canAssign}
                currentUserId={currentUserId}
                showroomMismatchMessage={showroomMismatchMessage}
                locationError={errors.locationId?.message}
              />
            </motion.div>

            <motion.div {...fadeUp(5)}>
              <DealPricingSection
                currency={settings.currency}
                pricing={pricing}
                proposed={proposedPrice}
                discount={discountAmount}
                notes={notes}
                onProposedChange={(next) => setField("proposedPrice", next)}
                onDiscountChange={(next) => setField("discountAmount", next)}
                onNotesChange={(next) => setField("notes", next)}
                errors={{
                  proposedPrice: errors.proposedPrice?.message,
                  discountAmount: errors.discountAmount?.message,
                  notes: errors.notes?.message,
                }}
              />
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
              <Button type="submit" isLoading={isSubmitting} disabled={blocked}>
                Save as draft
              </Button>
            </div>
          </div>

          <div className="xl:sticky xl:top-24">
            <DealSummaryCard
              customer={customer}
              vehicle={vehicle}
              showroomName={showroomName}
              ownerName={ownerName}
              leadLabel={leadLabel}
              pricing={pricing}
              currency={settings.currency}
            />
          </div>
        </div>
      </form>

      <ConfirmDialog
        isOpen={confirmCancelOpen}
        onClose={() => setConfirmCancelOpen(false)}
        onConfirm={() => {
          skipUnloadWarning.current = true;
          router.push("/admin/sales");
        }}
        title="Discard this deal?"
        description="You've started filling in this form. If you leave now, nothing will be saved."
        confirmLabel="Discard"
        variant="danger"
      />
    </div>
  );
}