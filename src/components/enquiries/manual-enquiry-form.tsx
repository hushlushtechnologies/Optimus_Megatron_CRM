"use client";

import { ArrowLeft, TriangleAlert } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/src/components/ui/button";
import { Combobox } from "@/src/components/ui/combobox";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";

import { createManualEnquiryAction } from "@/app/admin/enquiries/actions";
import { useMotion } from "@/src/hooks/use-motion";
import {
  ENQUIRY_SOURCES,
  ENQUIRY_TYPES,
  PREFERRED_CONTACTS,
  type EnquirySource,
  type EnquiryType,
  type PreferredContact,
} from "@/src/lib/types/enquiry";

interface ManualEnquiryFormProps {
  staff: { id: string; full_name: string }[];
  cars: { id: string; display_title: string; stock_id: string }[];
  currentUserId: string;
}

/*
 * Website is missing from the list on purpose. An enquiry entered here came
 * in some other way — a call, a walk-in, a message — and letting someone
 * label a phone call as a website enquiry would quietly corrupt the one
 * figure this module exists to report on.
 */
const MANUAL_SOURCES: EnquirySource[] = ENQUIRY_SOURCES.filter((source) => source !== "Website");

/**
 * An enquiry taken by a person: over the phone, at the counter, or forwarded
 * from somebody's inbox.
 *
 * Name plus one way to reply is all that is required. Everything else can be
 * filled in later from the enquiry itself — asking for more at the counter
 * just means it gets written on paper instead.
 */
export function ManualEnquiryForm({ staff, cars, currentUserId }: ManualEnquiryFormProps) {
  const router = useRouter();
  const { fadeUp } = useMotion();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [preferredContact, setPreferredContact] = useState<PreferredContact | "">("");

  const [enquiryType, setEnquiryType] = useState<EnquiryType>("General");
  const [source, setSource] = useState<EnquirySource>("Phone");

  const [carId, setCarId] = useState<string | null>(null);
  const [vehicleText, setVehicleText] = useState("");

  const [assignedTo, setAssignedTo] = useState<string | null>(currentUserId);
  const [message, setMessage] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSubmit = !saving && fullName.trim().length >= 2 && (phone.trim() !== "" || email.trim() !== "");

  const submit = async () => {
    setError(null);
    setSaving(true);

    try {
      const result = await createManualEnquiryAction({
        fullName,
        email,
        phone,
        message,
        enquiryType,
        source,
        preferredContact: preferredContact === "" ? undefined : preferredContact,
        carId,
        vehicleText,
        assignedTo,
        customerId: null,
      });

      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      toast.success("Enquiry saved.");

      if (result.id) router.push(`/admin/enquiries/${result.id}`);
      else router.push("/admin/enquiries");
    } catch {
      const message = "Something went wrong. Nothing was saved — please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {/* ===================================================
          HEADER
      =================================================== */}

      <motion.div {...fadeUp(0)} className="flex flex-col gap-2">
        <Link
          href="/admin/enquiries"
          className="text-body-sm text-text-muted hover:text-text-primary focus-visible:ring-primary inline-flex min-h-11 items-center gap-1.5 self-start rounded focus-visible:ring-2 focus-visible:outline-none sm:min-h-0"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Enquiry requests
        </Link>

        <div>
          <h1 className="text-h3">Add an enquiry</h1>

          <p className="text-body-sm text-text-muted mt-1">
            For something that came in by phone, at the showroom, or through a message. A name and one way to
            reply is enough to start.
          </p>
        </div>
      </motion.div>

      {/* ===================================================
          WHO
      =================================================== */}

      <motion.section
        {...fadeUp(1)}
        aria-label="Who got in touch"
        className="surface-card flex flex-col gap-4 p-5"
      >
        <p className="text-label">Who got in touch</p>

        <Input
          label="Name"
          required
          maxLength={120}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Phone"
            inputMode="tel"
            maxLength={32}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            hint="A mobile, a landline, or an international number."
          />

          <Input
            label="Email"
            type="email"
            maxLength={160}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <Select
          label="How would they rather be contacted?"
          options={[
            { value: "", label: "They didn't say" },
            ...PREFERRED_CONTACTS.map((item) => ({ value: item, label: item })),
          ]}
          value={preferredContact}
          onChange={(event) => setPreferredContact(event.target.value as PreferredContact | "")}
        />
      </motion.section>

      {/* ===================================================
          WHAT
      =================================================== */}

      <motion.section
        {...fadeUp(2)}
        aria-label="What it is about"
        className="surface-card flex flex-col gap-4 p-5"
      >
        <p className="text-label">What it is about</p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Kind of enquiry"
            options={ENQUIRY_TYPES.map((item) => ({ value: item, label: item }))}
            value={enquiryType}
            onChange={(event) => setEnquiryType(event.target.value as EnquiryType)}
          />

          <Select
            label="How did it reach us?"
            options={MANUAL_SOURCES.map((item) => ({ value: item, label: item }))}
            value={source}
            onChange={(event) => setSource(event.target.value as EnquirySource)}
            hint="Website is reserved for the online form."
          />
        </div>

        <Combobox
          label="Vehicle in stock"
          value={carId}
          onChange={setCarId}
          options={cars.map((car) => ({ id: car.id, label: `${car.display_title} (${car.stock_id})` }))}
          placeholder="Search by name or stock ID..."
        />

        <Input
          label="Or what they asked for"
          maxLength={200}
          value={vehicleText}
          onChange={(event) => setVehicleText(event.target.value)}
          hint="For something we don't have in stock, such as “a 2020 G63, black”."
        />

        <Textarea
          label="What they said"
          rows={4}
          maxLength={4000}
          showCharacterCount
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          hint="Their words where you have them. This is what the next person reads before calling back."
        />
      </motion.section>

      {/* ===================================================
          WHO HANDLES IT
      =================================================== */}

      <motion.section
        {...fadeUp(3)}
        aria-label="Who will handle it"
        className="surface-card flex flex-col gap-4 p-5"
      >
        <p className="text-label">Who will handle it</p>

        <Select
          label="Assign to"
          options={[
            { value: "", label: "Nobody yet — leave it in the queue" },
            ...staff.map((person) => ({ value: person.id, label: person.full_name })),
          ]}
          value={assignedTo ?? ""}
          onChange={(event) => setAssignedTo(event.target.value || null)}
          hint="Assigning it moves it straight to in review."
        />
      </motion.section>

      {/* ===================================================
          SAVE
      =================================================== */}

      {error && (
        <p
          role="alert"
          className="text-body-sm text-text-primary flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-400" aria-hidden="true" />
          {error}
        </p>
      )}

      <motion.div {...fadeUp(4)} className="flex flex-wrap gap-2">
        <Button
          variant="gradient"
          className="h-11 sm:h-10"
          onClick={() => void submit()}
          isLoading={saving}
          disabled={!canSubmit}
        >
          Save enquiry
        </Button>

        <Button
          variant="outline"
          className="h-11 sm:h-10"
          disabled={saving}
          onClick={() => router.push("/admin/enquiries")}
        >
          Cancel
        </Button>
      </motion.div>
    </div>
  );
}
