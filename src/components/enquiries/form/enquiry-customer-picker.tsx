"use client";

import { useEffect, useRef, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Spinner } from "@/src/components/ui/spinner";

import { searchEnquiryCustomersAction } from "@/app/admin/enquiries/actions";
import type { EnquiryCustomerMatch } from "@/src/lib/types/enquiry";

interface EnquiryCustomerPickerProps {
  /** The chosen customer's id, or null while nobody is chosen. */
  value: string | null;
  label: string;
  onPick: (customer: EnquiryCustomerMatch) => void;
  onClear: () => void;
}

/**
 * Finding a customer already on file.
 *
 * Searches as you type, after a pause, across name, customer number, email
 * and phone — because the person on the phone will give whichever of those
 * they happen to have, and making somebody pick the right box first is a
 * question nobody should have to answer.
 *
 * Nothing is created here. Picking links the enquiry to an existing record;
 * a customer who isn't on file yet is entered as plain contact details, and
 * becomes a customer when the enquiry is converted.
 */
export function EnquiryCustomerPicker({ value, label, onPick, onClear }: EnquiryCustomerPickerProps) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * The results carry the term they came from.
   *
   * Keeping the two together means nothing has to be cleared when the term
   * changes: results for a term nobody is looking at any more simply stop
   * matching, and the render below ignores them.
   */
  const [result, setResult] = useState<{ term: string; rows: EnquiryCustomerMatch[] } | null>(null);

  /*
   * Every search is numbered. A slow early request landing after a fast
   * later one would otherwise overwrite good results with stale ones.
   */
  const latest = useRef(0);

  const term = query.trim();
  const active = value === null && term.length >= 2;

  useEffect(() => {
    if (!active) return;

    const ticket = ++latest.current;

    const timer = window.setTimeout(async () => {
      setSearching(true);

      try {
        const found = await searchEnquiryCustomersAction({ query: term });

        if (ticket !== latest.current) return;

        setResult({ term, rows: found.matches });
        setError(found.error);
      } catch {
        if (ticket === latest.current) setError("Unable to search customers right now.");
      } finally {
        if (ticket === latest.current) setSearching(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [term, active]);

  /* What is on screen is only ever the answer to what is in the box now. */
  const matches = active && result?.term === term ? result.rows : [];
  const foundNothing = active && result?.term === term && !searching && result.rows.length === 0;

  /* =======================================================
     CHOSEN
  ======================================================= */

  if (value !== null) {
    return (
      <div className="border-success/30 bg-success/[0.06] flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
        <p className="text-body-sm text-text-primary min-w-0">
          Linked to <span className="font-medium">{label}</span>
        </p>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setQuery("");
            onClear();
          }}
          leftIcon={<X className="size-4" aria-hidden="true" />}
        >
          Change
        </Button>
      </div>
    );
  }

  /* =======================================================
     SEARCHING
  ======================================================= */

  return (
    <div className="flex flex-col gap-3">
      <Input
        label="Find the customer"
        placeholder="Name, customer number, email or phone"
        leftIcon={<Search className="text-text-subtle size-4" aria-hidden="true" />}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        hint="Search by whatever they gave you."
      />

      {searching && (
        <p className="text-body-sm text-text-muted flex items-center gap-2">
          <Spinner size="sm" />
          Looking…
        </p>
      )}

      {error && (
        <p role="alert" className="text-body-sm text-text-primary">
          {error}
        </p>
      )}

      {matches.length > 0 && (
        <ul className="border-border divide-border divide-y overflow-hidden rounded-lg border">
          {matches.map((customer) => (
            <li key={customer.id}>
              <button
                type="button"
                onClick={() => onPick(customer)}
                className="hover:bg-card-hover focus-visible:ring-primary flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:-outline-offset-2"
              >
                <span className="text-body-sm text-text-primary font-medium">{customer.full_name}</span>

                <span className="text-caption text-text-subtle">
                  {[customer.customer_number, customer.phone, customer.email].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/*
        An empty result is the common case for a new customer, so it reads as
        the expected next step rather than a failure.
      */}
      {foundNothing && (
        <p className="text-body-sm text-text-muted flex items-center gap-2">
          <UserPlus className="text-text-subtle size-4 shrink-0" aria-hidden="true" />
          Nobody on file matches that. Switch to a new customer below and type their details.
        </p>
      )}
    </div>
  );
}
