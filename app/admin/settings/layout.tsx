import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import { SettingsNavigation } from "@/src/components/settings/settings-navigation";
import { SettingsSearch } from "@/src/components/settings/settings-search";
import {
  currentSettingsAccess,
  visiblePages,
} from "@/src/lib/supabase/settings-permissions";

/*
|--------------------------------------------------------------------------
| THE SETTINGS WORKSPACE
|--------------------------------------------------------------------------
|
| Permission filtering happens here, once, on the server. Every page under
| /admin/settings gets a navigation list already reduced to what this person
| may open — so a page they cannot reach is not merely hidden from the nav,
| it was never sent to the browser.
|
| The brief's layout: search at the top, categories on the left, content in
| the middle, and the main application sidebar left visually distinct. The
| nav column here is deliberately plain — no panel, no dark fill — because
| two heavy navigation rails side by side is the thing the brief warns
| against.
|
| On small screens the column stacks above the content and its categories
| collapse; see settings-navigation.tsx.
*/

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await currentSettingsAccess();
  const pages = visiblePages(access);

  /*
   * Nothing openable at all. Distinct from a single page being refused:
   * this person has no business in Settings, so they get the standard
   * unauthorized state rather than an empty workspace.
   */
  if (pages.length === 0) return <UnauthorizedState />;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-h2">Settings</h1>
          <p className="text-body-sm text-text-muted">
            Everything that changes how the system behaves, in one place.
          </p>
        </div>

        <SettingsSearch />
      </header>

      <div className="flex min-w-0 flex-col gap-6 lg:grid lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-8">
        <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <SettingsNavigation pages={pages} />
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
