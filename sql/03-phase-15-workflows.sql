-- ===========================================================================
-- SPRINT 7 · PHASE 15 — the type-specific workflows the plan names
-- ===========================================================================
--
-- Phase 1 seeded eleven statuses covering the path every enquiry shares.
-- The plan also names three the typed workflows need and that path does not
-- have:
--
--   Sell My Car:  Review -> Inspection Needed -> Valuation Prepared
--                 -> Offer Sent -> Accepted / Declined
--   Finance:      Under Review -> Additional Information Needed
--                 -> Referred to Finance Team -> Completed / Closed
--
-- "Under Review" and "Additional Information Needed" already exist under the
-- names In Review and Waiting for Customer, and renaming them would churn
-- every row and every saved filter for nothing. The three genuinely missing
-- ones are added here.
--
-- Safe to re-run: every insert is guarded.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The three new statuses
--
-- All three are open, none terminal: an enquiry sitting at "Referred to
-- Finance Team" is very much live work, and counting it as finished would
-- quietly flatter the completion rate on the dashboard.
-- ---------------------------------------------------------------------------

insert into public.enquiry_statuses (key, label, tone, is_open, is_terminal, sort_order) values
  ('Inspection Needed',         'Inspection Needed',         'warning', true, false, 32),
  ('Valuation Prepared',        'Valuation Prepared',        'info',    true, false, 34),
  ('Referred to Finance Team',  'Referred to Finance Team',  'info',    true, false, 36)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Sell My Car and Trade-In: the inspection and valuation path
--
-- Typed rather than global, because "Inspection Needed" means nothing on a
-- finance request or a general question. Offering it there would be a dead
-- end somebody has to be told about.
-- ---------------------------------------------------------------------------

insert into public.enquiry_status_transitions (from_status, to_status, enquiry_type)
select f, t, ty
from (values
  -- Into the path
  ('In Review','Inspection Needed','Sell My Car'),
  ('In Review','Inspection Needed','Trade-In'),
  ('Assigned','Inspection Needed','Sell My Car'),
  ('Assigned','Inspection Needed','Trade-In'),

  -- Through it
  ('Inspection Needed','Valuation Prepared','Sell My Car'),
  ('Inspection Needed','Valuation Prepared','Trade-In'),
  ('Valuation Prepared','Offer Sent','Sell My Car'),
  ('Valuation Prepared','Offer Sent','Trade-In'),

  -- Back out of it, because an inspection can be inconclusive and a
  -- valuation can be rejected internally before it ever reaches a customer.
  ('Inspection Needed','In Review','Sell My Car'),
  ('Inspection Needed','In Review','Trade-In'),
  ('Valuation Prepared','In Review','Sell My Car'),
  ('Valuation Prepared','In Review','Trade-In'),

  -- Out of it altogether. A customer who stops answering during an
  -- inspection has to be parkable without pretending the work finished.
  ('Inspection Needed','Waiting for Customer','Sell My Car'),
  ('Inspection Needed','Waiting for Customer','Trade-In'),
  ('Inspection Needed','Cancelled','Sell My Car'),
  ('Inspection Needed','Cancelled','Trade-In'),
  ('Valuation Prepared','Cancelled','Sell My Car'),
  ('Valuation Prepared','Cancelled','Trade-In'),

  -- Phase 1 gave Offer Sent its endings; this is the one it lacked.
  ('Offer Sent','Cancelled','Sell My Car'),
  ('Offer Sent','Cancelled','Trade-In'),

  -- ---- Finance ----
  --
  -- Referred to Finance Team is a record of where the work sits, NOT an
  -- approval. Nothing in this module may stand for a bank's decision, which
  -- is why the only moves out of it are back to us, to the customer, or to
  -- a plain ending — there is no "Approved" status anywhere in this list.
  ('In Review','Referred to Finance Team','Finance'),
  ('Assigned','Referred to Finance Team','Finance'),
  ('Referred to Finance Team','In Review','Finance'),
  ('Referred to Finance Team','Waiting for Customer','Finance'),
  ('Referred to Finance Team','Follow-Up','Finance'),
  ('Referred to Finance Team','Completed','Finance'),
  ('Referred to Finance Team','Rejected','Finance'),
  ('Referred to Finance Team','Cancelled','Finance')
) as v (f, t, ty)
where not exists (
  select 1 from public.enquiry_status_transitions x
  where x.from_status = v.f and x.to_status = v.t and x.enquiry_type = v.ty
);

commit;

-- ===========================================================================
-- Check it landed
-- ===========================================================================

-- 14 statuses, 9 of them open.
select count(*) as statuses,
       count(*) filter (where is_open) as open_statuses  -- expect 14 and 9
from public.enquiry_statuses;

-- Every status a Sell My Car enquiry can reach, in order.
select s.key, s.is_open, s.is_terminal
from public.enquiry_statuses s
where exists (
  select 1 from public.enquiry_status_transitions t
  where t.to_status = s.key and (t.enquiry_type is null or t.enquiry_type = 'Sell My Car')
)
order by s.sort_order;

-- The three new ones must be unreachable from a General enquiry.
-- Expect zero rows.
select t.from_status, t.to_status
from public.enquiry_status_transitions t
where t.to_status in ('Inspection Needed', 'Valuation Prepared', 'Referred to Finance Team')
  and t.enquiry_type is null;

-- And nothing anywhere may read as a finance approval. Expect zero rows.
select key from public.enquiry_statuses
where key ilike '%approv%' or label ilike '%approv%';
