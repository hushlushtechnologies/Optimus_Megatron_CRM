import { CalendarCheck, Clock } from "lucide-react";
import { SettingsPageLayout } from "@/src/components/settings/settings-page-layout";
import { SettingsSection } from "@/src/components/settings/settings-section";
import { SettingsLoadError } from "@/src/components/settings/settings-load-error";
import { CheckInWindowClient } from "@/src/components/settings/check-in-window-client";
import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import {
  canEditCategory,
  canOpenSettingsPage,
  currentSettingsAccess,
} from "@/src/lib/supabase/settings-permissions";
import { findSettingsPage } from "@/src/lib/types/settings-registry";
import { getCheckInWindows } from "@/src/lib/supabase/test-drive-settings-queries";

export const metadata = {
  title: "Test drive settings · Optimus Megatron Cars",
};

/*
|--------------------------------------------------------------------------
| TEST DRIVES
|--------------------------------------------------------------------------
|
| One real setting: how early staff may record a customer as arrived, per
| showroom. It gets a control because it is genuinely enforced —
| loadCheckInOpensMinutes reads it on every check-in and the arrivals board
| uses it to decide which bookings are open.
|
| My Batch 1 note on this page said the scheduling engine's use of it needed
| checking before showing a control. Checked: it is read in two places and
| honoured in both.
|
| Nothing else about test drives is configurable, and the section at the
| bottom says what each missing piece would need rather than leaving a gap
| that reads as an oversight. Slot length, opening hours and buffers are
| not stored anywhere — the calendar works from the bookings themselves.
*/

export default async function TestDriveSettingsPage() {
  const page = findSettingsPage("test-drives");
  if (!page) throw new Error("Settings registry is missing the 'test-drives' page");

  const access = await currentSettingsAccess();
  if (!canOpenSettingsPage(access, page.id)) return <UnauthorizedState />;

  const canEdit = canEditCategory(access, "operations");
  const result = await getCheckInWindows();

  return (
    <SettingsPageLayout
      page={page}
      readOnlyNote={
        canEdit
          ? undefined
          : "You can see these but not change them. Changing them needs the operations settings permission."
      }
    >
      <div className="flex flex-col gap-6 pb-12">
        <SettingsSection
          title="Check-in window"
          icon={CalendarCheck}
          description="How long before a booking staff may record the customer as arrived."
          effect="Applies to check-ins from now on. A booking already checked in is unaffected. 0 means check-in opens at the appointment time."
        >
          {result.status === "error" ? (
            <SettingsLoadError what="Your check-in windows" />
          ) : (
            <CheckInWindowClient
              rows={result.rows}
              defaultMinutes={result.defaultMinutes}
              canEdit={canEdit}
            />
          )}
        </SettingsSection>

        <SettingsSection
          title="What isn't configurable"
          icon={Clock}
          description="And what each one would need."
        >
          <dl className="flex flex-col gap-3">
            <div className="border-border border-l-2 pl-3">
              <dt className="text-body-sm text-text-primary font-medium">Slot length and opening hours</dt>
              <dd className="text-caption text-text-muted">
                Not stored anywhere. The calendar is built from the bookings themselves rather than from a
                grid of available slots, so there is no slot length to set. Making it configurable means
                the calendar generating slots, which is a change to how booking works rather than a
                setting.
              </dd>
            </div>
            <div className="border-border border-l-2 pl-3">
              <dt className="text-body-sm text-text-primary font-medium">Buffer between test drives</dt>
              <dd className="text-caption text-text-muted">
                Nothing enforces a gap between bookings today, so a control here would set a number
                nothing reads. It needs the booking form to check it first.
              </dd>
            </div>
            <div className="border-border border-l-2 pl-3">
              <dt className="text-body-sm text-text-primary font-medium">Reminder timing</dt>
              <dd className="text-caption text-text-muted">
                No test drive reminder exists to time. It is one of the two time-due notifications that
                need an HTTP scheduling route — the database scheduler cannot call TypeScript.
              </dd>
            </div>
          </dl>
        </SettingsSection>
      </div>
    </SettingsPageLayout>
  );
}
