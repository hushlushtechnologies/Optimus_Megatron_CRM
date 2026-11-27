import { redirect } from "next/navigation";

/*
|--------------------------------------------------------------------------
| LEGACY ROUTE — KEPT WORKING
|--------------------------------------------------------------------------
|
| Sales settings now live under the central Settings module. This route
| stays so that bookmarks, links in older notifications and anybody's muscle
| memory keep working.
|
| A redirect rather than a copy of the page, deliberately: the brief warns
| against leaving "old and new routes independently editing the same
| settings through divergent logic". There is one page, and this points at
| it.
|
| Permission checks live on the destination. Redirecting first means an
| unauthorised person gets the same answer here as they would there, rather
| than two different refusals that could drift apart.
*/

export default function LegacySalesSettingsPage() {
  redirect("/admin/settings/operations/sales");
}
