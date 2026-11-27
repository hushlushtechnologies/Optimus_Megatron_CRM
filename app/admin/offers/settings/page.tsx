import { redirect } from "next/navigation";

/*
|--------------------------------------------------------------------------
| LEGACY ROUTE — KEPT WORKING
|--------------------------------------------------------------------------
|
| Loyalty settings now live under the central Settings module.
|
| Note the destination: /admin/offers/settings was the LOYALTY settings
| page, despite the URL suggesting offers. So it redirects to
| /settings/marketing/loyalty, not to /settings/marketing/offers — sending
| it to the offers page because the path says "offers" would land people
| somewhere that does not hold what they came for.
*/

export default function LegacyLoyaltySettingsPage() {
  redirect("/admin/settings/marketing/loyalty");
}
