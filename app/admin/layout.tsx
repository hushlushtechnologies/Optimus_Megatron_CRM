import { redirect } from "next/navigation";

import { AdminShell } from "@/src/components/layout/admin-shell";
import { currentStaffGate } from "@/src/lib/supabase/staff-permissions";
import type { StaffGateState } from "@/src/lib/utils/staff-gate";

/*
| The gate on every page under /admin.
|
| Sprint 11 added one condition to it: the account has to be ACTIVE. Before
| that, suspending somebody changed a badge in a list and nothing else — they
| kept their session, their permission keys and the full use of every module.
|
| The message now says which of the four reasons applies, because "your account
| doesn't have access" needs a different response depending on whether somebody
| was never given a role, has been suspended, has an invitation they never
| finished, or left the company. The person reading it has to know who to ask
| and what to ask for.
|
| This is one of four places that enforce the same thing, on purpose:
|
|   here                        every page under /admin
|   the permission helpers      every server action
|   the RLS policies in sql/16  every query, whatever issued it
|   get_my_permissions()        every existing policy, once wrapped (sql/16 §10)
|
| Any one of them would stop an ordinary suspended user. Together they stop one
| who knows the URLs.
*/

const GATE_MESSAGES: Record<Exclude<StaffGateState, "ok" | "signed-out">, { title: string; body: string }> = {
  "no-profile": {
    title: "This account isn't set up for the admin area",
    body: "It has signed in, but there is no staff record attached to it. An administrator needs to invite you from the staff list.",
  },
  "no-role": {
    title: "Your account doesn't have a role yet",
    body: "Ask an administrator to give it one from the staff list. If you should already have access, refresh the page and try again.",
  },
  invited: {
    title: "Finish setting up your account",
    body: "Your invitation hasn't been completed. Open the invitation link you were sent to choose a password — ask whoever invited you if you no longer have it.",
  },
  suspended: {
    title: "Your access is suspended",
    body: "Your account and all your records are intact, but you can't use the admin area at the moment. Speak to an administrator — the reason is recorded against your account.",
  },
  deactivated: {
    title: "This account has been closed",
    body: "It was offboarded and can no longer sign in. If you have rejoined, an administrator can restore access from the staff list.",
  },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const gate = await currentStaffGate();

  if (gate.state === "signed-out") redirect("/login");

  if (gate.state !== "ok") {
    const message = GATE_MESSAGES[gate.state];

    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div role="alert" className="surface-card max-w-md p-6 text-center">
          <p className="text-body text-text-primary font-medium">{message.title}</p>
          <p className="text-body-sm text-text-muted mt-1">{message.body}</p>
        </div>
      </div>
    );
  }

  return (
    <AdminShell
      userName={gate.fullName || "Admin"}
      userRole={gate.roleName ?? ""}
      userEmail={gate.email ?? ""}
    >
      {children}
    </AdminShell>
  );
}
