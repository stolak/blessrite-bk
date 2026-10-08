-- ================= helpers =================
CREATE OR REPLACE FUNCTION private.is_finance(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','superadmin'))
$$;
GRANT EXECUTE ON FUNCTION private.is_finance(uuid) TO authenticated;

-- ================= configuration =================
CREATE TABLE public.config_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  label text NOT NULL,
  unit text,
  value numeric,
  value_text text,
  previous_value numeric,
  previous_text text,
  effective_from timestamptz NOT NULL DEFAULT now(),
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX config_settings_key_idx ON public.config_settings(key, effective_from DESC);
GRANT SELECT ON public.config_settings TO authenticated;
GRANT ALL ON public.config_settings TO service_role;
ALTER TABLE public.config_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY cfg_read ON public.config_settings FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.config_value(_key text, _at timestamptz DEFAULT now()) RETURNS numeric
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT value FROM public.config_settings WHERE key = _key AND effective_from <= _at ORDER BY effective_from DESC, created_at DESC LIMIT 1
$$;

INSERT INTO public.config_settings (key, category, label, unit, value, value_text, reason) VALUES
 ('tax_rate','taxes','Tax rate (GST + PST)','rate',0.12,NULL,'Initial value carried over'),
 ('labour_hourly_rate','pricing','Labour rate per hour','CAD',120,NULL,'Initial value carried over'),
 ('roadside_base_fee','pricing','Roadside base fee','CAD',95,NULL,'Initial placeholder — confirm'),
 ('distance_rate_per_km','pricing','Distance charge per km','CAD',2.5,NULL,'Initial placeholder — confirm'),
 ('after_hours_surcharge','pricing','After-hours surcharge','CAD',50,NULL,'Initial placeholder — confirm'),
 ('transport_base_fee','pricing','Vehicle transport base fee','CAD',59,NULL,'Initial placeholder — confirm'),
 ('parts_delivery_fee','pricing','Parts delivery fee','CAD',35,NULL,'Initial placeholder — confirm'),
 ('shop_commission_rate','fees','Repair-shop commission','rate',0.10,NULL,'Initial placeholder — confirm'),
 ('marketplace_fee_rate','fees','Parts marketplace fee','rate',0.05,NULL,'Initial value carried over'),
 ('driver_rate_per_job','fees','Driver earnings per completed job','CAD',25,NULL,'Initial placeholder — confirm'),
 ('cancellation_window_hours','rules','Free cancellation window','hours',24,NULL,'Initial placeholder — confirm'),
 ('refund_window_days','rules','Refund window','days',30,NULL,'Initial placeholder — confirm'),
 ('payout_hold_days','rules','Payout hold after completion','days',7,NULL,'Initial placeholder — confirm'),
 ('evidence_photos_required','rules','Photos required at pickup/delivery (1 = yes)','flag',1,NULL,'Initial placeholder — confirm'),
 ('service_area','areas','Service area',NULL,NULL,'Winnipeg and surrounding Manitoba','Initial placeholder — confirm'),
 ('operating_hours','areas','Operating hours',NULL,NULL,'Mon–Fri 8:00–18:00, Sat 9:00–14:00; roadside 24/7','Initial placeholder — confirm'),
 ('cancellation_policy','rules','Cancellation rule',NULL,NULL,'Free cancellation until the window above; after that the call-out fee applies.','Initial placeholder — confirm'),
 ('refund_policy','rules','Refund rule',NULL,NULL,'Refunds within the refund window, approved by an admin.','Initial placeholder — confirm'),
 ('payout_rule','rules','Payout rule',NULL,NULL,'Partner obligations are approved weekly after the hold period and paid manually.','Initial placeholder — confirm'),
 ('workflow_auto_invoice_routine','workflow','Auto-invoice routine services (1 = on)','flag',1,NULL,'Current behaviour');

-- keep the legacy settings table in step
CREATE OR REPLACE FUNCTION public.apply_due_config() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.business_settings b SET value = public.config_value(b.key)
   WHERE public.config_value(b.key) IS NOT NULL AND b.value IS DISTINCT FROM public.config_value(b.key);
END $$;

CREATE OR REPLACE FUNCTION public.set_config(_key text, _value numeric, _value_text text, _effective_from timestamptz, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur record;
BEGIN
  IF NOT private.is_finance(auth.uid()) THEN RAISE EXCEPTION 'Only an Admin can change configuration.'; END IF;
  SELECT * INTO cur FROM public.config_settings WHERE key = _key ORDER BY effective_from DESC, created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown setting %.', _key; END IF;
  IF _value IS NOT NULL AND _value < 0 THEN RAISE EXCEPTION 'Values cannot be negative.'; END IF;
  INSERT INTO public.config_settings (key, category, label, unit, value, value_text, previous_value, previous_text, effective_from, reason, created_by)
  VALUES (_key, cur.category, cur.label, cur.unit, _value, _value_text, cur.value, cur.value_text, coalesce(_effective_from, now()), nullif(btrim(_reason),''), auth.uid());
  INSERT INTO public.audit_events (actor_id, action, entity_type, before, after, reason)
  VALUES (auth.uid(), 'config.changed', 'config',
          jsonb_build_object('key', _key, 'value', cur.value, 'text', cur.value_text),
          jsonb_build_object('key', _key, 'value', _value, 'text', _value_text, 'effective_from', coalesce(_effective_from, now())), _reason);
  PERFORM public.apply_due_config();
END $$;

-- tax now read from effective-dated config
CREATE OR REPLACE FUNCTION public.recalc_invoice_totals()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE inv uuid; sub numeric; rate numeric;
BEGIN
  inv := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT COALESCE(SUM(amount),0) INTO sub FROM public.invoice_items WHERE invoice_id = inv;
  rate := public.config_value('tax_rate', now());
  UPDATE public.invoices SET subtotal = sub, tax = round(sub * COALESCE(rate,0), 2), total = round(sub * (1 + COALESCE(rate,0)), 2),
         tax_rate_applied = COALESCE(rate,0) WHERE id = inv;
  RETURN NULL;
END; $function$;

CREATE OR REPLACE FUNCTION public.recalc_estimate_totals()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE est uuid; p numeric; l numeric; o numeric; rate numeric;
BEGIN
  est := COALESCE(NEW.estimate_id, OLD.estimate_id);
  SELECT COALESCE(SUM(amount) FILTER (WHERE kind = 'Parts'),0), COALESCE(SUM(amount) FILTER (WHERE kind = 'Labour'),0),
         COALESCE(SUM(amount) FILTER (WHERE kind IN ('Fee','Other')),0) INTO p, l, o FROM public.estimate_items WHERE estimate_id = est;
  rate := public.config_value('tax_rate', now());
  UPDATE public.estimates SET parts_cost = p, labour_cost = l, other_charges = o, subtotal = p + l + o,
         tax = round((p + l + o) * COALESCE(rate,0), 2), total = round((p + l + o) * (1 + COALESCE(rate,0)), 2) WHERE id = est;
  RETURN NULL;
END; $function$;

-- ================= invoices: payment tracking =================
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_refunded numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjustments_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_due numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'Unpaid',
  ADD COLUMN IF NOT EXISTS tax_rate_applied numeric;
UPDATE public.invoices SET balance_due = CASE WHEN status = 'Paid' THEN 0 ELSE total END,
  payment_status = CASE WHEN status = 'Paid' THEN 'Paid' ELSE 'Unpaid' END,
  tax_rate_applied = CASE WHEN subtotal > 0 THEN round(tax / subtotal, 4) END;

-- paid / part-paid invoices keep their lines and rate
CREATE OR REPLACE FUNCTION public.protect_paid_invoice_items() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE st text; ps text;
BEGIN
  SELECT status, payment_status INTO st, ps FROM public.invoices WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF st IN ('Paid','Void') OR ps <> 'Unpaid' THEN
    RAISE EXCEPTION 'This invoice has payments recorded or is closed; use an adjustment instead of editing lines.' USING ERRCODE='check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER invoice_items_protect_paid BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION public.protect_paid_invoice_items();

-- ================= payments / refunds / adjustments =================
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id),
  case_id uuid REFERENCES public.cases(id),
  customer_id uuid,
  amount numeric NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('Card terminal','Cash','E-transfer','Cheque','Online','Other')),
  status text NOT NULL CHECK (status IN ('Pending','Authorized','Paid','Failed','Reversed')),
  reference text,
  provider_fee numeric NOT NULL DEFAULT 0,
  failure_reason text,
  received_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY pay_read ON public.payments FOR SELECT TO authenticated USING (private.is_finance(auth.uid()) OR private.is_ops(auth.uid()) OR customer_id = auth.uid());

CREATE TABLE public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id),
  case_id uuid, customer_id uuid,
  amount numeric NOT NULL CHECK (amount > 0),
  reason text NOT NULL, reference text,
  actor_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.refunds TO authenticated;
GRANT ALL ON public.refunds TO service_role;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY ref_read ON public.refunds FOR SELECT TO authenticated USING (private.is_finance(auth.uid()) OR private.is_ops(auth.uid()) OR customer_id = auth.uid());

CREATE TABLE public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_type text NOT NULL CHECK (beneficiary_type IN ('shop','supplier','driver','transport')),
  org_id uuid REFERENCES public.organizations(id),
  beneficiary_user_id uuid,
  case_id uuid REFERENCES public.cases(id),
  source_type text NOT NULL CHECK (source_type IN ('invoice','parts_order','transport_job')),
  source_id uuid NOT NULL,
  gross numeric NOT NULL DEFAULT 0, fees numeric NOT NULL DEFAULT 0, taxes numeric NOT NULL DEFAULT 0,
  adjustments numeric NOT NULL DEFAULT 0, net numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Payout Pending' CHECK (status IN ('Payout Pending','On Hold','Payout Approved','Payout Completed','Payout Failed','Reversed')),
  status_reason text,
  rule_snapshot jsonb,
  approved_by uuid, approved_at timestamptz,
  completed_by uuid, completed_at timestamptz, paid_on date, method text, reference text, evidence_path text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id, beneficiary_type)
);
GRANT SELECT ON public.payouts TO authenticated;
GRANT ALL ON public.payouts TO service_role;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY payout_read ON public.payouts FOR SELECT TO authenticated USING (
  private.is_finance(auth.uid()) OR beneficiary_user_id = auth.uid() OR (org_id IS NOT NULL AND private.has_org_access(auth.uid(), org_id)));

CREATE TABLE public.adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target text NOT NULL CHECK (target IN ('invoice','payout')),
  invoice_id uuid REFERENCES public.invoices(id),
  payout_id uuid REFERENCES public.payouts(id),
  case_id uuid, customer_id uuid,
  amount numeric NOT NULL CHECK (amount <> 0),
  reason text NOT NULL, reference text,
  actor_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.adjustments TO authenticated;
GRANT ALL ON public.adjustments TO service_role;
ALTER TABLE public.adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY adj_read ON public.adjustments FOR SELECT TO authenticated USING (
  private.is_finance(auth.uid()) OR (target = 'invoice' AND customer_id = auth.uid()));

CREATE TABLE public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type text NOT NULL CHECK (entry_type IN ('customer_charge','payment','payment_reversal','service_revenue','roadside_revenue','transport_revenue',
    'shop_charge','shop_commission','parts_purchase','marketplace_fee','parts_delivery_revenue','driver_earning',
    'shop_payout_obligation','supplier_payout_obligation','driver_payout_obligation','transport_payout_obligation',
    'tax','refund','adjustment','provider_fee','payout_completed','payout_reversal')),
  amount numeric NOT NULL,
  description text,
  case_id uuid, customer_id uuid, vehicle_id uuid, invoice_id uuid, payment_id uuid, refund_id uuid, adjustment_id uuid,
  booking_id uuid, parts_order_id uuid, transport_job_id uuid, org_id uuid, beneficiary_user_id uuid, payout_id uuid,
  reverses_entry_id uuid REFERENCES public.ledger_entries(id),
  rule_snapshot jsonb,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_case_idx ON public.ledger_entries(case_id);
CREATE INDEX ledger_type_idx ON public.ledger_entries(entry_type, created_at);
GRANT SELECT ON public.ledger_entries TO authenticated;
GRANT ALL ON public.ledger_entries TO service_role;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY ledger_read ON public.ledger_entries FOR SELECT TO authenticated USING (
  private.is_finance(auth.uid())
  OR (entry_type IN ('shop_payout_obligation','supplier_payout_obligation','transport_payout_obligation','payout_completed','payout_reversal','driver_earning','driver_payout_obligation')
      AND (beneficiary_user_id = auth.uid() OR (org_id IS NOT NULL AND private.has_org_access(auth.uid(), org_id)))));

-- ================= partners =================
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS commission_rate numeric,
  ADD COLUMN IF NOT EXISTS payout_rule text,
  ADD COLUMN IF NOT EXISTS payout_method text;
ALTER TABLE public.organization_documents ADD COLUMN IF NOT EXISTS expires_on date;
CREATE POLICY org_docs_admin_update ON public.organization_documents FOR UPDATE TO authenticated
  USING (private.is_finance(auth.uid())) WITH CHECK (private.is_finance(auth.uid()));
GRANT UPDATE ON public.organization_documents TO authenticated;

CREATE TABLE public.driver_profiles (
  user_id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Suspended','Inactive')),
  status_reason text,
  rate_per_job numeric,
  licence_number text,
  licence_expires_on date,
  service_area text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.driver_profiles TO authenticated;
GRANT ALL ON public.driver_profiles TO service_role;
ALTER TABLE public.driver_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY dp_read ON public.driver_profiles FOR SELECT TO authenticated USING (private.is_ops(auth.uid()) OR user_id = auth.uid());
CREATE POLICY dp_admin_ins ON public.driver_profiles FOR INSERT TO authenticated WITH CHECK (private.is_finance(auth.uid()));
CREATE POLICY dp_admin_upd ON public.driver_profiles FOR UPDATE TO authenticated USING (private.is_finance(auth.uid())) WITH CHECK (private.is_finance(auth.uid()));
CREATE TRIGGER driver_profiles_updated BEFORE UPDATE ON public.driver_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.driver_profiles (user_id) SELECT DISTINCT user_id FROM public.user_roles WHERE role = 'driver' ON CONFLICT DO NOTHING;

CREATE TABLE public.partner_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id),
  driver_user_id uuid,
  reason text NOT NULL,
  valid_until timestamptz NOT NULL,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (org_id IS NOT NULL OR driver_user_id IS NOT NULL)
);
GRANT SELECT ON public.partner_overrides TO authenticated;
GRANT ALL ON public.partner_overrides TO service_role;
ALTER TABLE public.partner_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY po_override_read ON public.partner_overrides FOR SELECT TO authenticated USING (private.is_ops(auth.uid()));

CREATE OR REPLACE FUNCTION public.has_partner_override(_org uuid, _driver uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.partner_overrides WHERE valid_until > now()
    AND ((_org IS NOT NULL AND org_id = _org) OR (_driver IS NOT NULL AND driver_user_id = _driver)))
$$;

CREATE OR REPLACE FUNCTION public.org_block_reason(_org uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; n int;
BEGIN
  SELECT * INTO o FROM public.organizations WHERE id = _org;
  IF NOT FOUND THEN RETURN 'not found'; END IF;
  IF NOT o.active OR o.suspended_at IS NOT NULL OR o.approval_status IN ('Suspended','Deactivated','Rejected') THEN RETURN 'suspended or inactive'; END IF;
  SELECT count(*) INTO n FROM public.organization_documents WHERE organization_id = _org AND expires_on IS NOT NULL AND expires_on < current_date;
  IF n > 0 THEN RETURN 'has expired documents'; END IF;
  RETURN NULL;
END $$;

-- case assignment honours overrides
CREATE OR REPLACE FUNCTION public.guard_case_org_assignment()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE why text;
BEGIN
  IF NEW.assigned_org_id IS NOT NULL AND NEW.assigned_org_id IS DISTINCT FROM OLD.assigned_org_id THEN
    why := public.org_block_reason(NEW.assigned_org_id);
    IF why IS NOT NULL AND NOT public.has_partner_override(NEW.assigned_org_id, NULL) THEN
      RAISE EXCEPTION 'This organisation % and cannot receive new assignments without an admin override.', why USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.assigned_org_id IS DISTINCT FROM OLD.assigned_org_id THEN
    NEW.shop_response := 'Pending'; NEW.shop_response_reason := NULL; NEW.shop_responded_at := NULL;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.guard_partner_eligibility() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE why text; dp record;
BEGIN
  IF TG_TABLE_NAME = 'parts_orders' THEN
    why := public.org_block_reason(NEW.supplier_org_id);
    IF why IS NOT NULL AND NOT public.has_partner_override(NEW.supplier_org_id, NULL) THEN
      RAISE EXCEPTION 'This supplier % and cannot receive new orders.', why USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
  END IF;
  -- transport_jobs
  IF NEW.assigned_driver_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.assigned_driver_id IS DISTINCT FROM OLD.assigned_driver_id) THEN
    SELECT * INTO dp FROM public.driver_profiles WHERE user_id = NEW.assigned_driver_id;
    IF FOUND AND (dp.status <> 'Active' OR (dp.licence_expires_on IS NOT NULL AND dp.licence_expires_on < current_date))
       AND NOT public.has_partner_override(NULL, NEW.assigned_driver_id) THEN
      RAISE EXCEPTION 'This driver is % and cannot receive new assignments.',
        CASE WHEN dp.status <> 'Active' THEN lower(dp.status) ELSE 'licence-expired' END USING ERRCODE='check_violation';
    END IF;
  END IF;
  IF NEW.assigned_org_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.assigned_org_id IS DISTINCT FROM OLD.assigned_org_id) THEN
    why := public.org_block_reason(NEW.assigned_org_id);
    IF why = 'has expired documents' AND NOT public.has_partner_override(NEW.assigned_org_id, NULL) THEN
      RAISE EXCEPTION 'This provider has expired documents and cannot be assigned.' USING ERRCODE='check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER parts_orders_partner_guard BEFORE INSERT ON public.parts_orders FOR EACH ROW EXECUTE FUNCTION public.guard_partner_eligibility();
CREATE TRIGGER transport_jobs_partner_guard BEFORE INSERT OR UPDATE ON public.transport_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_partner_eligibility();

-- audit partner record changes
CREATE OR REPLACE FUNCTION public.audit_row_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_events (actor_id, action, entity_type, entity_id, before, after)
  VALUES (auth.uid(), TG_TABLE_NAME || '.' || lower(TG_OP), TG_TABLE_NAME,
          CASE WHEN TG_TABLE_NAME = 'driver_profiles' THEN NEW.user_id ELSE NEW.id END,
          CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END, to_jsonb(NEW));
  RETURN NEW;
END $$;
CREATE TRIGGER organizations_audit AFTER UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER driver_profiles_audit AFTER INSERT OR UPDATE ON public.driver_profiles FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER service_catalog_audit AFTER UPDATE ON public.service_catalog FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
CREATE TRIGGER org_docs_audit AFTER UPDATE ON public.organization_documents FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

CREATE OR REPLACE FUNCTION public.set_partner_status(_org_id uuid, _action text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.is_finance(auth.uid()) THEN RAISE EXCEPTION 'Only an Admin can change partner status.'; END IF;
  IF _action IN ('reject','suspend','deactivate') AND coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'A reason is required.'; END IF;
  UPDATE public.organizations SET
    approval_status = CASE _action WHEN 'approve' THEN 'Approved' WHEN 'reject' THEN 'Rejected' WHEN 'suspend' THEN 'Suspended'
                        WHEN 'deactivate' THEN 'Deactivated' WHEN 'reactivate' THEN 'Approved' ELSE approval_status END,
    active = CASE WHEN _action IN ('deactivate','reject') THEN false WHEN _action IN ('approve','reactivate') THEN true ELSE active END,
    suspended_at = CASE WHEN _action = 'suspend' THEN now() WHEN _action IN ('reactivate','approve') THEN NULL ELSE suspended_at END,
    status_reason = nullif(btrim(_reason),'')
  WHERE id = _org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Partner not found.'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.grant_partner_override(_org_id uuid, _driver_id uuid, _reason text, _hours integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.is_finance(auth.uid()) THEN RAISE EXCEPTION 'Only an Admin can grant overrides.'; END IF;
  IF coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'An override requires a reason.'; END IF;
  INSERT INTO public.partner_overrides (org_id, driver_user_id, reason, valid_until, created_by)
  VALUES (_org_id, _driver_id, _reason, now() + make_interval(hours => greatest(coalesce(_hours,24),1)), auth.uid());
  INSERT INTO public.audit_events (actor_id, action, entity_type, entity_id, after, reason)
  VALUES (auth.uid(), 'partner.override_granted', CASE WHEN _org_id IS NOT NULL THEN 'organization' ELSE 'driver' END,
          coalesce(_org_id, _driver_id), jsonb_build_object('hours', _hours), _reason);
END $$;

-- ================= money engine =================
CREATE OR REPLACE FUNCTION public.ledger_post(_type text, _amount numeric, _desc text, _inv record, _extra jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE id uuid; c record;
BEGIN
  IF _amount IS NULL OR _amount = 0 THEN RETURN NULL; END IF;
  INSERT INTO public.ledger_entries (entry_type, amount, description, case_id, customer_id, vehicle_id, invoice_id, booking_id,
     payment_id, refund_id, adjustment_id, parts_order_id, transport_job_id, org_id, beneficiary_user_id, payout_id, reverses_entry_id, rule_snapshot, created_by)
  VALUES (_type, round(_amount,2), _desc,
     coalesce((_extra->>'case_id')::uuid, _inv.case_id), coalesce((_extra->>'customer_id')::uuid, _inv.user_id),
     (_extra->>'vehicle_id')::uuid, _inv.id, _inv.booking_id,
     (_extra->>'payment_id')::uuid, (_extra->>'refund_id')::uuid, (_extra->>'adjustment_id')::uuid,
     (_extra->>'parts_order_id')::uuid, (_extra->>'transport_job_id')::uuid, (_extra->>'org_id')::uuid,
     (_extra->>'beneficiary_user_id')::uuid, (_extra->>'payout_id')::uuid, (_extra->>'reverses_entry_id')::uuid,
     _extra->'rule', auth.uid())
  RETURNING ledger_entries.id INTO id;
  RETURN id;
END $$;

CREATE OR REPLACE FUNCTION public.recognise_invoice(_invoice_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv record; c record; o record; rate numeric; comm numeric; veh uuid; ex jsonb; pid uuid;
BEGIN
  SELECT * INTO inv FROM public.invoices WHERE id = _invoice_id;
  IF EXISTS (SELECT 1 FROM public.ledger_entries WHERE invoice_id = _invoice_id AND entry_type = 'customer_charge') THEN RETURN; END IF;
  SELECT * INTO c FROM public.cases WHERE id = inv.case_id;
  veh := c.vehicle_id;
  ex := jsonb_build_object('vehicle_id', veh, 'rule', jsonb_build_object('tax_rate', inv.tax_rate_applied));
  PERFORM public.ledger_post('customer_charge', inv.total, 'Invoice ' || inv.invoice_number, inv, ex);
  PERFORM public.ledger_post('tax', inv.tax, 'Tax collected on ' || inv.invoice_number, inv, ex);
  IF c.assigned_org_id IS NOT NULL THEN
    SELECT * INTO o FROM public.organizations WHERE id = c.assigned_org_id;
  END IF;
  IF o.id IS NOT NULL AND o.org_type = 'repair_shop' THEN
    rate := coalesce(o.commission_rate, public.config_value('shop_commission_rate', now()), 0);
    comm := round(inv.subtotal * rate, 2);
    ex := ex || jsonb_build_object('org_id', o.id, 'rule', jsonb_build_object('tax_rate', inv.tax_rate_applied, 'shop_commission_rate', rate));
    PERFORM public.ledger_post('shop_charge', inv.subtotal, 'Repair work by ' || o.legal_name, inv, ex);
    PERFORM public.ledger_post('shop_commission', comm, 'BlessRite commission', inv, ex);
    INSERT INTO public.payouts (beneficiary_type, org_id, case_id, source_type, source_id, gross, fees, taxes, net, rule_snapshot)
    VALUES ('shop', o.id, inv.case_id, 'invoice', inv.id, inv.subtotal, comm, 0, inv.subtotal - comm, ex->'rule')
    ON CONFLICT DO NOTHING RETURNING id INTO pid;
    PERFORM public.ledger_post('shop_payout_obligation', inv.subtotal - comm, 'Owed to ' || o.legal_name, inv, ex || jsonb_build_object('payout_id', pid));
  ELSIF c.origin = 'roadside' THEN
    PERFORM public.ledger_post('roadside_revenue', inv.subtotal, 'Roadside revenue', inv, ex);
  ELSE
    PERFORM public.ledger_post('service_revenue', inv.subtotal, 'BlessRite service revenue', inv, ex);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.refresh_invoice_payment(_invoice_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv record; paid numeric; refunded numeric; adj numeric; bal numeric; ps text;
BEGIN
  SELECT * INTO inv FROM public.invoices WHERE id = _invoice_id;
  SELECT coalesce(sum(amount),0) INTO paid FROM public.payments WHERE invoice_id = _invoice_id AND status = 'Paid';
  SELECT coalesce(sum(amount),0) INTO refunded FROM public.refunds WHERE invoice_id = _invoice_id;
  SELECT coalesce(sum(amount),0) INTO adj FROM public.adjustments WHERE invoice_id = _invoice_id AND target = 'invoice';
  bal := round(inv.total + adj - (paid - refunded), 2);
  ps := CASE WHEN refunded > 0 AND refunded >= paid THEN 'Refunded'
             WHEN refunded > 0 THEN 'Partially Refunded'
             WHEN paid > 0 AND bal <= 0 THEN 'Paid'
             WHEN paid > 0 THEN 'Partially Paid'
             ELSE 'Unpaid' END;
  UPDATE public.invoices SET amount_paid = paid, amount_refunded = refunded, adjustments_total = adj, balance_due = bal, payment_status = ps,
    status = CASE WHEN status <> 'Void' AND paid > 0 AND bal <= 0 THEN 'Paid'
                  WHEN status = 'Paid' AND bal > 0 THEN 'Sent' ELSE status END,
    paid_at = CASE WHEN paid > 0 AND bal <= 0 THEN coalesce(paid_at, now()) WHEN bal > 0 THEN NULL ELSE paid_at END
  WHERE id = _invoice_id;
  IF paid > 0 AND bal <= 0 THEN
    PERFORM public.recognise_invoice(_invoice_id);
    UPDATE public.payouts SET status = 'Payout Pending', status_reason = 'Customer payment restored'
     WHERE source_type = 'invoice' AND source_id = _invoice_id AND status = 'On Hold';
  ELSIF paid - refunded <= 0 OR bal > 0 THEN
    UPDATE public.payouts SET status = 'On Hold', status_reason = 'Customer payment not settled'
     WHERE source_type = 'invoice' AND source_id = _invoice_id AND status IN ('Payout Pending','Payout Approved') AND paid - refunded <= 0;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.record_payment(_invoice_id uuid, _amount numeric, _method text, _status text, _reference text, _provider_fee numeric, _received_at timestamptz, _failure_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv record; pid uuid;
BEGIN
  IF NOT private.is_finance(auth.uid()) THEN RAISE EXCEPTION 'Only an Admin can record payments.'; END IF;
  SELECT * INTO inv FROM public.invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found.'; END IF;
  IF inv.status IN ('Void','Draft') THEN RAISE EXCEPTION 'Send the invoice before recording payments; void invoices cannot be paid.'; END IF;
  IF _status NOT IN ('Pending','Authorized','Paid','Failed') THEN RAISE EXCEPTION 'Invalid payment status.'; END IF;
  IF _status = 'Failed' AND coalesce(btrim(_failure_reason),'') = '' THEN RAISE EXCEPTION 'Give the failure reason.'; END IF;
  IF _status = 'Paid' AND _amount > inv.balance_due + 0.005 THEN RAISE EXCEPTION 'Payment exceeds the balance due (%).', inv.balance_due; END IF;
  INSERT INTO public.payments (invoice_id, case_id, customer_id, amount, method, status, reference, provider_fee, received_at, recorded_by, failure_reason)
  VALUES (_invoice_id, inv.case_id, inv.user_id, _amount, _method, _status, nullif(btrim(_reference),''), coalesce(_provider_fee,0), coalesce(_received_at, now()), auth.uid(), nullif(btrim(_failure_reason),''))
  RETURNING id INTO pid;
  IF _status = 'Paid' THEN
    PERFORM public.ledger_post('payment', _amount, 'Payment ' || _method || coalesce(' · ' || _reference,''), inv, jsonb_build_object('payment_id', pid));
    PERFORM public.ledger_post('provider_fee', coalesce(_provider_fee,0), 'Payment provider fee', inv, jsonb_build_object('payment_id', pid));
  END IF;
  INSERT INTO public.audit_events (actor_id, action, entity_type, entity_id, case_id, after, reason)
  VALUES (auth.uid(), 'payment.recorded', 'payment', pid, inv.case_id, jsonb_build_object('amount', _amount, 'status', _status, 'method', _method, 'reference', _reference), _failure_reason);
  PERFORM public.refresh_invoice_payment(_invoice_id);
  IF _status = 'Paid' THEN
    PERFORM public.notify_customer(inv.user_id, inv.case_id, 'payment_received', 'Payment received',
      'We received ' || to_char(_amount, 'FM$999,990.00') || ' for invoice ' || inv.invoice_number || '.', '/invoices');
  ELSIF _status = 'Failed' THEN
    PERFORM public.notify_customer(inv.user_id, inv.case_id, 'payment_failed', 'Payment not completed',
      'A payment for invoice ' || inv.invoice_number || ' did not go through.', '/invoices');
  END IF;
  RETURN pid;
END $$;

CREATE OR REPLACE FUNCTION public.set_payment_status(_payment_id uuid, _to_status text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; inv record; eid uuid;
BEGIN
  IF NOT private.is_finance(auth.uid()) THEN RAISE EXCEPTION 'Only an Admin can change payments.'; END IF;
  SELECT * INTO p FROM public.payments WHERE id = _payment_id;
  SELECT * INTO inv FROM public.invoices WHERE id = p.invoice_id;
  IF NOT (
      (p.status IN ('Pending','Authorized') AND _to_status IN ('Paid','Failed','Authorized'))
   OR (p.status = 'Paid' AND _to_status = 'Reversed')) THEN
    RAISE EXCEPTION 'A payment cannot move from % to %.', p.status, _to_status;
  END IF;
  IF _to_status IN ('Failed','Reversed') AND coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'A reason is required.'; END IF;
  IF _to_status = 'Reversed' AND EXISTS (SELECT 1 FROM public.refunds WHERE payment_id = _payment_id) THEN
    RAISE EXCEPTION 'This payment has refunds; record an adjustment instead.';
  END IF;
  UPDATE public.payments SET status = _to_status, failure_reason = coalesce(nullif(btrim(_reason),''), failure_reason), updated_at = now() WHERE id = _payment_id;
  IF _to_status = 'Paid' THEN
    PERFORM public.ledger_post('payment', p.amount, 'Payment ' || p.method || coalesce(' · ' || p.reference,''), inv, jsonb_build_object('payment_id', p.id));
    PERFORM public.ledger_post('provider_fee', p.provider_fee, 'Payment provider fee', inv, jsonb_build_object('payment_id', p.id));
  ELSIF _to_status = 'Reversed' THEN
    SELECT id INTO eid FROM public.ledger_entries WHERE payment_id = p.id AND entry_type = 'payment' ORDER BY created_at LIMIT 1;
    PERFORM public.ledger_post('payment_reversal', -p.amount, 'Payment reversed: ' || _reason, inv, jsonb_build_object('payment_id', p.id, 'reverses_entry_id', eid));
  END IF;
  INSERT INTO public.audit_events (actor_id, action, entity_type, entity_id, case_id, before, after, reason)
  VALUES (auth.uid(), 'payment.status_changed', 'payment', p.id, p.case_id, jsonb_build_object('status', p.status), jsonb_build_object('status', _to_status), _reason);
  PERFORM public.refresh_invoice_payment(p.invoice_id);
END $$;

CREATE OR REPLACE FUNCTION public.issue_refund(_payment_id uuid, _amount numeric, _reason text, _reference text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; inv record; already numeric; rid uuid; po record; share numeric; aid uuid;
BEGIN
  IF NOT private.is_finance(auth.uid()) THEN RAISE EXCEPTION 'Only an Admin can issue refunds.'; END IF;
  IF coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'A refund requires a reason.'; END IF;
  SELECT * INTO p FROM public.payments WHERE id = _payment_id;
  IF p.status <> 'Paid' THEN RAISE EXCEPTION 'Only settled payments can be refunded.'; END IF;
  SELECT coalesce(sum(amount),0) INTO already FROM public.refunds WHERE payment_id = _payment_id;
  IF _amount <= 0 OR _amount > p.amount - already + 0.005 THEN RAISE EXCEPTION 'Refund must be between 0 and % .', p.amount - already; END IF;
  SELECT * INTO inv FROM public.invoices WHERE id = p.invoice_id;
  INSERT INTO public.refunds (payment_id, invoice_id, case_id, customer_id, amount, reason, reference, actor_id)
  VALUES (p.id, p.invoice_id, p.case_id, p.customer_id, _amount, _reason, nullif(btrim(_reference),''), auth.uid()) RETURNING id INTO rid;
  PERFORM public.ledger_post('refund', -_amount, 'Refund: ' || _reason, inv, jsonb_build_object('payment_id', p.id, 'refund_id', rid));
  -- reduce any unpaid partner obligation from this invoice proportionally
  FOR po IN SELECT * FROM public.payouts WHERE source_type = 'invoice' AND source_id = p.invoice_id AND status IN ('Payout Pending','Payout Approved','On Hold') LOOP
    share := round(_amount * (po.gross / nullif(inv.total,0)) * (po.net / nullif(po.gross,0)), 2);
    IF share > 0 THEN
      INSERT INTO public.adjustments (target, payout_id, case_id, amount, reason, reference, actor_id)
      VALUES ('payout', po.id, po.case_id, -share, 'Share of customer refund: ' || _reason, _reference, auth.uid()) RETURNING id INTO aid;
      UPDATE public.payouts SET adjustments = adjustments - share, net = net - share,
        status = CASE WHEN status = 'Payout Approved' THEN 'Payout Pending' ELSE status END,
        status_reason = 'Reduced by customer refund; re-approval needed', updated_at = now() WHERE id = po.id;
      PERFORM public.ledger_post('adjustment', -share, 'Partner obligation reduced by refund', inv,
        jsonb_build_object('payout_id', po.id, 'org_id', po.org_id, 'adjustment_id', aid, 'refund_id', rid));
    END IF;
  END LOOP;
  INSERT INTO public.audit_events (actor_id, action, entity_type, entity_id, case_id, after, reason)
  VALUES (auth.uid(), 'refund.issued', 'refund', rid, p.case_id, jsonb_build_object('amount', _amount, 'payment', p.id, 'reference', _reference), _reason);
  PERFORM public.refresh_invoice_payment(p.invoice_id);
  PERFORM public.notify_customer(p.customer_id, p.case_id, 'refund_issued', 'Refund issued',
    to_char(_amount, 'FM$999,990.00') || ' refunded on invoice ' || inv.invoice_number || '.', '/invoices');
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.record_adjustment(_invoice_id uuid, _payout_id uuid, _amount numeric, _reason text, _reference text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv record; po record; aid uuid;
BEGIN
  IF NOT private.is_finance(auth.uid()) THEN RAISE EXCEPTION 'Only an Admin can record adjustments.'; END IF;
  IF coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'An adjustment requires a reason.'; END IF;
  IF coalesce(_amount,0) = 0 THEN RAISE EXCEPTION 'Enter a non-zero amount.'; END IF;
  IF _invoice_id IS NOT NULL THEN
    SELECT * INTO inv FROM public.invoices WHERE id = _invoice_id;
    INSERT INTO public.adjustments (target, invoice_id, case_id, customer_id, amount, reason, reference, actor_id)
    VALUES ('invoice', inv.id, inv.case_id, inv.user_id, _amount, _reason, nullif(btrim(_reference),''), auth.uid()) RETURNING id INTO aid;
    PERFORM public.ledger_post('adjustment', _amount, 'Invoice adjustment: ' || _reason, inv, jsonb_build_object('adjustment_id', aid));
    PERFORM public.refresh_invoice_payment(inv.id);
  ELSIF _payout_id IS NOT NULL THEN
    SELECT * INTO po FROM public.payouts WHERE id = _payout_id;
    IF po.status IN ('Payout Completed','Reversed') THEN RAISE EXCEPTION 'Completed or reversed payouts cannot be adjusted; record a new obligation instead.'; END IF;
    IF po.net + _amount < 0 THEN RAISE EXCEPTION 'The adjustment would make the payout negative.'; END IF;
    INSERT INTO public.adjustments (target, payout_id, case_id, amount, reason, reference, actor_id)
    VALUES ('payout', po.id, po.case_id, _amount, _reason, nullif(btrim(_reference),''), auth.uid()) RETURNING id INTO aid;
    UPDATE public.payouts SET adjustments = adjustments + _amount, net = net + _amount,
      status = CASE WHEN status = 'Payout Approved' THEN 'Payout Pending' ELSE status END, updated_at = now() WHERE id = po.id;
    SELECT * INTO inv FROM public.invoices WHERE false;
    INSERT INTO public.ledger_entries (entry_type, amount, description, case_id, org_id, beneficiary_user_id, payout_id, adjustment_id, created_by)
    VALUES ('adjustment', _amount, 'Payout adjustment: ' || _reason, po.case_id, po.org_id, po.beneficiary_user_id, po.id, aid, auth.uid());
  ELSE RAISE EXCEPTION 'Choose an invoice or a payout.'; END IF;
  INSERT INTO public.audit_events (actor_id, action, entity_type, entity_id, case_id, after, reason)
  VALUES (auth.uid(), 'adjustment.recorded', 'adjustment', aid, coalesce(inv.case_id, po.case_id), jsonb_build_object('amount', _amount, 'reference', _reference), _reason);
  RETURN aid;
END $$;

-- payouts lifecycle
CREATE OR REPLACE FUNCTION public.payout_action(_payout_id uuid, _action text, _reason text, _paid_on date, _method text, _reference text, _evidence_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE po record; nxt text;
BEGIN
  IF NOT private.is_finance(auth.uid()) THEN RAISE EXCEPTION 'Only an Admin can act on payouts.'; END IF;
  SELECT * INTO po FROM public.payouts WHERE id = _payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payout not found.'; END IF;
  nxt := CASE
    WHEN _action = 'approve' AND po.status = 'Payout Pending' THEN 'Payout Approved'
    WHEN _action = 'complete' AND po.status = 'Payout Approved' THEN 'Payout Completed'
    WHEN _action = 'fail' AND po.status = 'Payout Approved' THEN 'Payout Failed'
    WHEN _action = 'retry' AND po.status = 'Payout Failed' THEN 'Payout Pending'
    WHEN _action = 'hold' AND po.status IN ('Payout Pending','Payout Approved') THEN 'On Hold'
    WHEN _action = 'release' AND po.status = 'On Hold' THEN 'Payout Pending'
    WHEN _action = 'reverse' AND po.status IN ('Payout Pending','On Hold','Payout Failed') THEN 'Reversed'
    ELSE NULL END;
  IF nxt IS NULL THEN RAISE EXCEPTION 'Cannot % a payout that is %.', _action, po.status; END IF;
  IF _action IN ('fail','hold','reverse') AND coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'A reason is required.'; END IF;
  IF _action = 'release' AND po.source_type = 'invoice' AND EXISTS (SELECT 1 FROM public.invoices WHERE id = po.source_id AND amount_paid - amount_refunded <= 0) THEN
    RAISE EXCEPTION 'The customer payment behind this payout is not settled.';
  END IF;
  IF _action = 'complete' THEN
    IF _paid_on IS NULL OR coalesce(btrim(_method),'') = '' THEN RAISE EXCEPTION 'Record the payment date and method.'; END IF;
    IF coalesce(btrim(_reference),'') = '' AND coalesce(btrim(_evidence_path),'') = '' THEN
      RAISE EXCEPTION 'Completion needs a verified payment reference or uploaded evidence.'; END IF;
  END IF;
  UPDATE public.payouts SET status = nxt, status_reason = coalesce(nullif(btrim(_reason),''), status_reason), updated_at = now(),
    approved_by = CASE WHEN _action = 'approve' THEN auth.uid() ELSE approved_by END,
    approved_at = CASE WHEN _action = 'approve' THEN now() ELSE approved_at END,
    completed_by = CASE WHEN _action = 'complete' THEN auth.uid() ELSE completed_by END,
    completed_at = CASE WHEN _action = 'complete' THEN now() ELSE completed_at END,
    paid_on = CASE WHEN _action = 'complete' THEN _paid_on ELSE paid_on END,
    method = CASE WHEN _action = 'complete' THEN _method ELSE method END,
    reference = CASE WHEN _action = 'complete' THEN nullif(btrim(_reference),'') ELSE reference END,
    evidence_path = CASE WHEN _action = 'complete' THEN nullif(btrim(_evidence_path),'') ELSE evidence_path END
  WHERE id = _payout_id;
  IF _action = 'complete' THEN
    INSERT INTO public.ledger_entries (entry_type, amount, description, case_id, org_id, beneficiary_user_id, payout_id,
      parts_order_id, transport_job_id, invoice_id, created_by)
    VALUES ('payout_completed', -po.net, 'Paid ' || _method || coalesce(' · ' || _reference,''), po.case_id, po.org_id, po.beneficiary_user_id, po.id,
      CASE WHEN po.source_type = 'parts_order' THEN po.source_id END, CASE WHEN po.source_type = 'transport_job' THEN po.source_id END,
      CASE WHEN po.source_type = 'invoice' THEN po.source_id END, auth.uid());
  END IF;
  IF po.source_type = 'parts_order' THEN
    UPDATE public.parts_orders SET payout_status = CASE nxt WHEN 'Payout Completed' THEN 'Paid' WHEN 'Reversed' THEN 'Withheld' WHEN 'On Hold' THEN 'Withheld' ELSE 'Pending' END
     WHERE id = po.source_id;
  END IF;
  INSERT INTO public.audit_events (actor_id, action, entity_type, entity_id, case_id, before, after, reason)
  VALUES (auth.uid(), 'payout.' || _action, 'payout', po.id, po.case_id, jsonb_build_object('status', po.status),
          jsonb_build_object('status', nxt, 'reference', _reference, 'method', _method, 'paid_on', _paid_on,
                             'approved_by', po.approved_by, 'same_person_as_approver', (_action = 'complete' AND po.approved_by = auth.uid())), _reason);
  IF _action IN ('approve','complete') THEN
    IF po.org_id IS NOT NULL THEN
      PERFORM public.notify_org(po.org_id, po.case_id, 'payout', CASE WHEN _action = 'approve' THEN 'Payout approved (not yet paid)' ELSE 'Payout sent' END,
        to_char(po.net, 'FM$999,990.00') || CASE WHEN _action = 'complete' THEN ' · ref ' || coalesce(_reference, 'evidence on file') ELSE '' END, NULL);
    ELSIF po.beneficiary_user_id IS NOT NULL THEN
      PERFORM public.notify_customer(po.beneficiary_user_id, po.case_id, 'payout', CASE WHEN _action = 'approve' THEN 'Earnings approved (not yet paid)' ELSE 'Earnings paid' END,
        to_char(po.net, 'FM$999,990.00'), '/driver');
    END IF;
  END IF;
END $$;

-- supplier obligation on parts order completion
CREATE OR REPLACE FUNCTION public.parts_order_finance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid; ex jsonb; inv record;
BEGIN
  IF NEW.status = 'Completed' AND OLD.status IS DISTINCT FROM 'Completed' AND NEW.confirmed_snapshot IS NOT NULL THEN
    ex := jsonb_build_object('rule', jsonb_build_object('fee_rate', NEW.confirmed_snapshot->'fee_rate', 'tax_rate', NEW.confirmed_snapshot->'tax_rate'));
    INSERT INTO public.payouts (beneficiary_type, org_id, case_id, source_type, source_id, gross, fees, taxes, net, rule_snapshot)
    VALUES ('supplier', NEW.supplier_org_id, NEW.case_id, 'parts_order', NEW.id, NEW.subtotal, NEW.fees, NEW.tax, NEW.subtotal + NEW.tax - NEW.fees, ex->'rule')
    ON CONFLICT DO NOTHING RETURNING id INTO pid;
    IF pid IS NOT NULL THEN
      INSERT INTO public.ledger_entries (entry_type, amount, description, case_id, customer_id, parts_order_id, org_id, payout_id, rule_snapshot, created_by) VALUES
        ('parts_purchase', NEW.subtotal, 'Parts ' || NEW.order_ref, NEW.case_id, NEW.customer_id, NEW.id, NEW.supplier_org_id, pid, ex->'rule', auth.uid()),
        ('tax', NEW.tax, 'Tax on parts ' || NEW.order_ref, NEW.case_id, NEW.customer_id, NEW.id, NEW.supplier_org_id, pid, ex->'rule', auth.uid()),
        ('marketplace_fee', NEW.fees, 'Marketplace fee ' || NEW.order_ref, NEW.case_id, NEW.customer_id, NEW.id, NEW.supplier_org_id, pid, ex->'rule', auth.uid()),
        ('supplier_payout_obligation', NEW.subtotal + NEW.tax - NEW.fees, 'Owed to supplier for ' || NEW.order_ref, NEW.case_id, NEW.customer_id, NEW.id, NEW.supplier_org_id, pid, ex->'rule', auth.uid());
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER parts_orders_finance AFTER UPDATE ON public.parts_orders FOR EACH ROW EXECUTE FUNCTION public.parts_order_finance();

-- driver / transport provider obligation on job completion
CREATE OR REPLACE FUNCTION public.transport_finance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rate numeric; pid uuid; rule jsonb; fee numeric;
BEGIN
  IF NEW.status = 'Completed' AND OLD.status IS DISTINCT FROM 'Completed' THEN
    IF NEW.assigned_driver_id IS NOT NULL THEN
      SELECT rate_per_job INTO rate FROM public.driver_profiles WHERE user_id = NEW.assigned_driver_id;
      rate := coalesce(rate, public.config_value('driver_rate_per_job', now()), 0);
      rule := jsonb_build_object('driver_rate_per_job', rate);
      INSERT INTO public.payouts (beneficiary_type, beneficiary_user_id, org_id, case_id, source_type, source_id, gross, net, rule_snapshot)
      VALUES ('driver', NEW.assigned_driver_id, NULL, NEW.case_id, 'transport_job', NEW.id, rate, rate, rule)
      ON CONFLICT DO NOTHING RETURNING id INTO pid;
      IF pid IS NOT NULL AND rate > 0 THEN
        INSERT INTO public.ledger_entries (entry_type, amount, description, case_id, customer_id, vehicle_id, transport_job_id, parts_order_id, beneficiary_user_id, payout_id, rule_snapshot, created_by) VALUES
          ('driver_earning', rate, 'Driver earning', NEW.case_id, NEW.customer_id, NEW.vehicle_id, NEW.id, NEW.parts_order_id, NEW.assigned_driver_id, pid, rule, auth.uid()),
          ('driver_payout_obligation', rate, 'Owed to driver', NEW.case_id, NEW.customer_id, NEW.vehicle_id, NEW.id, NEW.parts_order_id, NEW.assigned_driver_id, pid, rule, auth.uid());
      END IF;
    ELSIF NEW.assigned_org_id IS NOT NULL THEN
      rate := coalesce(public.config_value('transport_base_fee', now()), 0);
      rule := jsonb_build_object('transport_base_fee', rate);
      INSERT INTO public.payouts (beneficiary_type, org_id, case_id, source_type, source_id, gross, net, rule_snapshot)
      VALUES ('transport', NEW.assigned_org_id, NEW.case_id, 'transport_job', NEW.id, rate, rate, rule)
      ON CONFLICT DO NOTHING RETURNING id INTO pid;
      IF pid IS NOT NULL AND rate > 0 THEN
        INSERT INTO public.ledger_entries (entry_type, amount, description, case_id, customer_id, transport_job_id, org_id, payout_id, rule_snapshot, created_by)
        VALUES ('transport_payout_obligation', rate, 'Owed to transport provider', NEW.case_id, NEW.customer_id, NEW.id, NEW.assigned_org_id, pid, rule, auth.uid());
      END IF;
    END IF;
    IF NEW.job_type = 'parts_delivery' THEN
      fee := coalesce(public.config_value('parts_delivery_fee', now()), 0);
      IF fee > 0 THEN
        INSERT INTO public.ledger_entries (entry_type, amount, description, case_id, customer_id, transport_job_id, parts_order_id, rule_snapshot, created_by)
        VALUES ('parts_delivery_revenue', fee, 'Parts delivery fee (billable)', NEW.case_id, NEW.customer_id, NEW.id, NEW.parts_order_id,
                jsonb_build_object('parts_delivery_fee', fee), auth.uid());
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER transport_jobs_finance AFTER UPDATE ON public.transport_jobs FOR EACH ROW EXECUTE FUNCTION public.transport_finance();

-- ================= execute rights =================
DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['apply_due_config()','protect_paid_invoice_items()','has_partner_override(uuid,uuid)','org_block_reason(uuid)',
    'guard_partner_eligibility()','audit_row_change()','ledger_post(text,numeric,text,record,jsonb)','recognise_invoice(uuid)',
    'refresh_invoice_payment(uuid)','parts_order_finance()','transport_finance()','guard_case_org_assignment()','recalc_invoice_totals()','recalc_estimate_totals()']
  LOOP EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f); END LOOP;
  FOREACH f IN ARRAY ARRAY['set_config(text,numeric,text,timestamptz,text)','set_partner_status(uuid,text,text)','grant_partner_override(uuid,uuid,text,integer)',
    'record_payment(uuid,numeric,text,text,text,numeric,timestamptz,text)','set_payment_status(uuid,text,text)','issue_refund(uuid,numeric,text,text)',
    'record_adjustment(uuid,uuid,numeric,text,text)','payout_action(uuid,text,text,date,text,text,text)']
  LOOP EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f); EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f); END LOOP;
END $$;