-- Phase 6 hardening: prevent ownership reassignment through UPDATE
ALTER POLICY "bookings update" ON public.bookings WITH CHECK ((user_id = auth.uid()) OR private.is_staff(auth.uid()));
ALTER POLICY "profiles update" ON public.profiles WITH CHECK ((id = auth.uid()) OR private.is_staff(auth.uid()));
ALTER POLICY "vehicles update" ON public.vehicles WITH CHECK ((user_id = auth.uid()) OR private.is_staff(auth.uid()));
ALTER POLICY "roadside update" ON public.roadside_requests WITH CHECK ((user_id = auth.uid()) OR private.is_staff(auth.uid()));
ALTER POLICY "estimates update" ON public.estimates WITH CHECK ((user_id = auth.uid()) OR private.is_staff(auth.uid()));

-- Customers may not change the owner column of their own rows
CREATE OR REPLACE FUNCTION public.guard_owner_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id AND NOT private.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Changing the record owner is not permitted';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_owner_bookings BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.guard_owner_change();
CREATE TRIGGER guard_owner_vehicles BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.guard_owner_change();
CREATE TRIGGER guard_owner_roadside BEFORE UPDATE ON public.roadside_requests FOR EACH ROW EXECUTE FUNCTION public.guard_owner_change();
CREATE TRIGGER guard_owner_estimates BEFORE UPDATE ON public.estimates FOR EACH ROW EXECUTE FUNCTION public.guard_owner_change();

-- Status lookup tables: signed-in only
ALTER POLICY "tt_read" ON public.transport_transitions TO authenticated;

-- Demo-data isolation (records are kept, flagged, excluded from pilot reporting)
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
UPDATE public.cases SET is_demo = true WHERE case_ref IN ('BR-CASE-2026-0001','BR-CASE-2026-0002','BR-CASE-2026-0003','BR-CASE-2026-0004','BR-CASE-2026-0005','BR-CASE-2026-0006');
UPDATE public.invoices SET is_demo = true WHERE case_id IN (SELECT id FROM public.cases WHERE is_demo);
INSERT INTO public.migration_log(phase, note, snapshot) VALUES ('phase6', 'Demo data flagged (is_demo) on 6 cases and linked invoices; standalone message retained as general/unassigned; UPDATE owner checks hardened',
  jsonb_build_object('demo_cases', (SELECT count(*) FROM public.cases WHERE is_demo), 'demo_invoices', (SELECT count(*) FROM public.invoices WHERE is_demo)));