-- ===== Config =====
INSERT INTO public.business_settings (key, value, label) VALUES ('marketplace_fee_rate', 0.05, 'Marketplace fee rate (share of parts subtotal)')
ON CONFLICT (key) DO NOTHING;

CREATE SEQUENCE IF NOT EXISTS public.parts_order_seq;

-- ===== Listings =====
CREATE TABLE public.parts_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_org_id uuid NOT NULL REFERENCES public.organizations(id),
  sku text,
  part_number text,
  title text NOT NULL,
  description text,
  manufacturer text,
  fitment text,
  make text,
  model text,
  year_from integer,
  year_to integer,
  classification text NOT NULL DEFAULT 'Aftermarket' CHECK (classification IN ('OEM','Aftermarket','Used')),
  condition text NOT NULL DEFAULT 'New' CHECK (condition IN ('New','Used','Refurbished')),
  price numeric NOT NULL DEFAULT 0 CHECK (price >= 0),
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  location text,
  fulfilment_hours integer NOT NULL DEFAULT 24,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.parts_listings TO authenticated;
GRANT ALL ON public.parts_listings TO service_role;
ALTER TABLE public.parts_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_read ON public.parts_listings FOR SELECT TO authenticated USING (
  private.is_ops(auth.uid()) OR private.has_org_access(auth.uid(), supplier_org_id)
  OR (active AND private.has_role(auth.uid(),'shop') AND EXISTS (
      SELECT 1 FROM public.organizations o WHERE o.id = supplier_org_id AND o.active AND o.suspended_at IS NULL)));
CREATE POLICY pl_insert ON public.parts_listings FOR INSERT TO authenticated WITH CHECK (
  private.is_ops(auth.uid()) OR (private.has_org_access(auth.uid(), supplier_org_id)
    AND EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = supplier_org_id AND o.org_type='supplier')));
CREATE POLICY pl_update ON public.parts_listings FOR UPDATE TO authenticated
  USING (private.is_ops(auth.uid()) OR private.has_org_access(auth.uid(), supplier_org_id))
  WITH CHECK (private.is_ops(auth.uid()) OR private.has_org_access(auth.uid(), supplier_org_id));
CREATE TRIGGER parts_listings_updated BEFORE UPDATE ON public.parts_listings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== Order states =====
CREATE TABLE public.parts_order_statuses (
  status text PRIMARY KEY, sort_order integer NOT NULL, customer_label text NOT NULL,
  customer_visible boolean NOT NULL DEFAULT false, is_terminal boolean NOT NULL DEFAULT false);
GRANT SELECT ON public.parts_order_statuses TO authenticated;
GRANT ALL ON public.parts_order_statuses TO service_role;
ALTER TABLE public.parts_order_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY pos_read ON public.parts_order_statuses FOR SELECT TO authenticated USING (true);
INSERT INTO public.parts_order_statuses VALUES
 ('Requested',1,'Part ordered',true,false),('Confirmed',2,'Part confirmed by supplier',true,false),
 ('Rejected',3,'Supplier could not supply the part',false,true),('Ready for Pickup',4,'Part ready at supplier',false,false),
 ('Driver Assigned',5,'Driver assigned to collect the part',false,false),('Picked Up',6,'Part collected',false,false),
 ('In Transit',7,'Part on its way',true,false),('Delivered',8,'Part delivered',true,false),
 ('Completed',9,'Part received by the repair team',true,true),('Cancelled',10,'Part order cancelled',false,true),
 ('Return Requested',11,'Part return requested',false,false),('Returned',12,'Part returned',false,true);

CREATE TABLE public.parts_order_transitions (
  from_status text NOT NULL REFERENCES public.parts_order_statuses(status),
  to_status text NOT NULL REFERENCES public.parts_order_statuses(status),
  requires_reason boolean NOT NULL DEFAULT false,
  PRIMARY KEY (from_status, to_status));
GRANT SELECT ON public.parts_order_transitions TO authenticated;
GRANT ALL ON public.parts_order_transitions TO service_role;
ALTER TABLE public.parts_order_transitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY pot_read ON public.parts_order_transitions FOR SELECT TO authenticated USING (true);
INSERT INTO public.parts_order_transitions VALUES
 ('Requested','Confirmed',false),('Requested','Rejected',true),('Requested','Cancelled',true),
 ('Confirmed','Ready for Pickup',false),('Confirmed','Cancelled',true),
 ('Ready for Pickup','Driver Assigned',false),('Ready for Pickup','Picked Up',false),('Ready for Pickup','Cancelled',true),
 ('Driver Assigned','Picked Up',false),('Driver Assigned','Ready for Pickup',true),('Driver Assigned','Cancelled',true),
 ('Picked Up','In Transit',false),('Picked Up','Delivered',false),
 ('In Transit','Delivered',false),
 ('Delivered','Completed',false),('Delivered','Return Requested',true),
 ('Completed','Return Requested',true),
 ('Return Requested','Returned',false),('Return Requested','Completed',true);

-- ===== Orders =====
CREATE TABLE public.parts_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_ref text NOT NULL UNIQUE DEFAULT ('BR-PO-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.parts_order_seq')::text,4,'0')),
  case_id uuid NOT NULL REFERENCES public.cases(id),
  customer_id uuid,
  supplier_org_id uuid NOT NULL REFERENCES public.organizations(id),
  ordering_org_id uuid REFERENCES public.organizations(id),
  listing_id uuid NOT NULL REFERENCES public.parts_listings(id),
  ordered_by uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  requested_snapshot jsonb NOT NULL,
  confirmed_snapshot jsonb,
  unit_price numeric, subtotal numeric, tax numeric, fees numeric, total numeric,
  expected_fulfilment_at timestamptz,
  destination_type text NOT NULL DEFAULT 'repair_shop' CHECK (destination_type IN ('repair_shop','customer','other','collect')),
  destination_address text,
  recipient_name text,
  notes text,
  status text NOT NULL DEFAULT 'Requested' REFERENCES public.parts_order_statuses(status),
  status_reason text,
  exception_note text,
  exception_at timestamptz,
  payout_status text NOT NULL DEFAULT 'Not Due' CHECK (payout_status IN ('Not Due','Pending','Paid','Withheld')),
  confirmed_at timestamptz, ready_at timestamptz, delivered_at timestamptz, completed_at timestamptz, cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX parts_orders_case_idx ON public.parts_orders(case_id);
CREATE INDEX parts_orders_supplier_idx ON public.parts_orders(supplier_org_id);
GRANT SELECT, UPDATE ON public.parts_orders TO authenticated;
GRANT ALL ON public.parts_orders TO service_role;
ALTER TABLE public.parts_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY po_read ON public.parts_orders FOR SELECT TO authenticated USING (
  private.is_ops(auth.uid()) OR private.has_org_access(auth.uid(), supplier_org_id) OR private.shop_case(auth.uid(), case_id));
CREATE POLICY po_ops_update ON public.parts_orders FOR UPDATE TO authenticated
  USING (private.is_ops(auth.uid())) WITH CHECK (private.is_ops(auth.uid()));

CREATE TABLE public.parts_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.parts_orders(id),
  event_type text NOT NULL,
  from_status text, to_status text, reason text,
  actor_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.parts_order_events TO authenticated;
GRANT ALL ON public.parts_order_events TO service_role;
ALTER TABLE public.parts_order_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY poe_read ON public.parts_order_events FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.parts_orders o WHERE o.id = order_id AND (
    private.is_ops(auth.uid()) OR private.has_org_access(auth.uid(), o.supplier_org_id) OR private.shop_case(auth.uid(), o.case_id))));

-- ===== Transport link =====
ALTER TABLE public.transport_jobs ADD COLUMN IF NOT EXISTS parts_order_id uuid REFERENCES public.parts_orders(id);
ALTER TABLE public.transport_jobs DROP CONSTRAINT transport_jobs_job_type_check;
ALTER TABLE public.transport_jobs ADD CONSTRAINT transport_jobs_job_type_check
  CHECK (job_type = ANY (ARRAY['roadside','pickup','delivery','transfer','field_service','parts_delivery']));
CREATE POLICY tj_supplier_read ON public.transport_jobs FOR SELECT TO authenticated USING (
  parts_order_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.parts_orders o WHERE o.id = parts_order_id AND private.has_org_access(auth.uid(), o.supplier_org_id)));

-- ===== Helpers =====
CREATE OR REPLACE FUNCTION public.notify_org(_org_id uuid, _case_id uuid, _event_type text, _title text, _body text, _link text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, case_id, event_type, title, body, link_path)
  SELECT m.user_id, _case_id, _event_type, _title, _body, _link FROM public.organization_members m
  WHERE m.organization_id = _org_id AND m.active;
END $$;

CREATE OR REPLACE FUNCTION public.notify_ops(_case_id uuid, _event_type text, _title text, _body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, case_id, event_type, title, body, link_path)
  SELECT DISTINCT user_id, _case_id, _event_type, _title, _body, '/admin' FROM public.user_roles WHERE role IN ('ops','admin','superadmin');
END $$;

-- ===== Guard trigger (transitions + immutable snapshot) =====
CREATE OR REPLACE FUNCTION public.parts_order_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT customer_id INTO NEW.customer_id FROM public.cases WHERE id = NEW.case_id;
    RETURN NEW;
  END IF;
  IF OLD.confirmed_snapshot IS NOT NULL AND (
       NEW.confirmed_snapshot IS DISTINCT FROM OLD.confirmed_snapshot OR NEW.unit_price IS DISTINCT FROM OLD.unit_price
    OR NEW.subtotal IS DISTINCT FROM OLD.subtotal OR NEW.tax IS DISTINCT FROM OLD.tax OR NEW.fees IS DISTINCT FROM OLD.fees
    OR NEW.total IS DISTINCT FROM OLD.total OR NEW.quantity IS DISTINCT FROM OLD.quantity
    OR NEW.supplier_org_id IS DISTINCT FROM OLD.supplier_org_id OR NEW.listing_id IS DISTINCT FROM OLD.listing_id) THEN
    RAISE EXCEPTION 'Order % has been confirmed; its agreed item, quantity and pricing cannot be changed.', OLD.order_ref USING ERRCODE='check_violation';
  END IF;
  IF NEW.requested_snapshot IS DISTINCT FROM OLD.requested_snapshot OR NEW.case_id IS DISTINCT FROM OLD.case_id THEN
    RAISE EXCEPTION 'The original order request cannot be changed.' USING ERRCODE='check_violation';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT * INTO t FROM public.parts_order_transitions WHERE from_status = OLD.status AND to_status = NEW.status;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A parts order cannot move from % to %.', OLD.status, NEW.status USING ERRCODE='check_violation';
    END IF;
    IF t.requires_reason AND coalesce(btrim(NEW.status_reason),'') = '' THEN
      RAISE EXCEPTION 'A reason is required to move a parts order from % to %.', OLD.status, NEW.status USING ERRCODE='check_violation';
    END IF;
    IF NEW.status = 'Confirmed' AND NEW.confirmed_snapshot IS NULL THEN
      RAISE EXCEPTION 'A supplier confirmation must record the agreed price and fulfilment.' USING ERRCODE='check_violation';
    END IF;
    CASE NEW.status
      WHEN 'Confirmed' THEN NEW.confirmed_at := now();
      WHEN 'Ready for Pickup' THEN NEW.ready_at := coalesce(NEW.ready_at, now());
      WHEN 'Delivered' THEN NEW.delivered_at := now();
      WHEN 'Completed' THEN NEW.completed_at := now(); IF NEW.payout_status = 'Not Due' THEN NEW.payout_status := 'Pending'; END IF;
      WHEN 'Cancelled' THEN NEW.cancelled_at := now();
      WHEN 'Rejected' THEN NEW.cancelled_at := now();
      ELSE NULL;
    END CASE;
  ELSIF NEW.status_reason IS DISTINCT FROM OLD.status_reason AND NEW.exception_note IS NOT DISTINCT FROM OLD.exception_note THEN
    NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER parts_orders_before BEFORE INSERT OR UPDATE ON public.parts_orders FOR EACH ROW EXECUTE FUNCTION public.parts_order_before();

-- ===== Effects trigger =====
CREATE OR REPLACE FUNCTION public.parts_order_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; c record; sup record; part text; open_count int; tj uuid; pickup text; dest text;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = NEW.case_id;
  SELECT * INTO sup FROM public.organizations WHERE id = NEW.supplier_org_id;
  part := coalesce(NEW.requested_snapshot->>'title','Part') || ' ×' || NEW.quantity;

  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT * INTO s FROM public.parts_order_statuses WHERE status = NEW.status;
    INSERT INTO public.parts_order_events (order_id, event_type, from_status, to_status, reason, actor_id)
    VALUES (NEW.id, CASE WHEN TG_OP='INSERT' THEN 'created' ELSE 'status_changed' END,
            CASE WHEN TG_OP='UPDATE' THEN OLD.status END, NEW.status, NEW.status_reason, auth.uid());
    INSERT INTO public.case_events (case_id, event_type, actor_id, customer_visible, title, body)
    VALUES (NEW.case_id, 'parts_' || lower(replace(NEW.status,' ','_')), auth.uid(), s.customer_visible,
            CASE WHEN s.customer_visible THEN s.customer_label ELSE 'Parts order ' || NEW.order_ref || ': ' || NEW.status END,
            CASE WHEN s.customer_visible THEN coalesce(NEW.requested_snapshot->>'title','Part')
                 ELSE part || ' from ' || sup.legal_name || coalesce('. Reason: ' || NEW.status_reason, '') END);
    INSERT INTO public.audit_events (actor_id, action, entity_type, entity_id, case_id, before, after, reason)
    VALUES (auth.uid(), CASE WHEN TG_OP='INSERT' THEN 'parts_order.created' ELSE 'parts_order.status_changed' END,
            'parts_order', NEW.id, NEW.case_id,
            CASE WHEN TG_OP='UPDATE' THEN jsonb_build_object('status', OLD.status) END,
            jsonb_build_object('status', NEW.status, 'order_ref', NEW.order_ref, 'total', NEW.total), NEW.status_reason);

    IF s.customer_visible THEN
      PERFORM public.notify_customer(NEW.customer_id, NEW.case_id, 'parts_status', s.customer_label,
        c.case_ref || ' — ' || coalesce(NEW.requested_snapshot->>'title','part') || '.', '/appointments');
    END IF;
    IF NEW.status IN ('Requested','Cancelled','Return Requested','Completed') THEN
      PERFORM public.notify_org(NEW.supplier_org_id, NEW.case_id, 'parts_order', 'Order ' || NEW.order_ref || ': ' || NEW.status, part || coalesce('. ' || NEW.status_reason,''), '/supplier');
    END IF;
    IF NEW.ordering_org_id IS NOT NULL AND NEW.status IN ('Confirmed','Rejected','Ready for Pickup','Driver Assigned','Picked Up','In Transit','Delivered','Returned','Cancelled') THEN
      PERFORM public.notify_org(NEW.ordering_org_id, NEW.case_id, 'parts_order', 'Order ' || NEW.order_ref || ': ' || NEW.status, part || coalesce('. ' || NEW.status_reason,''), '/shop');
    END IF;
    IF NEW.status IN ('Rejected','Cancelled','Return Requested','Ready for Pickup') THEN
      PERFORM public.notify_ops(NEW.case_id, 'parts_attention', 'Parts order ' || NEW.order_ref || ': ' || NEW.status, part || coalesce('. ' || NEW.status_reason,''));
    END IF;

    -- case sync (never blocks the order)
    BEGIN
      IF TG_OP = 'INSERT' AND c.state = 'In Progress' THEN
        UPDATE public.cases SET state = 'Waiting for Parts', state_change_reason = NULL WHERE id = c.id;
      ELSIF NEW.status IN ('Completed','Cancelled','Rejected','Returned') AND c.state = 'Waiting for Parts' THEN
        SELECT count(*) INTO open_count FROM public.parts_orders
          WHERE case_id = c.id AND id <> NEW.id AND status NOT IN ('Completed','Cancelled','Rejected','Returned');
        IF open_count = 0 AND NEW.status = 'Completed' THEN
          UPDATE public.cases SET state = 'In Progress', state_change_reason = NULL WHERE id = c.id;
        END IF;
      END IF;
    EXCEPTION WHEN others THEN
      INSERT INTO public.case_events (case_id, event_type, actor_id, customer_visible, title, body)
      VALUES (NEW.case_id, 'case_sync_skipped', auth.uid(), false, 'Case state not advanced automatically', SQLERRM);
    END;

    -- auto-create parts delivery when ready
    IF NEW.status = 'Ready for Pickup' AND NEW.destination_type <> 'collect'
       AND NOT EXISTS (SELECT 1 FROM public.transport_jobs WHERE parts_order_id = NEW.id AND status NOT IN ('Cancelled','Failed')) THEN
      pickup := coalesce(NEW.confirmed_snapshot->>'pickup_location', sup.address);
      dest := NEW.destination_address;
      IF dest IS NULL AND NEW.destination_type = 'repair_shop' THEN
        SELECT address INTO dest FROM public.organizations WHERE id = coalesce(NEW.ordering_org_id, c.assigned_org_id);
      END IF;
      INSERT INTO public.transport_jobs (case_id, job_type, parts_order_id, vehicle_summary, pickup_address, pickup_lat, pickup_lng,
        destination_address, contact_name, contact_phone, instructions, requested_by, status)
      VALUES (NEW.case_id, 'parts_delivery', NEW.id, 'Parts ' || NEW.order_ref || ': ' || part, pickup, sup.latitude, sup.longitude,
        dest, sup.legal_name, sup.contact_phone,
        'Collect ' || part || ' from ' || sup.legal_name || '. Deliver to ' || coalesce(NEW.recipient_name, 'the recipient') || '.',
        auth.uid(), 'Requested')
      RETURNING id INTO tj;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.exception_note IS DISTINCT FROM OLD.exception_note AND NEW.exception_note IS NOT NULL THEN
    INSERT INTO public.parts_order_events (order_id, event_type, to_status, reason, actor_id)
    VALUES (NEW.id, 'exception', NEW.status, NEW.exception_note, auth.uid());
    INSERT INTO public.case_events (case_id, event_type, actor_id, customer_visible, title, body)
    VALUES (NEW.case_id, 'parts_exception', auth.uid(), false, 'Parts order ' || NEW.order_ref || ' exception', NEW.exception_note);
    INSERT INTO public.audit_events (actor_id, action, entity_type, entity_id, case_id, reason)
    VALUES (auth.uid(), 'parts_order.exception', 'parts_order', NEW.id, NEW.case_id, NEW.exception_note);
    PERFORM public.notify_ops(NEW.case_id, 'parts_attention', 'Parts order ' || NEW.order_ref || ' needs attention', NEW.exception_note);
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.payout_status IS DISTINCT FROM OLD.payout_status THEN
    INSERT INTO public.audit_events (actor_id, action, entity_type, entity_id, case_id, before, after)
    VALUES (auth.uid(), 'parts_order.payout_status', 'parts_order', NEW.id, NEW.case_id,
            jsonb_build_object('payout_status', OLD.payout_status), jsonb_build_object('payout_status', NEW.payout_status));
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER parts_orders_after AFTER INSERT OR UPDATE ON public.parts_orders FOR EACH ROW EXECUTE FUNCTION public.parts_order_after();

-- ===== Transport → order sync =====
CREATE OR REPLACE FUNCTION public.parts_delivery_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
  IF NEW.parts_order_id IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NULL; END IF;
  SELECT * INTO o FROM public.parts_orders WHERE id = NEW.parts_order_id;
  BEGIN
    IF NEW.status IN ('Assigned','Accepted') AND o.status = 'Ready for Pickup' THEN
      UPDATE public.parts_orders SET status = 'Driver Assigned', status_reason = NULL WHERE id = o.id;
    ELSIF NEW.status = 'Requested' AND o.status = 'Driver Assigned' THEN
      UPDATE public.parts_orders SET status = 'Ready for Pickup', status_reason = coalesce(NEW.status_note,'Driver unassigned') WHERE id = o.id;
    ELSIF NEW.status = 'Picked Up' THEN
      IF o.status = 'Ready for Pickup' THEN UPDATE public.parts_orders SET status = 'Driver Assigned', status_reason = NULL WHERE id = o.id; END IF;
      UPDATE public.parts_orders SET status = 'Picked Up', status_reason = NULL WHERE id = o.id;
    ELSIF NEW.status = 'In Transit' THEN
      UPDATE public.parts_orders SET status = 'In Transit', status_reason = NULL WHERE id = o.id;
    ELSIF NEW.status = 'Delivered' THEN
      UPDATE public.parts_orders SET status = 'Delivered', status_reason = NULL, recipient_name = coalesce(NEW.recipient_name, recipient_name) WHERE id = o.id;
    ELSIF NEW.status IN ('Failed','Cancelled') THEN
      UPDATE public.parts_orders SET exception_note = 'Delivery ' || lower(NEW.status) || ': ' || coalesce(NEW.status_note,'no reason given'), exception_at = now() WHERE id = o.id;
    END IF;
  EXCEPTION WHEN others THEN
    INSERT INTO public.parts_order_events (order_id, event_type, to_status, reason, actor_id)
    VALUES (o.id, 'sync_skipped', o.status, SQLERRM, auth.uid());
  END;
  RETURN NULL;
END $$;
CREATE TRIGGER transport_jobs_parts_sync AFTER UPDATE ON public.transport_jobs FOR EACH ROW EXECUTE FUNCTION public.parts_delivery_sync();

-- label parts deliveries properly in the transport timeline
CREATE OR REPLACE FUNCTION public.transport_after()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c record; label text; kind text; visible boolean;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = NEW.case_id;
  kind := CASE NEW.job_type WHEN 'roadside' THEN 'Roadside assistance' WHEN 'pickup' THEN 'Vehicle pickup'
          WHEN 'delivery' THEN 'Vehicle return' WHEN 'transfer' THEN 'Vehicle transfer'
          WHEN 'parts_delivery' THEN 'Parts delivery' ELSE 'Field service' END;
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT customer_label INTO label FROM public.transport_statuses WHERE status = NEW.status;
    visible := NEW.status NOT IN ('Assigned') AND NEW.job_type <> 'parts_delivery';
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
    IF NEW.job_type = 'parts_delivery' AND NEW.status = 'Failed' THEN
      PERFORM public.notify_ops(NEW.case_id, 'parts_attention', 'Parts delivery failed', NEW.status_note);
    END IF;
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
END $function$;

-- ===== RPCs =====
CREATE OR REPLACE FUNCTION public.place_parts_order(_case_id uuid, _listing_id uuid, _quantity integer,
  _destination_type text, _destination_address text, _recipient_name text, _notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; sup record; c record; ord_org uuid; new_id uuid;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = _case_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Case not found.'; END IF;
  IF NOT (private.is_ops(auth.uid()) OR private.shop_case(auth.uid(), _case_id)) THEN
    RAISE EXCEPTION 'You can only order parts for cases assigned to you.';
  END IF;
  IF c.state IN ('Completed','Cancelled','Declined') THEN RAISE EXCEPTION 'This case is closed.'; END IF;
  SELECT * INTO l FROM public.parts_listings WHERE id = _listing_id;
  IF NOT FOUND OR NOT l.active THEN RAISE EXCEPTION 'This listing is not available.'; END IF;
  SELECT * INTO sup FROM public.organizations WHERE id = l.supplier_org_id;
  IF NOT sup.active OR sup.suspended_at IS NOT NULL OR sup.approval_status IN ('Suspended','Deactivated','Rejected') THEN
    RAISE EXCEPTION 'This supplier is suspended or inactive and cannot receive new orders.';
  END IF;
  IF coalesce(_quantity,0) < 1 THEN RAISE EXCEPTION 'Quantity must be at least 1.'; END IF;
  IF _quantity > l.quantity THEN RAISE EXCEPTION 'Only % available from this supplier.', l.quantity; END IF;
  IF private.shop_case(auth.uid(), _case_id) THEN ord_org := c.assigned_org_id; END IF;
  INSERT INTO public.parts_orders (case_id, supplier_org_id, ordering_org_id, listing_id, ordered_by, quantity,
    requested_snapshot, destination_type, destination_address, recipient_name, notes)
  VALUES (_case_id, l.supplier_org_id, ord_org, l.id, auth.uid(), _quantity,
    to_jsonb(l) || jsonb_build_object('supplier_name', sup.legal_name, 'captured_at', now()),
    coalesce(_destination_type,'repair_shop'), nullif(btrim(_destination_address),''), nullif(btrim(_recipient_name),''), nullif(btrim(_notes),''))
  RETURNING id INTO new_id;
  INSERT INTO public.case_links (case_id, record_type, record_id) VALUES (_case_id, 'parts_order', new_id);
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.supplier_respond_order(_order_id uuid, _accept boolean, _reason text,
  _unit_price numeric, _expected_fulfilment_at timestamptz, _pickup_location text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; l record; rate numeric; fee_rate numeric; sub numeric; tx numeric; fe numeric;
BEGIN
  SELECT * INTO o FROM public.parts_orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
  IF NOT (private.has_org_access(auth.uid(), o.supplier_org_id) OR private.is_ops(auth.uid())) THEN
    RAISE EXCEPTION 'This order is not for your organisation.';
  END IF;
  IF o.status <> 'Requested' THEN RAISE EXCEPTION 'This order has already been answered.'; END IF;
  IF NOT _accept THEN
    UPDATE public.parts_orders SET status = 'Rejected', status_reason = _reason WHERE id = _order_id;
    RETURN;
  END IF;
  SELECT * INTO l FROM public.parts_listings WHERE id = o.listing_id FOR UPDATE;
  IF l.quantity < o.quantity THEN RAISE EXCEPTION 'Only % in stock; reject or update stock first.', l.quantity; END IF;
  IF coalesce(_unit_price, -1) < 0 THEN RAISE EXCEPTION 'Enter the agreed unit price.'; END IF;
  IF _expected_fulfilment_at IS NULL THEN RAISE EXCEPTION 'Enter the expected fulfilment time.'; END IF;
  SELECT value INTO rate FROM public.business_settings WHERE key = 'tax_rate';
  SELECT value INTO fee_rate FROM public.business_settings WHERE key = 'marketplace_fee_rate';
  sub := round(_unit_price * o.quantity, 2);
  tx := round(sub * coalesce(rate,0), 2);
  fe := round(sub * coalesce(fee_rate,0), 2);
  UPDATE public.parts_listings SET quantity = quantity - o.quantity WHERE id = l.id;
  UPDATE public.parts_orders SET
    unit_price = _unit_price, subtotal = sub, tax = tx, fees = fe, total = sub + tx,
    expected_fulfilment_at = _expected_fulfilment_at, status_reason = nullif(btrim(_reason),''),
    confirmed_snapshot = jsonb_build_object(
      'supplier_org_id', o.supplier_org_id, 'supplier_name', o.requested_snapshot->>'supplier_name',
      'listing_id', l.id, 'title', l.title, 'sku', l.sku, 'part_number', l.part_number, 'manufacturer', l.manufacturer,
      'classification', l.classification, 'condition', l.condition, 'fitment', l.fitment,
      'quantity', o.quantity, 'unit_price', _unit_price, 'subtotal', sub, 'tax', tx, 'tax_rate', coalesce(rate,0),
      'fees', fe, 'fee_rate', coalesce(fee_rate,0), 'total', sub + tx,
      'expected_fulfilment_at', _expected_fulfilment_at, 'pickup_location', coalesce(nullif(btrim(_pickup_location),''), l.location),
      'confirmed_by', auth.uid(), 'confirmed_at', now()),
    status = 'Confirmed'
  WHERE id = _order_id;
END $$;

CREATE OR REPLACE FUNCTION public.set_parts_order_status(_order_id uuid, _to_status text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; is_sup boolean; is_shop boolean; is_op boolean;
BEGIN
  SELECT * INTO o FROM public.parts_orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
  is_op := private.is_ops(auth.uid());
  is_sup := private.has_org_access(auth.uid(), o.supplier_org_id);
  is_shop := private.shop_case(auth.uid(), o.case_id);
  IF NOT (is_op
     OR (is_sup AND (_to_status IN ('Ready for Pickup','Returned') OR (_to_status = 'Cancelled' AND o.status IN ('Confirmed','Ready for Pickup')) OR (_to_status = 'Picked Up' AND o.destination_type = 'collect')))
     OR (is_shop AND (_to_status IN ('Completed','Return Requested') OR (_to_status = 'Cancelled' AND o.status IN ('Requested','Confirmed')) OR (_to_status = 'Delivered' AND o.destination_type = 'collect' AND o.status = 'Picked Up')))) THEN
    RAISE EXCEPTION 'You are not permitted to move this order to %.', _to_status;
  END IF;
  IF _to_status = 'Returned' THEN
    UPDATE public.parts_listings SET quantity = quantity + o.quantity WHERE id = o.listing_id;
  ELSIF _to_status = 'Cancelled' AND o.confirmed_snapshot IS NOT NULL THEN
    UPDATE public.parts_listings SET quantity = quantity + o.quantity WHERE id = o.listing_id;
  END IF;
  UPDATE public.parts_orders SET status = _to_status, status_reason = nullif(btrim(_reason),'') WHERE id = _order_id;
  IF _to_status = 'Cancelled' THEN
    UPDATE public.transport_jobs SET status = 'Cancelled', status_note = 'Parts order cancelled: ' || coalesce(_reason,'')
     WHERE parts_order_id = _order_id AND status IN ('Requested','Assigned','Accepted');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.flag_parts_order_exception(_order_id uuid, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
  SELECT * INTO o FROM public.parts_orders WHERE id = _order_id;
  IF NOT (private.is_ops(auth.uid()) OR private.has_org_access(auth.uid(), o.supplier_org_id) OR private.shop_case(auth.uid(), o.case_id)) THEN
    RAISE EXCEPTION 'Not permitted.';
  END IF;
  IF coalesce(btrim(_note),'') = '' THEN RAISE EXCEPTION 'Describe the exception.'; END IF;
  UPDATE public.parts_orders SET exception_note = _note, exception_at = now() WHERE id = _order_id;
END $$;

CREATE OR REPLACE FUNCTION public.clear_parts_order_exception(_order_id uuid, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.is_ops(auth.uid()) THEN RAISE EXCEPTION 'Only operations can resolve exceptions.'; END IF;
  IF coalesce(btrim(_note),'') = '' THEN RAISE EXCEPTION 'Give a resolution note.'; END IF;
  INSERT INTO public.parts_order_events (order_id, event_type, reason, actor_id) VALUES (_order_id, 'exception_resolved', _note, auth.uid());
  INSERT INTO public.audit_events (actor_id, action, entity_type, entity_id, case_id, reason)
  SELECT auth.uid(), 'parts_order.exception_resolved', 'parts_order', id, case_id, _note FROM public.parts_orders WHERE id = _order_id;
  UPDATE public.parts_orders SET exception_note = NULL, exception_at = NULL WHERE id = _order_id;
END $$;

-- execute rights
REVOKE ALL ON FUNCTION public.notify_org(uuid,uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_ops(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parts_order_before() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parts_order_after() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parts_delivery_sync() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transport_after() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.place_parts_order(uuid,uuid,integer,text,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supplier_respond_order(uuid,boolean,text,numeric,timestamptz,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_parts_order_status(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.flag_parts_order_exception(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clear_parts_order_exception(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_parts_order(uuid,uuid,integer,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_respond_order(uuid,boolean,text,numeric,timestamptz,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_parts_order_status(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flag_parts_order_exception(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_parts_order_exception(uuid,text) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.parts_orders;