CREATE OR REPLACE FUNCTION public.protect_estimate_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE st text; ver integer;
BEGIN
  SELECT status, version INTO st, ver FROM public.estimates
    WHERE id = COALESCE(NEW.estimate_id, OLD.estimate_id);
  IF st IS NOT NULL AND st <> 'Draft' THEN
    RAISE EXCEPTION 'Estimate version % has already been issued; its lines cannot be changed. Create a revised estimate instead.', ver
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

REVOKE EXECUTE ON FUNCTION public.protect_estimate_items() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER estimate_items_protect
BEFORE INSERT OR UPDATE OR DELETE ON public.estimate_items
FOR EACH ROW EXECUTE FUNCTION public.protect_estimate_items();