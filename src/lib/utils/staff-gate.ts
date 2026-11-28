import { isStaffStatus, type StaffStatus } from "@/src/lib/types/staff";

/*
| Who may be in the admin area, decided as a pure function.
|
| WHY THIS IS NOT INSIDE currentStaffGate()
|
| Because this is the rule that stops a suspended member of staff using the
| application, and a rule that important should be testable without a database,
| a browser, or a live Supabase project. currentStaffGate() fetches; this
| decides. The fetching is dull and the deciding is where a mistake costs
| something.
|
| THE ORDER OF THE CHECKS IS THE CONTRACT
|
| Signed out, then no profile, then no role, then status. Each answer is more
| specific than the last, and the person reading the message needs the most
| specific true one: telling somebody "you have no role" when they have been
| suspended sends them to ask the wrong question.
*/

export type StaffGateState =
  | "ok"
  | "signed-out"
  | "no-profile"
  | "no-role"
  | "invited"
  | "suspended"
  | "deactivated";

export interface StaffGateInput {
  hasUser: boolean;
  /** Null when there is no profiles row for this auth user. */
  profile: {
    roleId: string | null;
    roleName: string | null;
    /** Undefined when profiles.status could not be read — see statusKnown. */
    status?: string | null;
  } | null;
  /**
   * False when profiles.status does not exist yet, because sql/16 has not run.
   *
   * In that state every account is treated as active, and that is correct
   * rather than merely convenient: without the column nobody CAN be suspended,
   * so there is nobody for the rule to stop. Refusing everybody instead would
   * lock the whole company out of the application the moment this code
   * deployed ahead of its migration.
   */
  statusKnown: boolean;
}

export function resolveStaffGateState(input: StaffGateInput): StaffGateState {
  if (!input.hasUser) return "signed-out";
  if (!input.profile) return "no-profile";

  const { roleId, roleName } = input.profile;

  // Both halves matter. A role_id pointing at a deleted role leaves roleName
  // null, and an account with a name but no id is not attached to anything.
  if (!roleId || !roleName) return "no-role";

  if (!input.statusKnown) return "ok";

  const status = input.profile.status ?? "active";

  if (!isStaffStatus(status)) {
    // A value this build does not recognise. Treated as closed, not as active:
    // the safe reading of an unknown state is "cannot act".
    return "deactivated";
  }

  return gateForStatus(status);
}

function gateForStatus(status: StaffStatus): StaffGateState {
  switch (status) {
    case "active":
      return "ok";
    case "invited":
      return "invited";
    case "suspended":
      return "suspended";
    case "deactivated":
      return "deactivated";
  }
}

/** Does this state let somebody use the admin area? Only one of them does. */
export function gateAllowsAccess(state: StaffGateState): boolean {
  return state === "ok";
}
