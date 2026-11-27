import { SettingsOverviewClient } from "@/src/components/settings/settings-overview-client";
import {
  currentSettingsAccess,
  visiblePages,
} from "@/src/lib/supabase/settings-permissions";

export const metadata = {
  title: "Settings · Optimus Megatron Cars",
};

/*
 * The overview. The layout above already renders the "Settings" heading and
 * the search field, so this page is only the category cards.
 */
export default async function SettingsOverviewPage() {
  const access = await currentSettingsAccess();

  return <SettingsOverviewClient pages={visiblePages(access)} />;
}
