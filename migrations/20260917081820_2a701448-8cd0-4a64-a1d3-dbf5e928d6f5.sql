CREATE TABLE public.availability_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  slot_kind text NOT NULL DEFAULT 'Drop-off',
  capacity integer NOT NULL DEFAULT 1,
  booked_count integer NOT NULL DEFAULT 0,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX availability_slots_starts_at_idx ON public.availability_slots (starts_at);

GRANT SELECT ON public.availability_slots TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability_slots TO authenticated;
GRANT ALL ON public.availability_slots TO service_role;

ALTER TABLE public.availability_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active slots"
  ON public.availability_slots FOR SELECT
  TO anon, authenticated
  USING (active = true);

CREATE POLICY "Staff manage slots"
  ON public.availability_slots FOR ALL
  TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));

ALTER TABLE public.bookings ADD COLUMN slot_id uuid REFERENCES public.availability_slots(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.sync_slot_booked_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.slot_id IS NOT NULL THEN
      UPDATE public.availability_slots SET booked_count = booked_count + 1, updated_at = now() WHERE id = NEW.slot_id;
      SELECT starts_at INTO NEW.scheduled_at FROM public.availability_slots WHERE id = NEW.slot_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.slot_id IS DISTINCT FROM OLD.slot_id THEN
      IF OLD.slot_id IS NOT NULL THEN
        UPDATE public.availability_slots SET booked_count = greatest(booked_count - 1, 0), updated_at = now() WHERE id = OLD.slot_id;
      END IF;
      IF NEW.slot_id IS NOT NULL THEN
        UPDATE public.availability_slots SET booked_count = booked_count + 1, updated_at = now() WHERE id = NEW.slot_id;
        SELECT starts_at INTO NEW.scheduled_at FROM public.availability_slots WHERE id = NEW.slot_id;
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.slot_id IS NOT NULL THEN
      UPDATE public.availability_slots SET booked_count = greatest(booked_count - 1, 0), updated_at = now() WHERE id = OLD.slot_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bookings_sync_slot_ins
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_slot_booked_count();

CREATE TRIGGER bookings_sync_slot_upd
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_slot_booked_count();

CREATE TRIGGER bookings_sync_slot_del
  AFTER DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_slot_booked_count();