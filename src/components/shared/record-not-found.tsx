import Link from "next/link";
import { SearchX } from "lucide-react";

interface RecordNotFoundProps {
  /** What was looked for, in sentence case: "Lead", "Customer", "Vehicle". */
  record: string;
  /** Where to send the person back to. */
  backHref: string;
  /** The label of that destination: "Leads", "Customers", "Inventory". */
  backLabel: string;
  /** Overrides the default explanation when a record can disappear for a specific reason. */
  description?: string;
}

/**
 * The shared "we couldn't find that" page for every detail route.
 *
 * One component so a mistyped or deleted id reads the same everywhere, rather
 * than dropping people on the generic admin not-found with no way back to the
 * list they came from.
 */
export function RecordNotFound({ record, backHref, backLabel, description }: RecordNotFoundProps) {
  return (
    <div className="surface-card mx-auto flex max-w-lg flex-col items-center gap-3 p-10 text-center">
      <SearchX className="text-text-subtle size-8" aria-hidden="true" />

      <div>
        <h1 className="text-h2">{record} not found</h1>
        <p className="text-body-sm text-text-muted mt-1">
          {description ??
            `This ${record.toLowerCase()} doesn't exist, or the link is wrong. It may have been deleted, or the address mistyped.`}
        </p>
      </div>

      <Link
        href={backHref}
        className="bg-primary text-body hover:bg-primary-hover focus-visible:ring-primary inline-flex h-10 items-center justify-center rounded-md px-4 text-[#0b1220] transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        Back to {backLabel}
      </Link>
    </div>
  );
}