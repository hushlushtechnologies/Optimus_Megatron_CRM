import Link from "next/link";
import { Clock, ExternalLink } from "lucide-react";

import { SETTINGS_ROOT, type SettingsPage } from "@/src/lib/types/settings-registry";

/*
|--------------------------------------------------------------------------
| A PAGE THAT IS IN THE PLAN BUT NOT BUILT
|--------------------------------------------------------------------------
|
| The brief's rule: "If a module does not support a particular
| configuration, either omit the setting or provide a clearly labeled future
| integration state." This is that state.
|
| It says three things, in this order, because that is the order somebody
| needs them:
|
|   1. This is not available yet — so they stop looking.
|   2. WHY, specifically, from the registry's own note — so they know
|      whether it is coming or whether the thing they want does not exist.
|   3. Where the setting lives today, if it does live somewhere — because
|      several of these values ARE editable, just not here yet.
|
| Point 3 is the one that stops this being a dead end. Reservation deposits
| and the separate-verifier rule are both editable today on the Sales
| settings page; a page that said only "coming soon" would send somebody
| away believing they could not change something they can.
|
| No controls. Not a disabled form, not a greyed-out toggle — nothing that
| looks like it might save.
*/

interface SettingsUnavailableProps {
  page: SettingsPage;
  /** Where this setting can be changed today, if anywhere. */
  availableAt?: { href: string; label: string };
}

export function SettingsUnavailable({ page, availableAt }: SettingsUnavailableProps) {
  return (
    <div
      role="status"
      className="surface-card flex max-w-2xl flex-col items-start gap-4 p-5"
    >
      <div className="flex items-start gap-3">
        <span className="bg-card-hover flex size-9 shrink-0 items-center justify-center rounded-lg">
          <Clock className="text-text-subtle size-4" aria-hidden="true" />
        </span>

        <div className="flex flex-col gap-1.5">
          <p className="text-body-sm text-text-primary font-medium">
            This isn&apos;t available yet.
          </p>

          {page.note && <p className="text-body-sm text-text-muted">{page.note}</p>}
        </div>
      </div>

      {availableAt && (
        <p className="border-border bg-card-hover text-body-sm text-text-muted w-full rounded-lg border px-4 py-3">
          You can change this today on{" "}
          <Link
            href={availableAt.href}
            className="text-primary-text hover:text-primary-hover focus-visible:ring-primary rounded font-medium focus-visible:ring-2 focus-visible:outline-none"
          >
            {availableAt.label}
          </Link>
          . It will move here once this page is built, and the value will be the same
          one — there is only ever one copy.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Link
          href={SETTINGS_ROOT}
          className="text-body-sm text-primary-text hover:text-primary-hover focus-visible:ring-primary rounded focus-visible:ring-2 focus-visible:outline-none"
        >
          Back to Settings
        </Link>

        {page.moduleHref && (
          <Link
            href={page.moduleHref}
            className="text-body-sm text-text-muted hover:text-text-primary focus-visible:ring-primary inline-flex items-center gap-1 rounded focus-visible:ring-2 focus-visible:outline-none"
          >
            Go to the module
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  );
}
