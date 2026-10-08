-- 1) Move signed-in actions behind non-exposed schema with thin invoker wrappers
DO $$
DECLARE r record; argnames text; callargs text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_arguments(p.oid) fargs,
           pg_get_function_identity_arguments(p.oid) iargs,
           pg_get_function_result(p.oid) res, p.proargnames
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
      AND p.proname IN ('shop_respond','shop_set_case_state','shop_update_profile','driver_update_job','driver_log_incident','place_parts_order','supplier_respond_order','set_parts_order_status','flag_parts_order_exception','clear_parts_order_exception','set_config','set_partner_status','grant_partner_override','record_payment','set_payment_status','issue_refund','payout_action','record_adjustment')
  LOOP
    SELECT string_agg(quote_ident(a), ', ') INTO callargs FROM unnest(r.proargnames) a;
    EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA private', r.proname, r.iargs);
    EXECUTE format('REVOKE ALL ON FUNCTION private.%I(%s) FROM PUBLIC, anon', r.proname, r.iargs);
    EXECUTE format('GRANT EXECUTE ON FUNCTION private.%I(%s) TO authenticated, service_role', r.proname, r.iargs);
    IF r.res = 'void' THEN
      EXECUTE format('CREATE FUNCTION public.%I(%s) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $f$ BEGIN PERFORM private.%I(%s); END $f$', r.proname, r.fargs, r.proname, coalesce(callargs,''));
    ELSE
      EXECUTE format('CREATE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $f$ BEGIN RETURN private.%I(%s); END $f$', r.proname, r.fargs, r.res, r.proname, coalesce(callargs,''));
    END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.iargs);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', r.proname, r.iargs);
  END LOOP;
END $$;

-- 2) Partner applications (public sign-up)
CREATE TABLE public.partner_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_type text NOT NULL CHECK (partner_type IN ('repair_shop','supplier','driver')),
  business_name text,
  contact_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  address text,
  service_area text,
  details text,
  licence_number text,
  capabilities text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'Submitted' CHECK (status IN ('Submitted','Under Review','Approved','Declined')),
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pa_len CHECK (length(contact_name) <= 120 AND length(email) <= 255 AND length(phone) <= 40 AND coalesce(length(details),0) <= 2000)
);
GRANT INSERT ON public.partner_applications TO anon, authenticated;
GRANT SELECT, UPDATE ON public.partner_applications TO authenticated;
GRANT ALL ON public.partner_applications TO service_role;
ALTER TABLE public.partner_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit an application" ON public.partner_applications
  FOR INSERT TO anon, authenticated WITH CHECK (status = 'Submitted' AND reviewed_by IS NULL AND reviewed_at IS NULL);
CREATE POLICY "Admins view applications" ON public.partner_applications
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "Admins review applications" ON public.partner_applications
  FOR UPDATE TO authenticated USING (private.is_finance(auth.uid()))
  WITH CHECK (private.is_finance(auth.uid()));
CREATE TRIGGER audit_partner_applications AFTER UPDATE ON public.partner_applications
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();