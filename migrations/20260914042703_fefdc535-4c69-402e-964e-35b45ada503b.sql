CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.process_due_reminders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sender uuid; n integer := 0;
BEGIN
  SELECT user_id INTO sender FROM public.user_roles WHERE role IN ('admin','staff') ORDER BY created_at LIMIT 1;
  IF sender IS NULL THEN RETURN 0; END IF;

  WITH due AS (
    SELECT id, booking_id, user_id, message FROM public.booking_reminders
    WHERE status = 'Pending' AND remind_at <= now()
  ), ins AS (
    INSERT INTO public.messages (customer_id, sender_id, from_staff, booking_id, body)
    SELECT user_id, sender, true, booking_id, message FROM due
    RETURNING 1
  )
  UPDATE public.booking_reminders r
     SET status = 'Sent', sent_at = now()
    FROM due WHERE r.id = due.id;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.process_due_reminders() FROM PUBLIC, anon, authenticated;