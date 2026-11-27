import Link from "next/link";
import { KeyRound, ShieldCheck, UserCog } from "lucide-react";
import { SettingsPageLayout } from "@/src/components/settings/settings-page-layout";
import { SettingsSection } from "@/src/components/settings/settings-section";
import { UnauthorizedState } from "@/src/components/shared/unauthorized-state";
import { canOpenSettingsPage, currentSettingsAccess } from "@/src/lib/supabase/settings-permissions";
import { findSettingsPage } from "@/src/lib/types/settings-registry";
import { getSecurityFacts } from "@/src/lib/supabase/system-settings-queries";

export const metadata = {
  title: "Security & access · Optimus Megatron Cars",
};

/*
|--------------------------------------------------------------------------
| SECURITY & ACCESS — PHASE 23
|--------------------------------------------------------------------------
|
| "Any security control shown in the UI must be backed by an actual
| enforceable implementation."
|
| Taken literally, which means this page has NO CONTROLS AT ALL. Every
| security setting a page like this usually offers — session timeout,
| password rules, two-factor, IP allow-lists — is a Supabase Auth project
| setting. This application cannot read them and cannot enforce them, so a
| control here would be a dial connected to nothing, and a reassuring one
| at that.
|
| What it does instead is state the things that ARE enforced, each with how
| it is enforced, so the page is useful to somebody asking "what actually
| protects this data". The permission and role counts are read live rather
| than described.
|
| Full role management is Sprint 11. Phase 23 says to prepare the
| navigation for it and not to build the editor, so there is an entry
| point and no editor.
*/

function Fact({ label, value, evidence }: { label: string; value: string; evidence: string }) {
  return (
    <div className="border-border bg-card-hover/40 flex flex-col gap-1 rounded-md border px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-body-sm text-text-primary font-medium">{label}</p>
        <p className="text-body-sm text-text-primary">{value}</p>
      </div>
      <p className="text-caption text-text-muted">{evidence}</p>
    </div>
  );
}

export default async function SecuritySettingsPage() {
  const page = findSettingsPage("security");
  if (!page) throw new Error("Settings registry is missing the 'security' page");

  const access = await currentSettingsAccess();
  if (!canOpenSettingsPage(access, page.id)) return <UnauthorizedState />;

  const { permissionKeyCount, roleCount } = await getSecurityFacts();

  return (
    <SettingsPageLayout
      page={page}
      readOnlyNote="No controls on this page, on purpose. Everything here is a statement of what is enforced and how — not a setting."
    >
      <div className="flex flex-col gap-6 pb-12">
        <SettingsSection
          title="How access is decided"
          icon={ShieldCheck}
          description="What actually stops somebody seeing or changing something."
        >
          <Fact
            label="Permission keys defined"
            value={permissionKeyCount === null ? "Couldn't be read" : String(permissionKeyCount)}
            evidence="Read live from app_permissions. Every key checked anywhere in the code is defined in a migration — check-permission-keys.py fails the build otherwise, which is how a page gated on a key nobody can hold gets caught."
          />
          <Fact
            label="Roles"
            value={roleCount === null ? "Couldn't be read" : String(roleCount)}
            evidence="Read live from roles. A person's permissions come from their role's grants, resolved by get_my_permissions()."
          />
          <Fact
            label="Checked where it matters"
            value="In the database"
            evidence="Permissions are checked in the server action and again by row level security, so a refused write is an update that matches no rows rather than an error. Every settings action treats zero rows as a refusal rather than as success — the alternative is a page saying Saved having saved nothing."
          />
          <Fact
            label="Two authorization systems"
            value="Both in use"
            evidence="Sales, reservations, payments, test drives, enquiries, offers and loyalty use permission keys. Inventory, customers and leads use role-name lists instead. That means inventory.view and customers.view do not exist — a page gated on one would be invisible to everybody, silently. It is worth consolidating, and it is not a settings change."
          />
        </SettingsSection>

        <SettingsSection
          title="Sessions and sign-in"
          icon={KeyRound}
          description="Where these are configured, which is not here."
        >
          <p className="text-body-sm text-text-muted">
            Session length, password rules, two-factor and email confirmation are Supabase Auth project
            settings. This application cannot read them and cannot enforce them, so there is nothing here
            to switch — a session timeout control on this page would be a number nothing honours.
          </p>
          <p className="text-body-sm text-text-muted">
            They are under Authentication in your Supabase project. Changing them there takes effect
            immediately and needs no deployment.
          </p>
        </SettingsSection>

        <SettingsSection
          title="Users and roles"
          icon={UserCog}
          description="Sprint 11."
        >
          <p className="text-body-sm text-text-muted">
            Managing staff, roles and which permissions each role grants is Sprint 11, and this sprint was
            explicitly told not to build the editor. The navigation is ready for it: it belongs in this
            category alongside this page.
          </p>
          <p className="text-body-sm text-text-muted">
            Until then, roles and grants are changed in the database. The five{" "}
            <code className="text-text-primary">settings.*</code> keys this sprint added are granted in
            section 3 of <code className="text-text-primary">sql/12</code>, which is commented out so that
            you choose who gets them.
          </p>
          <p className="text-body-sm text-text-muted">
            One thing worth checking now:{" "}
            <Link
              href="/admin/settings/communications/notifications"
              className="text-primary focus-visible:ring-primary rounded underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
            >
              the payment verification notification
            </Link>{" "}
            goes to whoever holds <code className="text-text-primary">payments.verify</code>. If no role
            holds it, that notification reaches nobody.
          </p>
        </SettingsSection>
      </div>
    </SettingsPageLayout>
  );
}
