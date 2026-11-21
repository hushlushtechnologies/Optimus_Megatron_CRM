/*
|--------------------------------------------------------------------------
| WHAT SOMEBODY MAY DO WITH OFFERS AND LOYALTY
|--------------------------------------------------------------------------
|
| Eight keys, in two groups. The split is deliberate in three places:
|
|   publish vs manage  — editing a draft and switching a live campaign on
|                        are different acts. One is housekeeping; the other
|                        changes what customers are charged.
|   adjust  vs view    — seeing a points balance and granting 50,000 points
|                        are not the same thing.
|   settings           — the earn rate and the conversion decide what every
|                        future point is worth.
|
| These sit on top of row-level security, which checks the same keys. This
| module is the friendly early refusal, not the only guard.
*/

export const OFFER_PERMISSION_KEYS = {
  view: "offers.view",
  manage: "offers.manage",
  publish: "offers.publish",
  assign: "offers.assign",
  export: "offers.export",
  loyaltyView: "loyalty.view",
  loyaltyAdjust: "loyalty.adjust",
  loyaltySettings: "loyalty.settings",
} as const;

export type OfferPermissionName = keyof typeof OFFER_PERMISSION_KEYS;

export type OfferPermissions = Record<OfferPermissionName, boolean>;

export const NO_OFFER_PERMISSIONS: OfferPermissions = {
  view: false,
  manage: false,
  publish: false,
  assign: false,
  export: false,
  loyaltyView: false,
  loyaltyAdjust: false,
  loyaltySettings: false,
};

export function toOfferPermissions(granted: string[]): OfferPermissions {
  const held = new Set(granted);

  return Object.fromEntries(
    Object.entries(OFFER_PERMISSION_KEYS).map(([name, key]) => [name, held.has(key)]),
  ) as OfferPermissions;
}

export const OFFER_PERMISSION_MESSAGES: Record<OfferPermissionName, string> = {
  view: "You don't have permission to view offers.",
  manage: "You don't have permission to create or edit campaigns.",
  publish: "You don't have permission to activate, pause or archive campaigns.",
  assign: "You don't have permission to assign offers to customers.",
  export: "You don't have permission to export offer data.",
  loyaltyView: "You don't have permission to view loyalty points.",
  loyaltyAdjust: "You don't have permission to adjust loyalty points.",
  loyaltySettings: "You don't have permission to change the loyalty settings.",
};
