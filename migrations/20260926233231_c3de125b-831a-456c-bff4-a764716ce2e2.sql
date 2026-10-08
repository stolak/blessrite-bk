
-- ORGANIZATIONS
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS operating_hours text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

CREATE TABLE public.organization_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  doc_type text NOT NULL DEFAULT 'Other',
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.organization_documents TO authenticated;
GRANT ALL ON public.organization_documents TO service_role;
ALTER TABLE public.organization_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_docs_read ON public.organization_documents FOR SELECT TO authenticated
  USING (private.is_ops(auth.uid()) OR private.has_org_access(auth.uid(), organization_id));
CREATE POLICY org_docs_insert ON public.organization_documents FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid() AND (private.is_ops(auth.uid()) OR private.has_org_access(auth.uid(), organization_id)));
CREATE POLICY org_docs_delete ON public.organization_documents FOR DELETE TO authenticated
  USING (private.is_ops(auth.uid()) OR (uploaded_by = auth.uid()));

-- CASES: shop response
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS shop_response text NOT NULL DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS shop_response_reason text,
  ADD COLUMN IF NOT EXISTS shop_responded_at timestamptz;

-- TRANSPORT
CREATE TABLE public.transport_statuses (status text PRIMARY KEY, sort_order int NOT NULL, customer_label text NOT NULL, is_terminal boolean NOT NULL DEFAULT false);
GRANT SELECT ON public.transport_statuses TO authenticated; GRANT ALL ON public.transport_statuses TO service_role;
ALTER TABLE public.transport_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY ts_read ON public.transport_statuses FOR SELECT TO authenticated USING (true);
INSERT INTO public.transport_statuses VALUES
 ('Requested',1,'Transport requested',false),('Assigned',2,'Driver assigned',false),('Accepted',3,'Driver confirmed',false),
 ('En Route',4,'Driver on the way',false),('Arrived',5,'Driver arrived',false),('Picked Up',6,'Vehicle picked up',false),
 ('In Transit',7,'Vehicle in transit',false),('Delivered',8,'Vehicle delivered',false),('Completed',9,'Job completed',true),
 ('Failed',10,'Attempt unsuccessful',false),('Cancelled',11,'Transport cancelled',true);

CREATE TABLE public.transport_transitions (from_status text NOT NULL REFERENCES public.transport_statuses(status), to_status text NOT NULL REFERENCES public.transport_statuses(status), requires_reason boolean NOT NULL DEFAULT false, PRIMARY KEY (from_status,to_status));
GRANT SELECT ON public.transport_transitions TO authenticated; GRANT ALL ON public.transport_transitions TO service_role;
ALTER TABLE public.transport_transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tt_read ON public.transport_transitions FOR SELECT TO authenticated USING (true);
INSERT INTO public.transport_transitions VALUES
 ('Requested','Assigned',false),('Requested','Accepted',false),('Requested','Cancelled',true),
 ('Assigned','Accepted',false),('Assigned','Requested',true),('Assigned','Cancelled',true),
 ('Accepted','En Route',false),('Accepted','Requested',true),('Accepted','Cancelled',true),
 ('En Route','Arrived',false),('En Route','Failed',true),
 ('Arrived','Picked Up',false),('Arrived','Completed',false),('Arrived','Failed',true),
 ('Picked Up','In Transit',false),('Picked Up','Failed',true),
 ('In Transit','Delivered',false),('In Transit','Failed',true),
 ('Delivered','Completed',false),
 ('Failed','Requested',true),('Failed','Cancelled',true);

CREATE TABLE public.transport_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id),
  job_type text NOT NULL CHECK (job_type IN ('roadside','pickup','delivery','transfer','field_service')),
  vehicle_id uuid REFERENCES public.vehicles(id),
  vehicle_summary text,
  pickup_address text,
  pickup_lat double precision, pickup_lng double precision,
  destination_address text,
  destination_lat double precision, destination_lng double precision,
  contact_name text, contact_phone text,
  instructions text,
  scheduled_at timestamptz,
  accepted_at timestamptz, en_route_at timestamptz, arrived_at timestamptz,
  picked_up_at timestamptz, delivered_at timestamptz, completed_at timestamptz,
  assigned_driver_id uuid,
  assigned_org_id uuid REFERENCES public.organizations(id),
  open_to_drivers boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'Requested' REFERENCES public.transport_statuses(status),
  status_note text,
  condition_notes text,
  recipient_name text,
  signature_path text,
  driver_notes text,
  driver_last_lat double precision, driver_last_lng double precision, driver_last_at timestamptz,
  requested_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.transport_jobs(case_id);
CREATE INDEX ON public.transport_jobs(assigned_driver_id);
GRANT SELECT, INSERT, UPDATE ON public.transport_jobs TO authenticated; GRANT ALL ON public.transport_jobs TO service_role;

CREATE TABLE public.transport_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transport_job_id uuid NOT NULL REFERENCES public.transport_jobs(id),
  case_id uuid NOT NULL REFERENCES public.cases(id),
  event_type text NOT NULL,
  status text,
  notes text,
  is_incident boolean NOT NULL DEFAULT false,
  latitude double precision, longitude double precision,
  actor_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.transport_events TO authenticated; GRANT ALL ON public.transport_events TO service_role;

CREATE TABLE public.case_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id),
  description text NOT NULL,
  part_number text,
  quantity numeric NOT NULL DEFAULT 1,
  notes text,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.case_parts TO authenticated; GRANT ALL ON public.case_parts TO service_role;

ALTER TABLE public.case_media ADD COLUMN IF NOT EXISTS transport_job_id uuid REFERENCES public.transport_jobs(id);

-- HELPERS
CREATE OR REPLACE FUNCTION private.shop_case(_user_id uuid, _case_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _case_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.cases c JOIN public.organizations o ON o.id = c.assigned_org_id
    JOIN public.organization_members m ON m.organization_id = o.id
    WHERE c.id = _case_id AND m.user_id = _user_id AND m.active AND o.org_type = 'repair_shop')
$$;
CREATE OR REPLACE FUNCTION private.driver_case(_user_id uuid, _case_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _case_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.transport_jobs t WHERE t.case_id = _case_id AND t.assigned_driver_id = _user_id)
$$;
GRANT EXECUTE ON FUNCTION private.shop_case(uuid,uuid), private.driver_case(uuid,uuid) TO authenticated;

-- TRANSPORT RLS
ALTER TABLE public.transport_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tj_select ON public.transport_jobs FOR SELECT TO authenticated USING (
  private.is_ops(auth.uid()) OR assigned_driver_id = auth.uid()
  OR private.shop_case(auth.uid(), case_id)
  OR private.has_org_access(auth.uid(), assigned_org_id)
  OR (open_to_drivers AND status = 'Requested' AND assigned_driver_id IS NULL AND private.has_role(auth.uid(),'driver')));
CREATE POLICY tj_insert ON public.transport_jobs FOR INSERT TO authenticated WITH CHECK (
  requested_by = auth.uid() AND (private.is_ops(auth.uid())
   OR (private.shop_case(auth.uid(), case_id) AND status = 'Requested' AND assigned_driver_id IS NULL AND open_to_drivers = false)));
CREATE POLICY tj_ops_update ON public.transport_jobs FOR UPDATE TO authenticated
  USING (private.is_ops(auth.uid())) WITH CHECK (private.is_ops(auth.uid()));

ALTER TABLE public.transport_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY te_select ON public.transport_events FOR SELECT TO authenticated USING (
  private.is_ops(auth.uid()) OR EXISTS (SELECT 1 FROM public.transport_jobs t WHERE t.id = transport_job_id AND t.assigned_driver_id = auth.uid())
  OR private.shop_case(auth.uid(), case_id));
CREATE POLICY te_insert ON public.transport_events FOR INSERT TO authenticated WITH CHECK (
  actor_id = auth.uid() AND (private.is_ops(auth.uid()) OR EXISTS (SELECT 1 FROM public.transport_jobs t WHERE t.id = transport_job_id AND t.assigned_driver_id = auth.uid())));

ALTER TABLE public.case_parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY cp_select ON public.case_parts FOR SELECT TO authenticated USING (private.is_ops(auth.uid()) OR private.shop_case(auth.uid(), case_id));
CREATE POLICY cp_insert ON public.case_parts FOR INSERT TO authenticated WITH CHECK (added_by = auth.uid() AND (private.is_ops(auth.uid()) OR private.shop_case(auth.uid(), case_id)));
CREATE POLICY cp_delete ON public.case_parts FOR DELETE TO authenticated USING (private.is_ops(auth.uid()) OR (added_by = auth.uid() AND private.shop_case(auth.uid(), case_id)));

-- SHOP ACCESS TO EXISTING PHASE 2 RECORDS (case-scoped)
CREATE POLICY bookings_shop_select ON public.bookings FOR SELECT TO authenticated USING (private.shop_case(auth.uid(), case_id));
CREATE POLICY vehicles_partner_select ON public.vehicles FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.cases c WHERE c.vehicle_id = vehicles.id AND private.shop_case(auth.uid(), c.id))
  OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.vehicle_id = vehicles.id AND private.shop_case(auth.uid(), b.case_id)));
CREATE POLICY inspections_shop_select ON public.inspections FOR SELECT TO authenticated USING (private.shop_case(auth.uid(), case_id));
CREATE POLICY inspections_shop_insert ON public.inspections FOR INSERT TO authenticated WITH CHECK (private.shop_case(auth.uid(), case_id));
CREATE POLICY inspections_shop_update ON public.inspections FOR UPDATE TO authenticated USING (private.shop_case(auth.uid(), case_id)) WITH CHECK (private.shop_case(auth.uid(), case_id));
CREATE POLICY estimates_shop_select ON public.estimates FOR SELECT TO authenticated USING (private.shop_case(auth.uid(), case_id));
CREATE POLICY estimates_shop_insert ON public.estimates FOR INSERT TO authenticated WITH CHECK (private.shop_case(auth.uid(), case_id) AND status = 'Draft');
CREATE POLICY estimates_shop_update ON public.estimates FOR UPDATE TO authenticated USING (private.shop_case(auth.uid(), case_id)) WITH CHECK (private.shop_case(auth.uid(), case_id));
CREATE POLICY estimate_items_shop_select ON public.estimate_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.estimates e WHERE e.id = estimate_id AND private.shop_case(auth.uid(), e.case_id)));
CREATE POLICY estimate_items_shop_insert ON public.estimate_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.estimates e WHERE e.id = estimate_id AND private.shop_case(auth.uid(), e.case_id)));
CREATE POLICY estimate_items_shop_update ON public.estimate_items FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.estimates e WHERE e.id = estimate_id AND private.shop_case(auth.uid(), e.case_id)));
CREATE POLICY estimate_items_shop_delete ON public.estimate_items FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.estimates e WHERE e.id = estimate_id AND private.shop_case(auth.uid(), e.case_id)));
CREATE POLICY estimate_approvals_shop_select ON public.estimate_approvals FOR SELECT TO authenticated USING (private.shop_case(auth.uid(), case_id));
CREATE POLICY invoices_shop_select ON public.invoices FOR SELECT TO authenticated USING (private.shop_case(auth.uid(), case_id));
CREATE POLICY invoices_shop_insert ON public.invoices FOR INSERT TO authenticated WITH CHECK (private.shop_case(auth.uid(), case_id));
CREATE POLICY invoices_shop_update ON public.invoices FOR UPDATE TO authenticated USING (private.shop_case(auth.uid(), case_id) AND status = 'Draft') WITH CHECK (private.shop_case(auth.uid(), case_id) AND status IN ('Draft','Sent'));
CREATE POLICY invoice_items_shop_select ON public.invoice_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND private.shop_case(auth.uid(), i.case_id)));
CREATE POLICY invoice_items_shop_insert ON public.invoice_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND i.status = 'Draft' AND private.shop_case(auth.uid(), i.case_id)));
CREATE POLICY invoice_items_shop_delete ON public.invoice_items FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND i.status = 'Draft' AND private.shop_case(auth.uid(), i.case_id)));
CREATE POLICY case_media_partner_select ON public.case_media FOR SELECT TO authenticated USING (private.shop_case(auth.uid(), case_id) OR private.driver_case(auth.uid(), case_id));
CREATE POLICY case_media_partner_insert ON public.case_media FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid() AND (private.shop_case(auth.uid(), case_id) OR private.driver_case(auth.uid(), case_id)));

-- STORAGE: partners may use the case folder (<owner>/<case_id>/...) of cases they work on
CREATE POLICY "case media partner read" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'case-media' AND (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
  AND (private.shop_case(auth.uid(), ((storage.foldername(name))[2])::uuid) OR private.driver_case(auth.uid(), ((storage.foldername(name))[2])::uuid)));
CREATE POLICY "case media partner insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'case-media' AND (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
  AND (private.shop_case(auth.uid(), ((storage.foldername(name))[2])::uuid) OR private.driver_case(auth.uid(), ((storage.foldername(name))[2])::uuid)));
CREATE POLICY "org docs read" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'case-media' AND (storage.foldername(name))[1] = 'org' AND (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
  AND (private.is_ops(auth.uid()) OR private.has_org_access(auth.uid(), ((storage.foldername(name))[2])::uuid)));
CREATE POLICY "org docs insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'case-media' AND (storage.foldername(name))[1] = 'org' AND (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
  AND (private.is_ops(auth.uid()) OR private.has_org_access(auth.uid(), ((storage.foldername(name))[2])::uuid)));

-- ASSIGNMENT GUARDS
CREATE OR REPLACE FUNCTION public.guard_case_org_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
  IF NEW.assigned_org_id IS NOT NULL AND NEW.assigned_org_id IS DISTINCT FROM OLD.assigned_org_id THEN
    SELECT * INTO o FROM public.organizations WHERE id = NEW.assigned_org_id;
    IF NOT FOUND OR NOT o.active OR o.suspended_at IS NOT NULL THEN
      RAISE EXCEPTION 'This organisation is suspended or inactive and cannot receive new assignments.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.assigned_org_id IS DISTINCT FROM OLD.assigned_org_id THEN
    NEW.shop_response := 'Pending'; NEW.shop_response_reason := NULL; NEW.shop_responded_at := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cases_guard_org BEFORE UPDATE ON public.cases FOR EACH ROW EXECUTE FUNCTION public.guard_case_org_assignment();

CREATE OR REPLACE FUNCTION public.transport_before() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record; o record; v record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.vehicle_id IS NULL THEN SELECT vehicle_id INTO NEW.vehicle_id FROM public.cases WHERE id = NEW.case_id; END IF;
    IF NEW.vehicle_id IS NOT NULL AND NEW.vehicle_summary IS NULL THEN
      SELECT * INTO v FROM public.vehicles WHERE id = NEW.vehicle_id;
      NEW.vehicle_summary := trim(concat_ws(' ', v.year::text, v.make, v.model, CASE WHEN v.colour IS NOT NULL THEN '('||v.colour||')' END, CASE WHEN v.plate IS NOT NULL THEN '· '||v.plate END));
    END IF;
    IF NEW.assigned_driver_id IS NOT NULL AND NEW.status = 'Requested' THEN NEW.status := 'Assigned'; END IF;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      SELECT * INTO t FROM public.transport_transitions WHERE from_status = OLD.status AND to_status = NEW.status;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'A transport job cannot move from % to %.', OLD.status, NEW.status USING ERRCODE = 'check_violation';
      END IF;
      IF t.requires_reason AND coalesce(btrim(NEW.status_note),'') = '' THEN
        RAISE EXCEPTION 'A reason is required to move a transport job from % to %.', OLD.status, NEW.status USING ERRCODE = 'check_violation';
      END IF;
      CASE NEW.status
        WHEN 'Accepted' THEN NEW.accepted_at := now();
        WHEN 'En Route' THEN NEW.en_route_at := now();
        WHEN 'Arrived' THEN NEW.arrived_at := now();
        WHEN 'Picked Up' THEN NEW.picked_up_at := now();
        WHEN 'Delivered' THEN NEW.delivered_at := now();
        WHEN 'Completed' THEN NEW.completed_at := now();
        WHEN 'Requested' THEN NEW.assigned_driver_id := NULL;
        ELSE NULL;
      END CASE;
    END IF;
    IF NEW.assigned_driver_id IS NOT NULL AND NEW.assigned_driver_id IS DISTINCT FROM OLD.assigned_driver_id AND NEW.status = 'Requested' THEN
      NEW.status := 'Assigned';
    END IF;
    NEW.updated_at := now();
  END IF;
  IF NEW.assigned_driver_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.assigned_driver_id IS DISTINCT FROM OLD.assigned_driver_id) THEN
    IF NOT private.has_role(NEW.assigned_driver_id, 'driver') THEN
      RAISE EXCEPTION 'This person is not an active driver/technician and cannot be assigned.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.assigned_org_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.assigned_org_id IS DISTINCT FROM OLD.assigned_org_id) THEN
    SELECT * INTO o FROM public.organizations WHERE id = NEW.assigned_org_id;
    IF NOT FOUND OR NOT o.active OR o.suspended_at IS NOT NULL THEN
      RAISE EXCEPTION 'This provider is suspended or inactive and cannot be assigned.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER transport_jobs_before BEFORE INSERT OR UPDATE ON public.transport_jobs FOR EACH ROW EXECUTE FUNCTION public.transport_before();

CREATE OR REPLACE FUNCTION public.transport_after() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; label text; kind text; visible boolean;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = NEW.case_id;
  kind := CASE NEW.job_type WHEN 'roadside' THEN 'Roadside assistance' WHEN 'pickup' THEN 'Vehicle pickup'
          WHEN 'delivery' THEN 'Vehicle return' WHEN 'transfer' THEN 'Vehicle transfer' ELSE 'Field service' END;
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT customer_label INTO label FROM public.transport_statuses WHERE status = NEW.status;
    visible := NEW.status NOT IN ('Assigned');
    INSERT INTO public.transport_events (transport_job_id, case_id, event_type, status, notes, is_incident, latitude, longitude, actor_id)
    VALUES (NEW.id, NEW.case_id, CASE WHEN TG_OP='INSERT' THEN 'created' ELSE 'status_changed' END, NEW.status, NEW.status_note,
            NEW.status = 'Failed', NEW.driver_last_lat, NEW.driver_last_lng, auth.uid());
    INSERT INTO public.case_events (case_id, event_type, actor_id, customer_visible, title, body)
    VALUES (NEW.case_id, 'transport_' || lower(replace(NEW.status,' ','_')), auth.uid(), visible,
            kind || ': ' || label, CASE WHEN NEW.status IN ('Failed','Cancelled') THEN NEW.status_note END);
    INSERT INTO public.audit_events (actor_id, action, entity_type, entity_id, case_id, before, after, reason)
    VALUES (auth.uid(), CASE WHEN TG_OP='INSERT' THEN 'transport.created' ELSE 'transport.status_changed' END, 'transport_job', NEW.id, NEW.case_id,
            CASE WHEN TG_OP='UPDATE' THEN jsonb_build_object('status', OLD.status) END,
            jsonb_build_object('status', NEW.status, 'job_type', NEW.job_type, 'driver', NEW.assigned_driver_id), NEW.status_note);
    IF visible AND NEW.status IN ('Accepted','En Route','Arrived','Picked Up','Delivered','Completed','Failed') THEN
      PERFORM public.notify_customer(c.customer_id, NEW.case_id, 'transport_status', kind || ': ' || label,
        c.case_ref || ' — ' || lower(label) || '.', '/appointments');
    END IF;

    -- keep the master case in step (errors are ignored so field work is never lost)
    BEGIN
      IF NEW.job_type = 'delivery' AND NEW.status = 'Picked Up' AND c.state = 'Ready' THEN
        UPDATE public.cases SET state = 'Return in Progress', state_change_reason = NULL WHERE id = c.id;
      ELSIF NEW.job_type = 'delivery' AND NEW.status = 'Completed' AND c.state = 'Return in Progress' THEN
        UPDATE public.cases SET state = 'Completed' WHERE id = c.id;
      ELSIF NEW.job_type IN ('roadside','field_service') AND NEW.status = 'En Route' AND c.state IN ('Accepted','Assigned') THEN
        UPDATE public.cases SET state = 'In Progress' WHERE id = c.id;
      ELSIF NEW.job_type IN ('roadside','field_service') AND NEW.status = 'Completed' AND c.state = 'In Progress' THEN
        UPDATE public.cases SET state = 'Ready' WHERE id = c.id;
        UPDATE public.cases SET state = 'Completed' WHERE id = c.id;
      END IF;
    EXCEPTION WHEN others THEN
      INSERT INTO public.case_events (case_id, event_type, actor_id, customer_visible, title, body)
      VALUES (NEW.case_id, 'case_sync_skipped', auth.uid(), false, 'Case state not advanced automatically', SQLERRM);
    END;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.assigned_driver_id IS DISTINCT FROM OLD.assigned_driver_id THEN
    INSERT INTO public.audit_events (actor_id, action, entity_type, entity_id, case_id, before, after)
    VALUES (auth.uid(), 'transport.assignment_changed', 'transport_job', NEW.id, NEW.case_id,
            jsonb_build_object('driver', OLD.assigned_driver_id), jsonb_build_object('driver', NEW.assigned_driver_id));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER transport_jobs_after AFTER INSERT OR UPDATE ON public.transport_jobs FOR EACH ROW EXECUTE FUNCTION public.transport_after();

REVOKE EXECUTE ON FUNCTION public.guard_case_org_assignment(), public.transport_before(), public.transport_after() FROM PUBLIC, anon, authenticated;

-- RPCs for shop and driver actions (checked inside)
CREATE OR REPLACE FUNCTION public.shop_respond(_case_id uuid, _accept boolean, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record;
BEGIN
  IF NOT private.shop_case(auth.uid(), _case_id) THEN RAISE EXCEPTION 'This job is not assigned to your shop.'; END IF;
  IF NOT _accept AND coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'A reason is required to reject a job.'; END IF;
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c.shop_response <> 'Pending' THEN RAISE EXCEPTION 'You have already responded to this job.'; END IF;
  UPDATE public.cases SET shop_response = CASE WHEN _accept THEN 'Accepted' ELSE 'Rejected' END,
         shop_response_reason = _reason, shop_responded_at = now() WHERE id = _case_id;
  INSERT INTO public.case_events (case_id, event_type, actor_id, customer_visible, title, body)
  VALUES (_case_id, CASE WHEN _accept THEN 'shop_accepted' ELSE 'shop_rejected' END, auth.uid(), _accept,
          CASE WHEN _accept THEN 'Repair shop confirmed' ELSE 'Repair shop declined the job' END,
          CASE WHEN _accept THEN NULL ELSE _reason END);
  INSERT INTO public.audit_events (actor_id, action, entity_type, entity_id, case_id, after, reason)
  VALUES (auth.uid(), CASE WHEN _accept THEN 'shop.accepted' ELSE 'shop.rejected' END, 'case', _case_id, _case_id,
          jsonb_build_object('org', c.assigned_org_id), _reason);
  IF _accept THEN
    PERFORM public.notify_customer(c.customer_id, _case_id, 'case_status', 'Repair shop confirmed', c.case_ref || ' has been accepted by the repair shop.', '/appointments');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.shop_set_case_state(_case_id uuid, _to_state text, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record;
BEGIN
  IF NOT private.shop_case(auth.uid(), _case_id) THEN RAISE EXCEPTION 'This job is not assigned to your shop.'; END IF;
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF c.shop_response <> 'Accepted' THEN RAISE EXCEPTION 'Accept the job before updating its status.'; END IF;
  IF _to_state NOT IN ('In Progress','Waiting for Parts','Awaiting Approval','Ready','Exception') THEN
    RAISE EXCEPTION 'Repair shops cannot set a job to %.', _to_state;
  END IF;
  UPDATE public.cases SET state = _to_state, state_change_reason = NULLIF(btrim(_reason),'') WHERE id = _case_id;
END $$;

CREATE OR REPLACE FUNCTION public.shop_update_profile(_org_id uuid, _contact_name text, _contact_email text, _contact_phone text,
  _address text, _service_area text, _operating_hours text, _capabilities text[], _lat double precision, _lng double precision) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.has_org_access(auth.uid(), _org_id) THEN RAISE EXCEPTION 'You are not a member of this organisation.'; END IF;
  UPDATE public.organizations SET contact_name=_contact_name, contact_email=_contact_email, contact_phone=_contact_phone,
    address=_address, service_area=_service_area, operating_hours=_operating_hours, capabilities=coalesce(_capabilities,'{}'),
    latitude=_lat, longitude=_lng WHERE id = _org_id;
  INSERT INTO public.audit_events (actor_id, action, entity_type, entity_id, after)
  VALUES (auth.uid(), 'organization.profile_updated', 'organization', _org_id, jsonb_build_object('address', _address, 'service_area', _service_area));
END $$;

CREATE OR REPLACE FUNCTION public.driver_update_job(_job_id uuid, _to_status text, _note text, _lat double precision, _lng double precision,
  _condition_notes text, _recipient_name text, _signature_path text, _driver_notes text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j record;
BEGIN
  SELECT * INTO j FROM public.transport_jobs WHERE id = _job_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job not found.'; END IF;
  IF j.assigned_driver_id IS DISTINCT FROM auth.uid() THEN
    IF _to_status = 'Accepted' AND j.status = 'Requested' AND j.open_to_drivers AND j.assigned_driver_id IS NULL AND private.has_role(auth.uid(),'driver') THEN
      NULL; -- claiming an open job
    ELSE RAISE EXCEPTION 'This job is not assigned to you.'; END IF;
  END IF;
  IF _to_status NOT IN ('Accepted','Requested','En Route','Arrived','Picked Up','In Transit','Delivered','Completed','Failed') THEN
    RAISE EXCEPTION 'Drivers cannot set a job to %.', _to_status;
  END IF;
  IF _to_status = 'Delivered' AND coalesce(btrim(coalesce(_recipient_name, j.recipient_name)),'') = '' THEN
    RAISE EXCEPTION 'Record who received the vehicle before confirming delivery.';
  END IF;
  UPDATE public.transport_jobs SET
    assigned_driver_id = CASE WHEN _to_status = 'Accepted' THEN auth.uid() ELSE assigned_driver_id END,
    status = _to_status, status_note = _note,
    driver_last_lat = coalesce(_lat, driver_last_lat), driver_last_lng = coalesce(_lng, driver_last_lng),
    driver_last_at = CASE WHEN _lat IS NOT NULL THEN now() ELSE driver_last_at END,
    condition_notes = coalesce(_condition_notes, condition_notes),
    recipient_name = coalesce(_recipient_name, recipient_name),
    signature_path = coalesce(_signature_path, signature_path),
    driver_notes = coalesce(_driver_notes, driver_notes)
  WHERE id = _job_id;
END $$;

CREATE OR REPLACE FUNCTION public.driver_log_incident(_job_id uuid, _note text, _lat double precision, _lng double precision) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j record;
BEGIN
  SELECT * INTO j FROM public.transport_jobs WHERE id = _job_id;
  IF j.assigned_driver_id IS DISTINCT FROM auth.uid() AND NOT private.is_ops(auth.uid()) THEN RAISE EXCEPTION 'This job is not assigned to you.'; END IF;
  IF coalesce(btrim(_note),'') = '' THEN RAISE EXCEPTION 'Describe the incident.'; END IF;
  INSERT INTO public.transport_events (transport_job_id, case_id, event_type, status, notes, is_incident, latitude, longitude, actor_id)
  VALUES (_job_id, j.case_id, 'incident', j.status, _note, true, _lat, _lng, auth.uid());
  INSERT INTO public.case_events (case_id, event_type, actor_id, customer_visible, title, body)
  VALUES (j.case_id, 'transport_incident', auth.uid(), false, 'Driver reported an incident', _note);
  INSERT INTO public.audit_events (actor_id, action, entity_type, entity_id, case_id, reason)
  VALUES (auth.uid(), 'transport.incident', 'transport_job', _job_id, j.case_id, _note);
END $$;

REVOKE EXECUTE ON FUNCTION public.shop_respond(uuid,boolean,text), public.shop_set_case_state(uuid,text,text),
  public.shop_update_profile(uuid,text,text,text,text,text,text,text[],double precision,double precision),
  public.driver_update_job(uuid,text,text,double precision,double precision,text,text,text,text),
  public.driver_log_incident(uuid,text,double precision,double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shop_respond(uuid,boolean,text), public.shop_set_case_state(uuid,text,text),
  public.shop_update_profile(uuid,text,text,text,text,text,text,text[],double precision,double precision),
  public.driver_update_job(uuid,text,text,double precision,double precision,text,text,text,text),
  public.driver_log_incident(uuid,text,double precision,double precision) TO authenticated;
