-- ============ REL-001: pre-change snapshot ============
CREATE TABLE IF NOT EXISTS public.migration_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase text NOT NULL,
  note text,
  snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.migration_log TO authenticated;
GRANT ALL ON public.migration_log TO service_role;
ALTER TABLE public.migration_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "migration_log_admin_read" ON public.migration_log
  FOR SELECT TO authenticated USING (private.is_superadmin(auth.uid()) OR private.has_role(auth.uid(),'admin'));

INSERT INTO public.migration_log (phase, note, snapshot)
SELECT 'phase-1-foundation', 'Pre-change row counts (REL-001)',
  jsonb_build_object(
    'bookings', (SELECT count(*) FROM public.bookings),
    'roadside_requests', (SELECT count(*) FROM public.roadside_requests),
    'estimates', (SELECT count(*) FROM public.estimates),
    'invoices', (SELECT count(*) FROM public.invoices),
    'messages', (SELECT count(*) FROM public.messages),
    'booking_events', (SELECT count(*) FROM public.booking_events),
    'booking_reminders', (SELECT count(*) FROM public.booking_reminders),
    'repair_shops', (SELECT count(*) FROM public.repair_shops),
    'vehicles', (SELECT count(*) FROM public.vehicles),
    'profiles', (SELECT count(*) FROM public.profiles)
  );

-- ============ Organizations and membership (SEC-002/3/4) ============
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_type text NOT NULL CHECK (org_type IN ('repair_shop','supplier','driver_team','blessrite')),
  legal_name text NOT NULL,
  operating_name text,
  contact_name text,
  contact_email text,
  contact_phone text,
  address text,
  service_area text,
  capabilities text[] NOT NULL DEFAULT '{}',
  approval_status text NOT NULL DEFAULT 'Pending'
    CHECK (approval_status IN ('Pending','Approved','Rejected','Suspended','Deactivated')),
  agreement_status text NOT NULL DEFAULT 'Not Started'
    CHECK (agreement_status IN ('Not Started','Sent','Signed','Expired')),
  active boolean NOT NULL DEFAULT true,
  notes text,
  legacy boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_role text NOT NULL DEFAULT 'member' CHECK (org_role IN ('owner','manager','member')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
GRANT SELECT, INSERT, UPDATE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.current_org_ids(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.organization_members
  WHERE user_id = _user_id AND active
$$;

CREATE OR REPLACE FUNCTION private.has_org_access(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _org_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND organization_id = _org_id AND active
  )
$$;

CREATE OR REPLACE FUNCTION private.is_ops(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.is_staff(_user_id) OR private.has_role(_user_id, 'ops')
$$;

REVOKE EXECUTE ON FUNCTION private.current_org_ids(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION private.has_org_access(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION private.is_ops(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION private.current_org_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_org_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_ops(uuid) TO authenticated;

CREATE POLICY "orgs_read_members_or_staff" ON public.organizations
  FOR SELECT TO authenticated
  USING (private.is_ops(auth.uid()) OR private.has_org_access(auth.uid(), id));
CREATE POLICY "orgs_admin_insert" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'admin') OR private.is_superadmin(auth.uid()));
CREATE POLICY "orgs_admin_update" ON public.organizations
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'admin') OR private.is_superadmin(auth.uid()))
  WITH CHECK (private.has_role(auth.uid(),'admin') OR private.is_superadmin(auth.uid()));

CREATE POLICY "org_members_read" ON public.organization_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_ops(auth.uid()) OR private.has_org_access(auth.uid(), organization_id));
CREATE POLICY "org_members_admin_insert" ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(),'admin') OR private.is_superadmin(auth.uid()));
CREATE POLICY "org_members_admin_update" ON public.organization_members
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'admin') OR private.is_superadmin(auth.uid()))
  WITH CHECK (private.has_role(auth.uid(),'admin') OR private.is_superadmin(auth.uid()));

CREATE TRIGGER organizations_updated BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Case state model (ARC-007, PRD 6.1) ============
CREATE TABLE public.case_states (
  state text PRIMARY KEY,
  sort_order integer NOT NULL,
  customer_label text NOT NULL,
  is_terminal boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.case_states TO authenticated, anon;
GRANT ALL ON public.case_states TO service_role;
ALTER TABLE public.case_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_states_readable" ON public.case_states FOR SELECT USING (true);

INSERT INTO public.case_states (state, sort_order, customer_label, is_terminal) VALUES
  ('Requested',1,'Request received',false),
  ('Under Review',2,'Being reviewed',false),
  ('Accepted',3,'Accepted',false),
  ('Assigned',4,'Team assigned',false),
  ('In Progress',5,'In progress',false),
  ('Awaiting Approval',6,'Waiting for your approval',false),
  ('Waiting for Parts',7,'Waiting for parts',false),
  ('Ready',8,'Ready',false),
  ('Return in Progress',9,'On its way back to you',false),
  ('Completed',10,'Completed',true),
  ('Cancelled',11,'Cancelled',true),
  ('Exception',12,'Needs attention',false),
  ('Declined',13,'Declined',true),
  ('More Information',14,'More information needed',false);

CREATE TABLE public.case_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_state text NOT NULL REFERENCES public.case_states(state),
  to_state text NOT NULL REFERENCES public.case_states(state),
  requires_reason boolean NOT NULL DEFAULT false,
  UNIQUE (from_state, to_state)
);
GRANT SELECT ON public.case_transitions TO authenticated, anon;
GRANT ALL ON public.case_transitions TO service_role;
ALTER TABLE public.case_transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_transitions_readable" ON public.case_transitions FOR SELECT USING (true);

INSERT INTO public.case_transitions (from_state, to_state, requires_reason) VALUES
  ('Requested','Under Review',false),
  ('Requested','Accepted',false),
  ('Requested','Cancelled',true),
  ('Under Review','Accepted',false),
  ('Under Review','More Information',false),
  ('Under Review','Declined',true),
  ('Under Review','Cancelled',true),
  ('More Information','Under Review',false),
  ('More Information','Accepted',false),
  ('More Information','Cancelled',true),
  ('Accepted','Assigned',false),
  ('Accepted','In Progress',false),
  ('Accepted','Cancelled',true),
  ('Assigned','In Progress',false),
  ('Assigned','Assigned',true),
  ('Assigned','Cancelled',true),
  ('Assigned','Exception',true),
  ('In Progress','Awaiting Approval',false),
  ('In Progress','Waiting for Parts',false),
  ('In Progress','Ready',false),
  ('In Progress','Exception',true),
  ('In Progress','Cancelled',true),
  ('Awaiting Approval','In Progress',false),
  ('Awaiting Approval','Declined',true),
  ('Awaiting Approval','Cancelled',true),
  ('Awaiting Approval','Exception',true),
  ('Waiting for Parts','In Progress',false),
  ('Waiting for Parts','Exception',true),
  ('Waiting for Parts','Cancelled',true),
  ('Ready','Return in Progress',false),
  ('Ready','Completed',false),
  ('Ready','Exception',true),
  ('Return in Progress','Completed',false),
  ('Return in Progress','Exception',true),
  ('Completed','In Progress',true),
  ('Cancelled','Under Review',true),
  ('Declined','Under Review',true),
  ('Exception','Under Review',true),
  ('Exception','Accepted',true),
  ('Exception','Assigned',true),
  ('Exception','In Progress',true),
  ('Exception','Waiting for Parts',true),
  ('Exception','Ready',true),
  ('Exception','Return in Progress',true),
  ('Exception','Cancelled',true);

-- ============ Cases (ARC-001 .. ARC-004) ============
CREATE SEQUENCE IF NOT EXISTS public.case_ref_seq;
CREATE OR REPLACE FUNCTION public.next_case_ref()
RETURNS text LANGUAGE sql SET search_path = public AS $$
  SELECT 'BR-CASE-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.case_ref_seq')::text, 4, '0');
$$;

CREATE TABLE public.cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_ref text NOT NULL UNIQUE DEFAULT public.next_case_ref(),
  customer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  origin text NOT NULL DEFAULT 'booking' CHECK (origin IN ('booking','roadside','staff','website')),
  service_summary text NOT NULL,
  state text NOT NULL DEFAULT 'Requested' REFERENCES public.case_states(state),
  priority text NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low','Normal','High','Urgent')),
  assigned_ops_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  state_change_reason text,
  legacy boolean NOT NULL DEFAULT false,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cases_customer_idx ON public.cases(customer_id);
CREATE INDEX cases_state_idx ON public.cases(state);
CREATE INDEX cases_org_idx ON public.cases(assigned_org_id);
GRANT SELECT, INSERT, UPDATE ON public.cases TO authenticated;
GRANT ALL ON public.cases TO service_role;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cases_select" ON public.cases
  FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR private.is_ops(auth.uid())
    OR private.has_org_access(auth.uid(), assigned_org_id)
  );
CREATE POLICY "cases_insert" ON public.cases
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid() OR private.is_ops(auth.uid()));
CREATE POLICY "cases_staff_update" ON public.cases
  FOR UPDATE TO authenticated
  USING (private.is_ops(auth.uid()))
  WITH CHECK (private.is_ops(auth.uid()));

CREATE TRIGGER cases_updated BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Case links, timeline, audit (ARC-005, ARC-006, NFR-006) ============
CREATE TABLE public.case_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  record_type text NOT NULL,
  record_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, record_type, record_id)
);
CREATE INDEX case_links_case_idx ON public.case_links(case_id);
GRANT SELECT, INSERT ON public.case_links TO authenticated;
GRANT ALL ON public.case_links TO service_role;
ALTER TABLE public.case_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_links_select" ON public.case_links
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id));
CREATE POLICY "case_links_insert" ON public.case_links
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id));

CREATE TABLE public.case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text,
  customer_visible boolean NOT NULL DEFAULT true,
  title text NOT NULL,
  body text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX case_events_case_idx ON public.case_events(case_id, occurred_at);
GRANT SELECT, INSERT ON public.case_events TO authenticated;
GRANT ALL ON public.case_events TO service_role;
ALTER TABLE public.case_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_events_select" ON public.case_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id)
    AND (customer_visible OR private.is_ops(auth.uid()))
  );
CREATE POLICY "case_events_insert" ON public.case_events
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id));

CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_entity_idx ON public.audit_events(entity_type, entity_id);
CREATE INDEX audit_events_case_idx ON public.audit_events(case_id);
GRANT SELECT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_events_admin_read" ON public.audit_events
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'admin') OR private.is_superadmin(auth.uid()));

-- ============ Transition validation + logging (ARC-007) ============
CREATE OR REPLACE FUNCTION public.validate_case_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record;
BEGIN
  IF NEW.state IS DISTINCT FROM OLD.state THEN
    SELECT * INTO t FROM public.case_transitions
      WHERE from_state = OLD.state AND to_state = NEW.state;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Case % cannot move from % to %', OLD.case_ref, OLD.state, NEW.state
        USING ERRCODE = 'check_violation';
    END IF;
    IF t.requires_reason AND coalesce(btrim(NEW.state_change_reason),'') = '' THEN
      RAISE EXCEPTION 'A reason is required to move case % from % to %', OLD.case_ref, OLD.state, NEW.state
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.state IN ('Completed','Cancelled','Declined') AND NEW.closed_at IS NULL THEN
      NEW.closed_at := now();
    ELSIF NEW.state NOT IN ('Completed','Cancelled','Declined') THEN
      NEW.closed_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.log_case_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE label text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.case_events (case_id, event_type, actor_id, customer_visible, title, body)
    VALUES (NEW.id, 'case_opened', auth.uid(), true, 'Request received',
            'Case ' || NEW.case_ref || ' opened for ' || NEW.service_summary || '.');
    INSERT INTO public.audit_events (actor_id, action, entity_type, entity_id, case_id, after)
    VALUES (auth.uid(), 'case.created', 'case', NEW.id, NEW.id, to_jsonb(NEW));
    RETURN NEW;
  END IF;

  IF NEW.state IS DISTINCT FROM OLD.state THEN
    SELECT customer_label INTO label FROM public.case_states WHERE state = NEW.state;
    INSERT INTO public.case_events (case_id, event_type, actor_id, customer_visible, title, body)
    VALUES (NEW.id, 'state_changed', auth.uid(), true, coalesce(label, NEW.state),
            CASE WHEN NEW.state_change_reason IS NULL THEN NULL ELSE NEW.state_change_reason END);
    INSERT INTO public.audit_events (actor_id, action, entity_type, entity_id, case_id, before, after, reason)
    VALUES (auth.uid(), 'case.state_changed', 'case', NEW.id, NEW.id,
            jsonb_build_object('state', OLD.state), jsonb_build_object('state', NEW.state),
            NEW.state_change_reason);
  END IF;

  IF NEW.assigned_ops_id IS DISTINCT FROM OLD.assigned_ops_id
     OR NEW.assigned_org_id IS DISTINCT FROM OLD.assigned_org_id THEN
    INSERT INTO public.case_events (case_id, event_type, actor_id, customer_visible, title, body)
    VALUES (NEW.id, 'assignment_changed', auth.uid(), false, 'Assignment updated', NULL);
    INSERT INTO public.audit_events (actor_id, action, entity_type, entity_id, case_id, before, after)
    VALUES (auth.uid(), 'case.assignment_changed', 'case', NEW.id, NEW.id,
            jsonb_build_object('ops', OLD.assigned_ops_id, 'org', OLD.assigned_org_id),
            jsonb_build_object('ops', NEW.assigned_ops_id, 'org', NEW.assigned_org_id));
  END IF;

  RETURN NEW;
END; $$;

REVOKE EXECUTE ON FUNCTION public.validate_case_transition() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_case_change() FROM anon, authenticated, PUBLIC;

CREATE TRIGGER cases_validate_transition BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.validate_case_transition();
CREATE TRIGGER cases_log_insert AFTER INSERT ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.log_case_change();
CREATE TRIGGER cases_log_update AFTER UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.log_case_change();

-- ============ Additive case_id links on existing tables (ARC-002) ============
ALTER TABLE public.bookings           ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL;
ALTER TABLE public.roadside_requests  ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL;
ALTER TABLE public.estimates          ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL;
ALTER TABLE public.invoices           ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL;
ALTER TABLE public.messages           ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL;
ALTER TABLE public.booking_events     ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL;
ALTER TABLE public.booking_reminders  ADD COLUMN IF NOT EXISTS case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bookings_case_idx ON public.bookings(case_id);
CREATE INDEX IF NOT EXISTS roadside_case_idx ON public.roadside_requests(case_id);
CREATE INDEX IF NOT EXISTS estimates_case_idx ON public.estimates(case_id);
CREATE INDEX IF NOT EXISTS invoices_case_idx ON public.invoices(case_id);
CREATE INDEX IF NOT EXISTS messages_case_idx ON public.messages(case_id);