CREATE POLICY "bookings staff insert" ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (private.is_ops(auth.uid()) AND created_by_staff_id = auth.uid());