"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Car, Check, Globe, Layers, MapPin, Search, Tag, X } from "lucide-react";

import { Badge } from "@/src/components/ui/badge";
import { Input } from "@/src/components/ui/input";
import { Spinner } from "@/src/components/ui/spinner";

import { previewTargetedVehiclesAction, searchTargetCarsAction } from "@/app/admin/offers/actions";
import type { TargetCarOption, TargetSelection } from "@/src/lib/supabase/offer-queries";
import { cn } from "@/src/lib/utils/cn";

/*
|--------------------------------------------------------------------------
| WHICH VEHICLES A CAMPAIGN COVERS
|--------------------------------------------------------------------------
|
| Five kinds of target, and they combine with OR: a vehicle qualifies if it
| matches any one of them. That is what the rules engine does, so it is what
| this says, in those words, above the count.
|
| The count is the honest part. Somebody picking three brands has no way to
| know whether that is nine cars or ninety, and a campaign aimed at nothing
| is a campaign that looks live and does nothing. So the number comes back
| from the server as they pick.
|
| No targets at all is not an empty selection — it is every vehicle. The
| empty state says so rather than looking unfinished.
*/

type TargetKind = TargetSelection["targetKind"];

interface LookupItem {
  id: string;
  name: string;
}

interface OfferTargetPickerProps {
  value: TargetSelection[];
  onChange: (next: TargetSelection[]) => void;
  brands: LookupItem[];
  models: { id: string; name: string; brand_id: string }[];
  collections: LookupItem[];
  locations: LookupItem[];
  disabled?: boolean;
}

const SCOPES: { kind: TargetKind; label: string; icon: typeof Tag; blurb: string }[] = [
  { kind: "brand", label: "Brands", icon: Tag, blurb: "Every vehicle of a make" },
  { kind: "model", label: "Models", icon: Layers, blurb: "Every vehicle of a model" },
  { kind: "collection", label: "Collections", icon: Layers, blurb: "A curated group" },
  { kind: "location", label: "Showrooms", icon: MapPin, blurb: "Everything at a site" },
  { kind: "car", label: "Specific vehicles", icon: Car, blurb: "Named stock only" },
];

/* =========================================================
   A SEARCHABLE TICK LIST
========================================================= */

/**
 * The picker for a short lookup list.
 *
 * Brands, models, collections and showrooms are all small enough to hold in
 * the page and filter here, so ticking four brands is four clicks with no
 * round trip. Cars get their own control below, because there can be
 * thousands of them.
 */
function TickList({
  items,
  selectedIds,
  onToggle,
  searchLabel,
  disabled,
}: {
  items: LookupItem[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  searchLabel: string;
  disabled?: boolean;
}) {
  const [term, setTerm] = useState("");

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => item.name.toLowerCase().includes(needle));
  }, [items, term]);

  return (
    <div className="flex flex-col gap-2">
      {items.length > 8 && (
        <Input
          aria-label={searchLabel}
          placeholder="Type to narrow the list..."
          leftIcon={<Search className="text-text-subtle size-4" aria-hidden="true" />}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          disabled={disabled}
          className="h-10"
        />
      )}

      {filtered.length === 0 ? (
        <p className="text-body-sm text-text-subtle px-1 py-3">
          {items.length === 0 ? "Nothing set up yet." : "Nothing matches that."}
        </p>
      ) : (
        <ul className="border-border max-h-60 overflow-y-auto rounded-lg border">
          {filtered.map((item) => {
            const checked = selectedIds.has(item.id);

            return (
              <li key={item.id} className="border-border border-b last:border-b-0">
                <label
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 transition-colors",
                    checked ? "bg-primary/5" : "hover:bg-card-hover",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onToggle(item.id)}
                    className="peer sr-only"
                  />

                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded border transition-colors",
                      "peer-focus-visible:outline-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
                      checked ? "border-primary bg-primary text-white" : "border-border bg-card",
                    )}
                  >
                    {checked && <Check className="size-3.5" strokeWidth={3} />}
                  </span>

                  <span className="text-body-sm text-text-primary min-w-0 truncate">{item.name}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* =========================================================
   THE CAR SEARCH
========================================================= */

function CarPicker({
  selected,
  onToggle,
  disabled,
}: {
  selected: TargetSelection[];
  onToggle: (id: string) => void;
  disabled?: boolean;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<TargetCarOption[]>([]);
  const [searching, setSearching] = useState(false);

  const selectedIds = useMemo(
    () => new Set(selected.filter((item) => item.targetKind === "car").map((item) => item.targetId)),
    [selected],
  );

  /*
   * Debounced, so typing a stock number is one query rather than eight.
   *
   * Every setState happens inside the timer rather than in the effect body.
   * That satisfies react-hooks/set-state-in-effect, and it reads better too:
   * the spinner appears when a request actually starts, so it doesn't flash
   * on and off for each keystroke during the pause.
   */
  useEffect(() => {
    const trimmed = term.trim();

    const timer = window.setTimeout(() => {
      if (trimmed.length < 2) {
        setResults([]);
        setSearching(false);
        return;
      }

      setSearching(true);

      void (async () => {
        try {
          const result = await searchTargetCarsAction({ term: trimmed });
          setResults(result.cars);
        } catch {
          setResults([]);
        } finally {
          setSearching(false);
        }
      })();
    }, 350);

    return () => window.clearTimeout(timer);
  }, [term]);

  return (
    <div className="flex flex-col gap-2">
      <Input
        aria-label="Search stock by title, stock number or VIN"
        placeholder="Search by title, stock number or VIN..."
        leftIcon={<Search className="text-text-subtle size-4" aria-hidden="true" />}
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        disabled={disabled}
        className="h-10"
      />

      {searching && (
        <p className="text-body-sm text-text-subtle flex items-center gap-2 px-1 py-2">
          <Spinner className="size-3.5" /> Searching stock...
        </p>
      )}

      {!searching && term.trim().length >= 2 && results.length === 0 && (
        <p className="text-body-sm text-text-subtle px-1 py-2">
          No vehicle matches that. Archived stock isn&apos;t searched.
        </p>
      )}

      {results.length > 0 && (
        <ul className="border-border max-h-60 overflow-y-auto rounded-lg border">
          {results.map((car) => {
            const checked = selectedIds.has(car.id);

            return (
              <li key={car.id} className="border-border border-b last:border-b-0">
                <label
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 transition-colors",
                    checked ? "bg-primary/5" : "hover:bg-card-hover",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onToggle(car.id)}
                    className="peer sr-only"
                  />

                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded border transition-colors",
                      "peer-focus-visible:outline-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
                      checked ? "border-primary bg-primary text-white" : "border-border bg-card",
                    )}
                  >
                    {checked && <Check className="size-3.5" strokeWidth={3} />}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="text-body-sm text-text-primary block truncate">
                      {car.year ? `${car.year} ` : ""}
                      {car.title}
                    </span>

                    {car.stockId && (
                      <span className="text-text-subtle block truncate text-xs">{car.stockId}</span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {/*
        Picked cars stay listed once the search box is cleared. Otherwise
        clearing the box looks like it cleared the selection.
      */}
      {selectedIds.size > 0 && (
        <p className="text-body-sm text-text-muted px-1">
          {selectedIds.size} specific {selectedIds.size === 1 ? "vehicle" : "vehicles"} selected.
        </p>
      )}
    </div>
  );
}

/* =========================================================
   THE PICKER
========================================================= */

export function OfferTargetPicker({
  value,
  onChange,
  brands,
  models,
  collections,
  locations,
  disabled = false,
}: OfferTargetPickerProps) {
  const [openScopes, setOpenScopes] = useState<Set<TargetKind>>(() => {
    /* Scopes that already hold something start open, so an edit shows its own targeting. */
    return new Set(value.map((item) => item.targetKind));
  });

  const [count, setCount] = useState<{ total: number; matched: number } | null>(null);

  /*
   * Starts true: a count is pending from the moment this mounts. Starting
   * false would show "the count couldn't be worked out" for the length of
   * the debounce, before anything had been tried.
   */
  const [counting, setCounting] = useState(true);

  const idsFor = useCallback(
    (kind: TargetKind) => new Set(value.filter((item) => item.targetKind === kind).map((item) => item.targetId)),
    [value],
  );

  const toggle = (targetKind: TargetKind, targetId: string) => {
    const exists = value.some(
      (item) => item.targetKind === targetKind && item.targetId === targetId,
    );

    onChange(
      exists
        ? value.filter(
            (item) => !(item.targetKind === targetKind && item.targetId === targetId),
          )
        : [...value, { targetKind, targetId }],
    );
  };

  const clearScope = (kind: TargetKind) => {
    onChange(value.filter((item) => item.targetKind !== kind));
  };

  /* =======================================================
     THE COUNT

     Debounced and sequenced: a slow reply for three brands must not land
     after a fast reply for four and overwrite it. The request id is checked
     before the state is set.
  ======================================================= */

  const requestId = useRef(0);

  useEffect(() => {
    const mine = ++requestId.current;

    const timer = window.setTimeout(() => {
      setCounting(true);

      void (async () => {
        try {
          const result = await previewTargetedVehiclesAction({ targets: value });

          if (mine !== requestId.current) return;

          setCount(result.error ? null : { total: result.total, matched: result.matched });
        } catch {
          if (mine === requestId.current) setCount(null);
        } finally {
          if (mine === requestId.current) setCounting(false);
        }
      })();
    }, 400);

    return () => window.clearTimeout(timer);
  }, [value]);

  const isEverything = value.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* ===================================================
          SCOPES
      =================================================== */}

      <div className="flex flex-col gap-2">
        <p className="text-body-sm text-text-muted">
          Leave everything untouched to cover all stock, or narrow it below. A vehicle qualifies if
          it matches <strong className="text-text-primary font-medium">any one</strong> of the things
          you pick.
        </p>

        <div className="flex flex-wrap gap-2">
          {SCOPES.map((scope) => {
            const held = idsFor(scope.kind).size;
            const open = openScopes.has(scope.kind);
            const Icon = scope.icon;

            return (
              <button
                key={scope.kind}
                type="button"
                disabled={disabled}
                aria-expanded={open}
                onClick={() =>
                  setOpenScopes((prev) => {
                    const next = new Set(prev);
                    if (next.has(scope.kind)) next.delete(scope.kind);
                    else next.add(scope.kind);
                    return next;
                  })
                }
                className={cn(
                  "text-body-sm inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 font-medium transition-colors",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  held > 0
                    ? "border-primary/30 bg-primary/5 text-primary"
                    : open
                      ? "border-border bg-card-hover text-text-primary"
                      : "border-border text-text-muted hover:text-text-primary",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {scope.label}

                {held > 0 && (
                  <span className="bg-primary/15 text-primary rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
                    {held}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ===================================================
          OPEN SCOPES
      =================================================== */}

      {SCOPES.filter((scope) => openScopes.has(scope.kind)).map((scope) => {
        const held = idsFor(scope.kind);

        return (
          <div key={scope.kind} className="border-border bg-card-hover/40 rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-body-sm text-text-primary font-medium">{scope.label}</p>
                <p className="text-text-subtle text-xs">{scope.blurb}</p>
              </div>

              {held.size > 0 && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => clearScope(scope.kind)}
                  className="text-text-muted hover:text-primary inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors"
                >
                  <X className="size-3.5" aria-hidden="true" /> Clear {held.size}
                </button>
              )}
            </div>

            {scope.kind === "car" ? (
              <CarPicker
                selected={value}
                onToggle={(id) => toggle("car", id)}
                disabled={disabled}
              />
            ) : (
              <TickList
                items={
                  scope.kind === "brand"
                    ? brands
                    : scope.kind === "model"
                      ? models
                      : scope.kind === "collection"
                        ? collections
                        : locations
                }
                selectedIds={held}
                onToggle={(id) => toggle(scope.kind, id)}
                searchLabel={`Search ${scope.label.toLowerCase()}`}
                disabled={disabled}
              />
            )}
          </div>
        );
      })}

      {/* ===================================================
          THE COUNT
      =================================================== */}

      <div
        role="status"
        aria-live="polite"
        className={cn(
          "flex items-start gap-3 rounded-lg border px-4 py-3",
          count && count.matched === 0 && !isEverything
            ? "border-warning/30 bg-warning/5"
            : "border-border bg-card-hover/40",
        )}
      >
        {isEverything ? (
          <Globe className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
        ) : (
          <Car className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
        )}

        <div className="min-w-0">
          {counting && count === null ? (
            <p className="text-body-sm text-text-muted flex items-center gap-2">
              <Spinner className="size-3.5" /> Working out how many vehicles this covers...
            </p>
          ) : count === null ? (
            <p className="text-body-sm text-text-muted">
              The vehicle count couldn&apos;t be worked out. The targeting is still saved as you set
              it.
            </p>
          ) : isEverything ? (
            <>
              <p className="text-body-sm text-text-primary">
                Covers{" "}
                <strong className="font-semibold tabular-nums">
                  all {count.total.toLocaleString()}
                </strong>{" "}
                {count.total === 1 ? "vehicle" : "vehicles"} in stock.
              </p>
              <p className="text-text-subtle mt-0.5 text-xs">
                Narrow it above if this campaign is only meant for some of them.
              </p>
            </>
          ) : count.matched === 0 ? (
            <>
              <p className="text-body-sm text-text-primary font-medium">
                This targeting matches no vehicles in stock.
              </p>
              <p className="text-text-subtle mt-0.5 text-xs">
                The campaign would publish and then do nothing. Worth checking before it goes live —
                unless the stock is on its way.
              </p>
            </>
          ) : (
            <>
              <p className="text-body-sm text-text-primary">
                Covers{" "}
                <strong className="font-semibold tabular-nums">
                  {count.matched.toLocaleString()}
                </strong>{" "}
                of {count.total.toLocaleString()} {count.total === 1 ? "vehicle" : "vehicles"} in
                stock.
              </p>
              <p className="text-text-subtle mt-0.5 text-xs">
                Counted now. It changes as stock arrives and sells — the campaign isn&apos;t pinned
                to these {count.matched.toLocaleString()}.
              </p>
            </>
          )}
        </div>

        {counting && count !== null && (
          <Badge status="neutral" className="ml-auto shrink-0">
            updating
          </Badge>
        )}
      </div>
    </div>
  );
}
