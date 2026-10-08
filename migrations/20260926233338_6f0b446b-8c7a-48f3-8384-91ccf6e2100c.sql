ALTER TABLE public.transport_jobs ADD COLUMN IF NOT EXISTS customer_id uuid;
UPDATE public.transport_jobs t SET customer_id = c.customer_id FROM public.cases c WHERE c.id = t.case_id AND t.customer_id IS NULL;
CREATE OR REPLACE FUNCTION public.transport_set_customer() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN SELECT customer_id INTO NEW.customer_id FROM public.cases WHERE id = NEW.case_id; RETURN NEW; END $$;
CREATE TRIGGER transport_jobs_customer BEFORE INSERT ON public.transport_jobs FOR EACH ROW EXECUTE FUNCTION public.transport_set_customer();
REVOKE EXECUTE ON FUNCTION public.transport_set_customer() FROM PUBLIC, anon, authenticated;