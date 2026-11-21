export interface CustomerProfile {
  id: string;
  user_id: string | null;
  customer_number: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  alternative_phone: string | null;
  location_id: string | null;
  address: string | null;
  preferred_language: "English" | "Arabic" | "Other";
  lifecycle_status: "Prospect" | "Active" | "VIP" | "Inactive" | "Do Not Contact";
  account_status: "No Account" | "Pending Setup" | "Active" | "Disabled";
  source_id: string | null;
  source_detail: string | null;
  primary_relationship_manager_id: string | null;
  profile_photo_url: string | null;
  last_login: string | null;
  last_activity_at: string | null;
  /** Set when the customer is archived. Archived customers are kept, never deleted. */
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

export type RelationshipType =
  | "Interested"
  | "Enquiry"
  | "Test Drive"
  | "Reserved"
  | "Purchased"
  | "Finance"
  | "Trade-In"
  | "Wishlist"
  | "Dream Car";
export type RelationshipStatus = "Active" | "Completed" | "Cancelled";

export interface CustomerVehicleRelation {
  id: string;
  customer_id: string;
  car_id: string;
  relationship_type: RelationshipType;
  relationship_status: RelationshipStatus;
  assigned_staff_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerNote {
  id: string;
  customer_id: string;
  note_text: string;
  is_internal: boolean;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
}

export interface CustomerActivityEntry {
  id: string;
  customer_id: string;
  activity_type: string;
  description: string;
  old_value: string | null;
  new_value: string | null;
  related_car_id: string | null;
  changed_by: string | null;
  changed_at: string;
}

export interface CustomerCommunication {
  id: string;
  customer_id: string;
  type: "WhatsApp" | "Email" | "Phone Call" | "Internal Note";
  subject: string | null;
  summary: string;
  related_car_id: string | null;
  staff_id: string | null;
  created_at: string;
}

/*
 * The lifecycle values, as a list.
 *
 * Added in Sprint 8 because the offer eligibility builder needs to offer
 * them and three other files already hold their own copy
 * (customer-filter-drawer, customer-table, add-customer-form). Those are
 * left alone; new code should use this, and those three can be pointed at
 * it whenever they are next touched.
 *
 * `satisfies` ties it to the Customer type, so adding a status to one and
 * not the other is a compile error rather than a dropdown that quietly
 * misses an option.
 */
export const CUSTOMER_LIFECYCLE_STATUSES = [
  "Prospect",
  "Active",
  "VIP",
  "Inactive",
  "Do Not Contact",
] as const satisfies readonly CustomerProfile["lifecycle_status"][];
