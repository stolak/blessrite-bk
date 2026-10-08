
-- ============ CUS: profile preferences ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_contact text NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_sms boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preferred_contact_time text;

-- ============ BKG: booking enhancements ============
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS special_instructions text,
  ADD COLUMN IF NOT EXISTS unsure_service boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by_staff_id uuid REFERENCES auth.users(id);

-- ============ shared internal notes (never customer readable) ============
CREATE TABLE IF NOT EXISTS public.internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES public.cases(id) ON DELETE CASCADE,
  record_type text NOT NULL,
  record_id uuid,
  body text NOT NULL,
  author_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.internal_notes TO authenticated;
GRANT ALL ON public.internal_notes TO service_role;
ALTER TABLE public.internal_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY internal_notes_ops_select ON public.internal_notes FOR SELECT TO authenticated
  USING (private.is_ops(auth.uid()));
CREATE POLICY internal_notes_ops_insert ON public.internal_notes FOR INSERT TO authenticated
  WITH CHECK (private.is_ops(auth.uid()) AND author_id = auth.uid());
CREATE POLICY internal_notes_ops_update ON public.internal_notes FOR UPDATE TO authenticated
  USING (private.is_ops(auth.uid())) WITH CHECK (private.is_ops(auth.uid()));

-- ============ INS: inspections ============
CREATE TABLE IF NOT EXISTS public.inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id),
  vehicle_id uuid REFERENCES public.vehicles(id),
  customer_id uuid REFERENCES auth.users(id),
  technician_id uuid REFERENCES auth.users(id),
  title text NOT NULL DEFAULT 'Inspection & diagnostic report',
  customer_concern text,
  findings text,
  trouble_codes text[] NOT NULL DEFAULT '{}',
  tests_performed text,
  recommendations text,
  parts_required text,
  labour_hours numeric NOT NULL DEFAULT 0,
  final_result text,
  mileage integer,
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Published')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inspections_case_idx ON public.inspections(case_id);
CREATE INDEX IF NOT EXISTS inspections_vehicle_idx ON public.inspections(vehicle_id);
GRANT SELECT, INSERT, UPDATE ON public.inspections TO authenticated;
GRANT ALL ON public.inspections TO service_role;
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY inspections_select ON public.inspections FOR SELECT TO authenticated
  USING (private.is_ops(auth.uid()) OR (status = 'Published' AND customer_id = auth.uid()));
CREATE POLICY inspections_insert ON public.inspections FOR INSERT TO authenticated
  WITH CHECK (private.is_ops(auth.uid()));
CREATE POLICY inspections_update ON public.inspections FOR UPDATE TO authenticated
  USING (private.is_ops(auth.uid())) WITH CHECK (private.is_ops(auth.uid()));
CREATE TRIGGER inspections_updated BEFORE UPDATE ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ media attachments ============
CREATE TABLE IF NOT EXISTS public.case_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES public.cases(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id),
  vehicle_id uuid REFERENCES public.vehicles(id),
  inspection_id uuid REFERENCES public.inspections(id) ON DELETE CASCADE,
  estimate_id uuid REFERENCES public.estimates(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES auth.users(id),
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  kind text NOT NULL DEFAULT 'photo' CHECK (kind IN ('photo','video','document')),
  caption text,
  customer_visible boolean NOT NULL DEFAULT true,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS case_media_case_idx ON public.case_media(case_id);
CREATE INDEX IF NOT EXISTS case_media_inspection_idx ON public.case_media(inspection_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_media TO authenticated;
GRANT ALL ON public.case_media TO service_role;
ALTER TABLE public.case_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY case_media_select ON public.case_media FOR SELECT TO authenticated
  USING (private.is_ops(auth.uid()) OR (customer_visible AND owner_id = auth.uid()));
CREATE POLICY case_media_insert ON public.case_media FOR INSERT TO authenticated
  WITH CHECK (private.is_ops(auth.uid()) OR (uploaded_by = auth.uid() AND owner_id = auth.uid()));
CREATE POLICY case_media_update ON public.case_media FOR UPDATE TO authenticated
  USING (private.is_ops(auth.uid())) WITH CHECK (private.is_ops(auth.uid()));
CREATE POLICY case_media_delete ON public.case_media FOR DELETE TO authenticated
  USING (private.is_ops(auth.uid()) OR uploaded_by = auth.uid());

-- ============ EST: versioned estimates ============
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_estimate_id uuid REFERENCES public.estimates(id),
  ADD COLUMN IF NOT EXISTS estimate_kind text NOT NULL DEFAULT 'initial',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Draft',
  ADD COLUMN IF NOT EXISTS inspection_id uuid REFERENCES public.inspections(id),
  ADD COLUMN IF NOT EXISTS other_charges numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS decided_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS decision_is_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.vehicles(id);

UPDATE public.estimates SET status = CASE
  WHEN decision = 'Approved' THEN 'Approved'
  WHEN decision = 'Declined' THEN 'Declined'
  ELSE 'Sent' END,
  sent_at = COALESCE(sent_at, created_at),
  subtotal = COALESCE(NULLIF(subtotal,0), parts_cost + labour_cost)
WHERE status = 'Draft';

CREATE TABLE IF NOT EXISTS public.estimate_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'Parts' CHECK (kind IN ('Parts','Labour','Fee','Other')),
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS estimate_items_estimate_idx ON public.estimate_items(estimate_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.estimate_items TO authenticated;
GRANT ALL ON public.estimate_items TO service_role;
ALTER TABLE public.estimate_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY estimate_items_select ON public.estimate_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.estimates e WHERE e.id = estimate_items.estimate_id
                 AND (e.user_id = auth.uid() OR private.is_staff(auth.uid()))));
CREATE POLICY estimate_items_write ON public.estimate_items FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY estimate_items_update ON public.estimate_items FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY estimate_items_delete ON public.estimate_items FOR DELETE TO authenticated
  USING (private.is_staff(auth.uid()));

CREATE TABLE IF NOT EXISTS public.estimate_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  case_id uuid REFERENCES public.cases(id),
  estimate_version integer NOT NULL,
  decision text NOT NULL CHECK (decision IN ('Approved','Declined')),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  actor_role text NOT NULL,
  is_override boolean NOT NULL DEFAULT false,
  reason text,
  decided_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS estimate_approvals_estimate_idx ON public.estimate_approvals(estimate_id);
GRANT SELECT, INSERT ON public.estimate_approvals TO authenticated;
GRANT ALL ON public.estimate_approvals TO service_role;
ALTER TABLE public.estimate_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY estimate_approvals_select ON public.estimate_approvals FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.estimates e WHERE e.id = estimate_approvals.estimate_id
                 AND (e.user_id = auth.uid() OR private.is_staff(auth.uid()))));
CREATE POLICY estimate_approvals_insert ON public.estimate_approvals FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid() AND (
      (is_override = false AND EXISTS (SELECT 1 FROM public.estimates e
        WHERE e.id = estimate_approvals.estimate_id AND e.user_id = auth.uid()))
      OR (is_override = true AND private.is_staff(auth.uid()))
    )
  );

-- recalc estimate totals from line items
CREATE OR REPLACE FUNCTION public.recalc_estimate_totals() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE est uuid; p numeric; l numeric; o numeric; rate numeric;
BEGIN
  est := COALESCE(NEW.estimate_id, OLD.estimate_id);
  SELECT COALESCE(SUM(amount) FILTER (WHERE kind = 'Parts'),0),
         COALESCE(SUM(amount) FILTER (WHERE kind = 'Labour'),0),
         COALESCE(SUM(amount) FILTER (WHERE kind IN ('Fee','Other')),0)
    INTO p, l, o FROM public.estimate_items WHERE estimate_id = est;
  SELECT value INTO rate FROM public.business_settings WHERE key = 'tax_rate';
  UPDATE public.estimates
     SET parts_cost = p, labour_cost = l, other_charges = o,
         subtotal = p + l + o,
         tax = round((p + l + o) * COALESCE(rate,0), 2),
         total = round((p + l + o) * (1 + COALESCE(rate,0)), 2)
   WHERE id = est;
  RETURN NULL;
END; $$;
REVOKE EXECUTE ON FUNCTION public.recalc_estimate_totals() FROM anon, authenticated;
CREATE TRIGGER estimate_items_totals AFTER INSERT OR UPDATE OR DELETE ON public.estimate_items
  FOR EACH ROW EXECUTE FUNCTION public.recalc_estimate_totals();

-- EST-005: a sent estimate version can never be rewritten
CREATE OR REPLACE FUNCTION public.protect_estimate_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status <> 'Draft' THEN
    IF NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.parts_cost IS DISTINCT FROM OLD.parts_cost
       OR NEW.labour_cost IS DISTINCT FROM OLD.labour_cost
       OR NEW.other_charges IS DISTINCT FROM OLD.other_charges
       OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.tax IS DISTINCT FROM OLD.tax
       OR NEW.total IS DISTINCT FROM OLD.total
       OR NEW.version IS DISTINCT FROM OLD.version THEN
      RAISE EXCEPTION 'Estimate version % has already been issued and cannot be changed. Create a revised estimate instead.', OLD.version
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.decision IN ('Approved','Declined') AND NEW.decision IS DISTINCT FROM OLD.decision THEN
      RAISE EXCEPTION 'A recorded customer decision cannot be altered.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.protect_estimate_version() FROM anon, authenticated;
CREATE TRIGGER estimates_protect_version BEFORE UPDATE ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.protect_estimate_version();

-- ============ COM: notifications ============
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  case_id uuid REFERENCES public.cases(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  title text NOT NULL,
  body text,
  link_path text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications(user_id, read_at);
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_ops(auth.uid()));
CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (private.is_ops(auth.uid()));
CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_customer(
  _user_id uuid, _case_id uuid, _event_type text, _title text, _body text, _link text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications (user_id, case_id, event_type, title, body, link_path)
  VALUES (_user_id, _case_id, _event_type, _title, _body, _link);
END; $$;
REVOKE EXECUTE ON FUNCTION public.notify_customer(uuid,uuid,text,text,text,text) FROM anon, authenticated;

-- ============ service history ============
CREATE TABLE IF NOT EXISTS public.service_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  case_id uuid REFERENCES public.cases(id),
  case_ref text,
  booking_id uuid REFERENCES public.bookings(id),
  inspection_id uuid REFERENCES public.inspections(id),
  invoice_id uuid REFERENCES public.invoices(id),
  service_date date NOT NULL DEFAULT current_date,
  mileage integer,
  service_summary text NOT NULL,
  findings text,
  work_performed text,
  parts_replaced text,
  recommendations text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_history_vehicle_idx ON public.service_history(vehicle_id);
CREATE UNIQUE INDEX IF NOT EXISTS service_history_case_unique ON public.service_history(case_id);
GRANT SELECT, INSERT, UPDATE ON public.service_history TO authenticated;
GRANT ALL ON public.service_history TO service_role;
ALTER TABLE public.service_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_history_select ON public.service_history FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR private.is_ops(auth.uid()));
CREATE POLICY service_history_insert ON public.service_history FOR INSERT TO authenticated
  WITH CHECK (private.is_ops(auth.uid()));
CREATE POLICY service_history_update ON public.service_history FOR UPDATE TO authenticated
  USING (private.is_ops(auth.uid())) WITH CHECK (private.is_ops(auth.uid()));

-- ============ approval gate + completion history + notifications on cases ============
CREATE OR REPLACE FUNCTION public.guard_case_approval() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pending int;
BEGIN
  IF NEW.state IS DISTINCT FROM OLD.state
     AND NEW.state IN ('In Progress','Waiting for Parts','Ready','Return in Progress','Completed') THEN
    SELECT count(*) INTO pending FROM public.estimates
      WHERE case_id = NEW.id AND status = 'Sent' AND decision = 'Pending';
    IF pending > 0 THEN
      RAISE EXCEPTION 'Case % has % estimate(s) awaiting customer authorisation. Chargeable work cannot proceed.', OLD.case_ref, pending
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.guard_case_approval() FROM anon, authenticated;
CREATE TRIGGER cases_guard_approval BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.guard_case_approval();

CREATE OR REPLACE FUNCTION public.case_completion_effects() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ins record; bk record; inv_id uuid; label text;
BEGIN
  IF NEW.state IS DISTINCT FROM OLD.state THEN
    SELECT customer_label INTO label FROM public.case_states WHERE state = NEW.state;
    PERFORM public.notify_customer(NEW.customer_id, NEW.id, 'case_status',
      'Service update: ' || COALESCE(label, NEW.state),
      NEW.case_ref || ' is now ' || lower(COALESCE(label, NEW.state)) || '.', '/appointments');

    IF NEW.state = 'Completed' THEN
      SELECT * INTO ins FROM public.inspections
        WHERE case_id = NEW.id AND status = 'Published' ORDER BY published_at DESC LIMIT 1;
      SELECT * INTO bk FROM public.bookings WHERE case_id = NEW.id ORDER BY created_at LIMIT 1;
      SELECT id INTO inv_id FROM public.invoices WHERE case_id = NEW.id ORDER BY created_at DESC LIMIT 1;

      INSERT INTO public.service_history (
        vehicle_id, customer_id, case_id, case_ref, booking_id, inspection_id, invoice_id,
        service_date, mileage, service_summary, findings, work_performed, parts_replaced, recommendations)
      VALUES (
        COALESCE(NEW.vehicle_id, bk.vehicle_id), NEW.customer_id, NEW.id, NEW.case_ref, bk.id, ins.id, inv_id,
        current_date, ins.mileage, NEW.service_summary, ins.findings, ins.final_result,
        ins.parts_required, ins.recommendations)
      ON CONFLICT (case_id) DO NOTHING;

      PERFORM public.notify_customer(NEW.customer_id, NEW.id, 'service_completed',
        'Service completed', NEW.case_ref || ' is complete and has been added to your vehicle service history.',
        '/appointments');
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.case_completion_effects() FROM anon, authenticated;
CREATE TRIGGER cases_completion_effects AFTER UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.case_completion_effects();

-- inspection published -> customer event + notification
CREATE OR REPLACE FUNCTION public.inspection_published_effects() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'Published' AND OLD.status IS DISTINCT FROM 'Published' THEN
    NEW.published_at := COALESCE(NEW.published_at, now());
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.inspection_published_effects() FROM anon, authenticated;
CREATE TRIGGER inspections_publish BEFORE UPDATE ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.inspection_published_effects();

CREATE OR REPLACE FUNCTION public.inspection_published_after() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'Published' AND OLD.status IS DISTINCT FROM 'Published' THEN
    INSERT INTO public.case_events (case_id, event_type, actor_id, customer_visible, title, body)
    VALUES (NEW.case_id, 'inspection_published', auth.uid(), true, 'Inspection report ready',
            'Your digital inspection and diagnostic report is available to view.');
    INSERT INTO public.audit_events (actor_id, action, entity_type, entity_id, case_id, after)
    VALUES (auth.uid(), 'inspection.published', 'inspection', NEW.id, NEW.case_id, to_jsonb(NEW));
    PERFORM public.notify_customer(NEW.customer_id, NEW.case_id, 'inspection_completed',
      'Inspection completed', 'Your inspection report is ready to read.', '/appointments');
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.inspection_published_after() FROM anon, authenticated;
CREATE TRIGGER inspections_publish_after AFTER UPDATE ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.inspection_published_after();

-- estimate sent -> approval required event + notification
CREATE OR REPLACE FUNCTION public.estimate_sent_effects() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE kind_label text;
BEGIN
  IF NEW.status = 'Sent' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'Sent') THEN
    kind_label := CASE NEW.estimate_kind WHEN 'additional' THEN 'Additional work estimate'
                                         WHEN 'revised' THEN 'Revised estimate'
                                         ELSE 'Estimate' END;
    UPDATE public.estimates SET sent_at = COALESCE(sent_at, now()) WHERE id = NEW.id AND sent_at IS NULL;
    IF NEW.case_id IS NOT NULL THEN
      INSERT INTO public.case_events (case_id, event_type, actor_id, customer_visible, title, body)
      VALUES (NEW.case_id, 'estimate_sent', auth.uid(), true, kind_label || ' v' || NEW.version || ' ready',
              'Please review and approve or decline this estimate.');
      INSERT INTO public.audit_events (actor_id, action, entity_type, entity_id, case_id, after)
      VALUES (auth.uid(), 'estimate.sent', 'estimate', NEW.id, NEW.case_id, to_jsonb(NEW));
    END IF;
    PERFORM public.notify_customer(NEW.user_id, NEW.case_id, 'approval_required',
      kind_label || ' awaiting your approval',
      NEW.title || ' — version ' || NEW.version || '. Your approval is required before work proceeds.',
      '/appointments');
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.estimate_sent_effects() FROM anon, authenticated;
CREATE TRIGGER estimates_sent_effects AFTER INSERT OR UPDATE ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.estimate_sent_effects();

-- approval recorded -> apply to estimate, log, notify
CREATE OR REPLACE FUNCTION public.apply_estimate_approval() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE est record;
BEGIN
  SELECT * INTO est FROM public.estimates WHERE id = NEW.estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estimate not found'; END IF;
  IF NEW.estimate_version <> est.version THEN
    RAISE EXCEPTION 'Decision refers to estimate version %, but the current version is %.', NEW.estimate_version, est.version
      USING ERRCODE = 'check_violation';
  END IF;
  IF est.decision <> 'Pending' THEN
    RAISE EXCEPTION 'A decision has already been recorded for this estimate version.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.is_override AND coalesce(btrim(NEW.reason),'') = '' THEN
    RAISE EXCEPTION 'An administrative override requires a reason.' USING ERRCODE = 'check_violation';
  END IF;
  NEW.case_id := COALESCE(NEW.case_id, est.case_id);
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.apply_estimate_approval() FROM anon, authenticated;
CREATE TRIGGER estimate_approvals_validate BEFORE INSERT ON public.estimate_approvals
  FOR EACH ROW EXECUTE FUNCTION public.apply_estimate_approval();

CREATE OR REPLACE FUNCTION public.after_estimate_approval() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE est record; who text;
BEGIN
  SELECT * INTO est FROM public.estimates WHERE id = NEW.estimate_id;
  UPDATE public.estimates
     SET decision = NEW.decision, status = NEW.decision, decided_at = NEW.decided_at,
         decided_by = NEW.actor_id, decision_is_override = NEW.is_override
   WHERE id = NEW.estimate_id;

  who := CASE WHEN NEW.is_override THEN 'Recorded by BlessRite staff on the customer''s behalf (override)'
              ELSE 'Recorded by the customer' END;

  IF NEW.case_id IS NOT NULL THEN
    INSERT INTO public.case_events (case_id, event_type, actor_id, customer_visible, title, body)
    VALUES (NEW.case_id, 'estimate_' || lower(NEW.decision), NEW.actor_id, true,
            'Estimate v' || NEW.estimate_version || ' ' || lower(NEW.decision),
            who || COALESCE('. Reason: ' || NEW.reason, '') || '.');
    INSERT INTO public.audit_events (actor_id, action, entity_type, entity_id, case_id, before, after, reason)
    VALUES (NEW.actor_id, CASE WHEN NEW.is_override THEN 'estimate.decision_override' ELSE 'estimate.decision' END,
            'estimate', NEW.estimate_id, NEW.case_id,
            jsonb_build_object('decision', est.decision, 'version', est.version),
            jsonb_build_object('decision', NEW.decision, 'version', NEW.estimate_version,
                               'actor_role', NEW.actor_role, 'is_override', NEW.is_override),
            NEW.reason);
  END IF;

  PERFORM public.notify_customer(est.user_id, NEW.case_id, 'approval_confirmation',
    'Estimate ' || lower(NEW.decision),
    'Version ' || NEW.estimate_version || ' of "' || est.title || '" was ' || lower(NEW.decision) || '. ' || who || '.',
    '/appointments');
  RETURN NULL;
END; $$;
REVOKE EXECUTE ON FUNCTION public.after_estimate_approval() FROM anon, authenticated;
CREATE TRIGGER estimate_approvals_apply AFTER INSERT ON public.estimate_approvals
  FOR EACH ROW EXECUTE FUNCTION public.after_estimate_approval();
