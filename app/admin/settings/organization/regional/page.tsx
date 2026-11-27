import { Calendar, Globe2, Languages, Wallet } from "lucide-react";
import { SettingsPageLayout } from "@/src/components/settings/settings-page-layout";
import { SettingsSection } from "@/src/components/settings/settings-section";
import { SettingsHistoryPanel } from "@/src/components/settings/settings-history-panel";
import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import { canOpenSettingsPage, currentSettingsAccess } from "@/src/lib/supabase/settings-permissions";
import { findSettingsPage } from "@/src/lib/types/settings-registry";
import { getScopedSettingsHistory, getSettingsRow } from "@/src/lib/supabase/settings-section-queries";
import { REGIONAL_HISTORY } from "@/src/lib/utils/settings-history-scope";

export const metadata = {
  title: "Regional settings · Optimus Megatron Cars",
};

/*
|--------------------------------------------------------------------------
| REGIONAL — PHASE 6
|--------------------------------------------------------------------------
|
| Every control this page could have is one Sprint 10 tells me not to
| build, and in each case for a good reason rather than a cautious one.
| So the page states each invariant, says what it would take to change it,
| and has no inputs on it at all.
|
| CURRENCY. Sprint 10: "do not expose a currency switch that changes the
| label from AED to another currency without converting financial data and
| supporting a genuine multi-currency architecture." Money in this app is
| bigint fils with AED assumed throughout: deal totals, payments, fee
| values, deposit amounts, every report. A dropdown would relabel 150,000
| AED as 150,000 USD and change nothing else. The number would be wrong
| everywhere at once and nothing would flag it.
|
| TIMEZONE. Dubai is UTC+04:00 with no daylight saving, and has been since
| 1990. The reports lean on that: a day boundary is computed as a fixed
| four-hour offset rather than through a timezone database, which is
| correct here and would be wrong anywhere with DST. Changing the timezone
| would silently move every day boundary in every report.
|
| DATE AND TIME FORMAT. en-GB, formatted in one place. Making it
| configurable is a real possibility — it is presentation, not data — but
| it needs somewhere to store a preference and it changes exports as well
| as screens. It is not an invariant, just not built.
|
| LANGUAGE. There is one language in the interface. A language picker with
| one language in it is the "fake settings control to fill a category" the
| brief rules out.
|
| The history panel is here because `currency` can still be changed by
| hand in SQL, and if it ever is, this is where somebody would look.
*/

function Fact({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border-border bg-card-hover/40 flex flex-col gap-1 rounded-md border px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-body-sm text-text-primary font-medium">{label}</p>
        <p className="text-body-sm text-text-primary tabular-nums">{value}</p>
      </div>
      <p className="text-caption text-text-muted">{detail}</p>
    </div>
  );
}

export default async function RegionalSettingsPage() {
  const page = findSettingsPage("regional");
  if (!page) throw new Error("Settings registry is missing the 'regional' page");

  const access = await currentSettingsAccess();
  if (!canOpenSettingsPage(access, page.id)) return <UnauthorizedState />;

  const [settings, history] = await Promise.all([
    getSettingsRow(),
    getScopedSettingsHistory(REGIONAL_HISTORY),
  ]);

  const currency = settings.status === "ok" ? settings.settings.currency : null;

  return (
    <SettingsPageLayout
      page={page}
      readOnlyNote="These are fixed for the whole business. Each one is read-only because changing it would need work beyond a setting — the detail under each says what."
    >
      <div className="flex flex-col gap-6 pb-12">
        <SettingsSection
          title="Currency"
          icon={Wallet}
          description="The currency every price, payment and report is in."
        >
          <Fact
            label="Currency"
            value={currency ?? "Couldn't be read"}
            detail={
              currency
                ? `Every amount in the system is stored and calculated in ${currency}. There is no conversion anywhere, so switching this would relabel every total without changing a single number — a 150,000 deal would read as 150,000 of the new currency. Real multi-currency support means storing a rate with each amount, which is a sprint of its own.`
                : "The stored currency could not be read just now. Nothing has changed; refresh to try again."
            }
          />
        </SettingsSection>

        <SettingsSection
          title="Time zone"
          icon={Globe2}
          description="The working day every date and report is measured against."
        >
          <Fact
            label="Time zone"
            value="Asia/Dubai (UTC+04:00)"
            detail="Dubai has had no daylight saving since 1990, so the reports treat the offset as a fixed four hours rather than looking it up. That is exactly right here and would be wrong anywhere that changes its clocks. Changing this would move the start and end of every reporting day."
          />
        </SettingsSection>

        <SettingsSection
          title="Date and time format"
          icon={Calendar}
          description="How dates and times are written on screen and in exports."
        >
          <Fact
            label="Date"
            value="24 Nov 2026"
            detail="Day, short month, year — en-GB, formatted in one place so screens and exports agree."
          />
          <Fact
            label="Time"
            value="14:30"
            detail="24-hour, Dubai local. This is presentation rather than data, so it could become a preference later. It would need somewhere to store the choice and it would change exports as well as screens, so it is not a setting yet."
          />
        </SettingsSection>

        <SettingsSection title="Language" icon={Languages} description="The language of the interface.">
          <Fact
            label="Language"
            value="English"
            detail="The interface exists in English only. A picker with one option in it would suggest there is a choice to make."
          />
        </SettingsSection>

        <SettingsHistoryPanel
          items={history}
          emptyNote="No regional values have been changed. They are not editable from here."
        />
      </div>
    </SettingsPageLayout>
  );
}
