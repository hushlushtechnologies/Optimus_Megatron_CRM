import type {
  EnquirySourceOption,
  EnquiryStatusOption,
  EnquiryTypeOption,
  EnquiryWorkflow,
} from "@/src/lib/types/enquiry-workflow";

/*
|--------------------------------------------------------------------------
| WORKFLOW RULES
|--------------------------------------------------------------------------
|
| Pure functions over the workflow the database handed us, so the same rules
| run in the browser (to decide which buttons to show) and on the server (to
| decide whether a request is allowed). The server is the one that counts;
| the client copy exists only to avoid offering a move that will be refused.
*/

/* =========================================================
   WHAT IS ON OFFER
========================================================= */

/** Only active values are offered on a form. Retired ones still render on old rows. */
export function activeTypes(workflow: EnquiryWorkflow): EnquiryTypeOption[] {
  return workflow.types.filter((item) => item.isActive);
}

export function activeSources(workflow: EnquiryWorkflow): EnquirySourceOption[] {
  return workflow.sources.filter((item) => item.isActive);
}

export function activeStatuses(workflow: EnquiryWorkflow): EnquiryStatusOption[] {
  return workflow.statuses.filter((item) => item.isActive);
}

export function findStatus(workflow: EnquiryWorkflow, key: string): EnquiryStatusOption | null {
  return workflow.statuses.find((item) => item.key === key) ?? null;
}

export function findType(workflow: EnquiryWorkflow, key: string): EnquiryTypeOption | null {
  return workflow.types.find((item) => item.key === key) ?? null;
}

/** The statuses that still need somebody to do something. */
export function openStatusKeys(workflow: EnquiryWorkflow): string[] {
  return workflow.statuses.filter((item) => item.isOpen).map((item) => item.key);
}

export function closedStatusKeys(workflow: EnquiryWorkflow): string[] {
  return workflow.statuses.filter((item) => !item.isOpen).map((item) => item.key);
}

/* =========================================================
   MOVES
========================================================= */

/**
 * Where an enquiry may go from where it is.
 *
 * A transition row with a null type applies to every type, so the common
 * path is stated once. A typed row adds a move only that type may make.
 */
export function allowedNextStatuses(
  workflow: EnquiryWorkflow,
  fromStatus: string,
  enquiryType: string,
): EnquiryStatusOption[] {
  /*
   * When the workflow couldn't be read, every move to a different status is
   * allowed. Freezing the module over a transient database hiccup is worse
   * than letting an unusual move through: the database still enforces its
   * own constraints, and the status history records whatever happened.
   */
  if (!workflow.loaded) {
    return activeStatuses(workflow).filter((item) => item.key !== fromStatus);
  }

  const keys = new Set(
    workflow.transitions
      .filter(
        (item) =>
          item.fromStatus === fromStatus && (item.enquiryType === null || item.enquiryType === enquiryType),
      )
      .map((item) => item.toStatus),
  );

  return activeStatuses(workflow).filter((item) => keys.has(item.key));
}

export function canTransition(
  workflow: EnquiryWorkflow,
  fromStatus: string,
  toStatus: string,
  enquiryType: string,
): boolean {
  if (fromStatus === toStatus) return false;

  return allowedNextStatuses(workflow, fromStatus, enquiryType).some((item) => item.key === toStatus);
}

/**
 * Why a move was refused, in words somebody can act on.
 *
 * "Invalid status transition" tells a person nothing. Naming where they can
 * actually go turns a dead end into a next step.
 */
export function describeRefusal(
  workflow: EnquiryWorkflow,
  fromStatus: string,
  toStatus: string,
  enquiryType: string,
): string {
  const from = findStatus(workflow, fromStatus);
  const to = findStatus(workflow, toStatus);

  if (!to) return `${toStatus} isn't a status an enquiry can be in.`;

  /*
   * Where it can actually go comes first, even for a terminal status.
   *
   * Some endings have a way back and some don't: a false positive on Spam
   * can go to New, while Completed is final. Telling somebody on a
   * Completed enquiry to "reopen it first" names a door that isn't there,
   * which is the dead end this function exists to avoid.
   */
  const options = allowedNextStatuses(workflow, fromStatus, enquiryType);

  if (options.length === 0) {
    return from?.isTerminal
      ? `This enquiry is ${from.label}, which is where it finishes. There's no way back from here.`
      : `A ${enquiryType} enquiry can't move out of ${from?.label ?? fromStatus}.`;
  }

  if (from?.isTerminal) {
    return `This enquiry is ${from.label}. From here it can only go to ${options
      .map((item) => item.label)
      .join(", ")}.`;
  }

  return `A ${enquiryType} enquiry can't go from ${from?.label ?? fromStatus} to ${to.label}. It can go to ${options
    .map((item) => item.label)
    .join(", ")}.`;
}
