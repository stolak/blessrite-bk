-- 1. Bookings: scheduling + routing
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_staff_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS routing_note text;

-- 2. Settings
CREATE TABLE public.business_settings (
  key text PRIMARY KEY,
  value numeric NOT NULL,
  label text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.business_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.business_settings TO authenticated;
GRANT ALL ON public.business_settings TO service_role;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings read" ON public.business_settings FOR SELECT USING (true);
CREATE POLICY "settings insert" ON public.business_settings FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "settings update" ON public.business_settings FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE TRIGGER business_settings_updated BEFORE UPDATE ON public.business_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.business_settings (key, value, label) VALUES
  ('labour_hourly_rate', 120, 'Labour rate per hour (CAD)'),
  ('tax_rate', 0.12, 'Tax rate (GST + PST)');

-- 3. Service catalog
CREATE TABLE public.service_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  service_type text NOT NULL,
  is_routine boolean NOT NULL DEFAULT true,
  flat_rate numeric NOT NULL DEFAULT 0,
  est_minutes integer NOT NULL DEFAULT 60,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_catalog TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_catalog TO authenticated;
GRANT ALL ON public.service_catalog TO service_role;
ALTER TABLE public.service_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog read" ON public.service_catalog FOR SELECT USING (true);
CREATE POLICY "catalog insert" ON public.service_catalog FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "catalog update" ON public.service_catalog FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "catalog delete" ON public.service_catalog FOR DELETE TO authenticated USING (private.is_staff(auth.uid()));
CREATE TRIGGER service_catalog_updated BEFORE UPDATE ON public.service_catalog FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.service_catalog (name, service_type, is_routine, flat_rate, est_minutes) VALUES
  ('Oil Change', 'Oil Change', true, 89.00, 45),
  ('Scheduled Maintenance', 'Maintenance', true, 149.00, 90),
  ('Diagnostic Scan', 'Diagnostic', true, 129.00, 60),
  ('Pre-Purchase Inspection', 'Pre-Purchase Inspection', true, 179.00, 90),
  ('Vehicle Pickup & Delivery', 'Vehicle Pickup & Delivery', true, 59.00, 60),
  ('Brake Service', 'Brake Service', false, 0, 120),
  ('General Repair', 'General Repair', false, 0, 180),
  ('Electrical Diagnosis / Repair', 'Electrical Diagnosis / Repair', false, 0, 180),
  ('Roadside Assistance', 'Roadside Assistance', false, 0, 60);

-- 4. Invoices
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  booking_id uuid REFERENCES public.bookings(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'Draft',
  auto_generated boolean NOT NULL DEFAULT false,
  subtotal numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  due_date date,
  issued_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices select" ON public.invoices FOR SELECT TO authenticated USING (user_id = auth.uid() OR private.is_staff(auth.uid()));
CREATE POLICY "invoices insert" ON public.invoices FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "invoices update" ON public.invoices FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE TRIGGER invoices_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'Service',
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoice items select" ON public.invoice_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_items.invoice_id AND (i.user_id = auth.uid() OR private.is_staff(auth.uid()))));
CREATE POLICY "invoice items insert" ON public.invoice_items FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "invoice items update" ON public.invoice_items FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "invoice items delete" ON public.invoice_items FOR DELETE TO authenticated USING (private.is_staff(auth.uid()));

-- invoice numbering
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1000;
GRANT USAGE, SELECT ON SEQUENCE public.invoice_number_seq TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'BR-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 4, '0');
$$;
GRANT EXECUTE ON FUNCTION public.next_invoice_number() TO authenticated, service_role;

-- keep totals in sync from line items
CREATE OR REPLACE FUNCTION public.recalc_invoice_totals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv uuid; sub numeric; rate numeric;
BEGIN
  inv := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT COALESCE(SUM(amount),0) INTO sub FROM public.invoice_items WHERE invoice_id = inv;
  SELECT value INTO rate FROM public.business_settings WHERE key = 'tax_rate';
  UPDATE public.invoices
     SET subtotal = sub,
         tax = round(sub * COALESCE(rate,0), 2),
         total = round(sub * (1 + COALESCE(rate,0)), 2)
   WHERE id = inv;
  RETURN NULL;
END; $$;
CREATE TRIGGER invoice_items_totals AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION public.recalc_invoice_totals();

-- auto invoice for routine services on completion
CREATE OR REPLACE FUNCTION public.auto_invoice_routine_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE svc record; inv_id uuid; num text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('Repair Completed','Delivered','Service Completed') THEN
    IF EXISTS (SELECT 1 FROM public.invoices WHERE booking_id = NEW.id) THEN
      RETURN NEW;
    END IF;
    SELECT * INTO svc FROM public.service_catalog
      WHERE service_type = NEW.service_type AND is_routine AND active AND flat_rate > 0 LIMIT 1;
    IF NOT FOUND THEN RETURN NEW; END IF;
    num := public.next_invoice_number();
    INSERT INTO public.invoices (invoice_number, booking_id, user_id, title, status, auto_generated, issued_at, due_date, notes)
    VALUES (num, NEW.id, NEW.user_id, svc.name, 'Sent', true, now(), (now() + interval '14 days')::date,
            'Automatically issued for a routine service.')
    RETURNING id INTO inv_id;
    INSERT INTO public.invoice_items (invoice_id, kind, description, quantity, unit_price, amount)
    VALUES (inv_id, 'Service', svc.name, 1, svc.flat_rate, svc.flat_rate);
    IF NEW.needs_pickup THEN
      INSERT INTO public.invoice_items (invoice_id, kind, description, quantity, unit_price, amount)
      SELECT inv_id, 'Service', name, 1, flat_rate, flat_rate FROM public.service_catalog
      WHERE service_type = 'Vehicle Pickup & Delivery' AND active LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER bookings_auto_invoice AFTER UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.auto_invoice_routine_booking();

-- 5. Availability blocks
CREATE TABLE public.availability_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Unavailable',
  block_date date NOT NULL,
  all_day boolean NOT NULL DEFAULT true,
  start_time time,
  end_time time,
  reason text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.availability_blocks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability_blocks TO authenticated;
GRANT ALL ON public.availability_blocks TO service_role;
ALTER TABLE public.availability_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocks read" ON public.availability_blocks FOR SELECT USING (true);
CREATE POLICY "blocks insert" ON public.availability_blocks FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "blocks update" ON public.availability_blocks FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "blocks delete" ON public.availability_blocks FOR DELETE TO authenticated USING (private.is_staff(auth.uid()));

-- 6. Booking reminders
CREATE TABLE public.booking_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  remind_at timestamptz NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'Pending',
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX booking_reminders_unique ON public.booking_reminders (booking_id, remind_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_reminders TO authenticated;
GRANT ALL ON public.booking_reminders TO service_role;
ALTER TABLE public.booking_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reminders select" ON public.booking_reminders FOR SELECT TO authenticated USING (user_id = auth.uid() OR private.is_staff(auth.uid()));
CREATE POLICY "reminders insert" ON public.booking_reminders FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "reminders update" ON public.booking_reminders FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "reminders delete" ON public.booking_reminders FOR DELETE TO authenticated USING (private.is_staff(auth.uid()));

-- auto-create a 24h reminder whenever a booking is scheduled
CREATE OR REPLACE FUNCTION public.schedule_booking_reminder()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.scheduled_at IS NOT NULL AND NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at THEN
    INSERT INTO public.booking_reminders (booking_id, user_id, remind_at, message)
    VALUES (NEW.id, NEW.user_id, NEW.scheduled_at - interval '24 hours',
            'Reminder: your ' || NEW.service_type || ' appointment with BlessRite is tomorrow at ' ||
            to_char(NEW.scheduled_at, 'Mon DD, HH12:MI AM') || '.')
    ON CONFLICT (booking_id, remind_at) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER bookings_schedule_reminder AFTER UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.schedule_booking_reminder();