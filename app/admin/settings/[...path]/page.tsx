import { notFound } from "next/navigation";

import { SettingsPageLayout } from "@/src/components/settings/settings-page-layout";
import { SettingsUnavailable } from "@/src/components/settings/settings-unavailable";
import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import {
  canOpenSettingsPage,
  currentSettingsAccess,
} from "@/src/lib/supabase/settings-permissions";
import {
  findSettingsPageByHref,
  SETTINGS_ROOT,
} from "@/src/lib/types/settings-registry";

/*
|--------------------------------------------------------------------------
| EVERY SETTINGS PAGE THAT IS IN THE PLAN BUT NOT BUILT
|--------------------------------------------------------------------------
|
| Twenty of the twenty-three registry entries are "planned". Rather than
| twenty near-identical files that each say "not yet", this catch-all
| resolves the route against the registry and renders the unavailable state
| with that entry's own reason.
|
| Next.js prefers a specific route over a catch-all, so building a real page
| is simply a matter of adding its file — this one stops answering for it
| automatically, with nothing to delete.
|
| A route that is not in the registry at all is a 404, not an "unavailable"
| page. There is a difference between a setting we have not built and a URL
| that was never a setting, and conflating them makes a typo look like a
| roadmap.
|
| WHERE THE VALUE LIVES TODAY
|
| Several planned pages describe values that ARE editable right now, on the
| old Sales settings page. Those entries point there, so the page is a
| signpost rather than a dead end. Once the real page lands the pointer goes
| with it — there is one copy of each value throughout.
*/

const AVAILABLE_TODAY: Record<string, { href: string; label: string }> = {
  reservations: {
    href: "/admin/settings/operations/sales",
    label: "Settings → Sales & Pricing",
  },
  payments: {
    href: "/admin/settings/operations/sales",
    label: "Settings → Sales & Pricing",
  },
  branding: {
    href: "/admin/settings/organization/company",
    label: "Settings → Company Profile",
  },
  appearance: {
    href: "/admin",
    label: "the theme switch in the top bar",
  },
};

export default async function PlannedSettingsPage({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path = [] } = await params;
  const pathname = [SETTINGS_ROOT, ...path].join("/").replace(/\/+/g, "/");

  const page = findSettingsPageByHref(pathname);

  /* Not a settings route at all. */
  if (!page) notFound();

  const access = await currentSettingsAccess();
  if (!canOpenSettingsPage(access, page.id)) return <UnauthorizedState />;

  /*
   * A "ready" page reaching this catch-all means its own route file is
   * missing — a wiring mistake rather than a planned absence. A 404 is the
   * honest answer; claiming "not available yet" about a page that is
   * supposed to exist would hide the bug. check-settings-registry.py
   * catches this before it ships.
   */
  if (page.status === "ready") notFound();

  return (
    <SettingsPageLayout page={page}>
      <SettingsUnavailable page={page} availableAt={AVAILABLE_TODAY[page.id]} />
    </SettingsPageLayout>
  );
}
