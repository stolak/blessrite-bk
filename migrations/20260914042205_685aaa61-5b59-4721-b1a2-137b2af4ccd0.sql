REVOKE ALL ON FUNCTION public.recalc_invoice_totals() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_invoice_routine_booking() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schedule_booking_reminder() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = public AS $$
  SELECT 'BR-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 4, '0');
$$;
REVOKE ALL ON FUNCTION public.next_invoice_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_invoice_number() TO authenticated, service_role;