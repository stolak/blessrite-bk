
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','staff'));
$$;
CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
GRANT EXECUTE ON FUNCTION private.is_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;

DROP POLICY "users read own roles" ON public.user_roles;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR private.is_staff(auth.uid()));

DROP POLICY "profiles select" ON public.profiles;
CREATE POLICY "profiles select" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR private.is_staff(auth.uid()));
DROP POLICY "profiles update" ON public.profiles;
CREATE POLICY "profiles update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR private.is_staff(auth.uid())) WITH CHECK (true);

DROP POLICY "vehicles select" ON public.vehicles;
CREATE POLICY "vehicles select" ON public.vehicles FOR SELECT TO authenticated USING (user_id = auth.uid() OR private.is_staff(auth.uid()));
DROP POLICY "vehicles update" ON public.vehicles;
CREATE POLICY "vehicles update" ON public.vehicles FOR UPDATE TO authenticated USING (user_id = auth.uid() OR private.is_staff(auth.uid())) WITH CHECK (true);

DROP POLICY "shops select" ON public.repair_shops;
CREATE POLICY "shops select" ON public.repair_shops FOR SELECT TO authenticated USING (user_id = auth.uid() OR private.is_staff(auth.uid()));

DROP POLICY "bookings select" ON public.bookings;
CREATE POLICY "bookings select" ON public.bookings FOR SELECT TO authenticated USING (user_id = auth.uid() OR private.is_staff(auth.uid()));
DROP POLICY "bookings update" ON public.bookings;
CREATE POLICY "bookings update" ON public.bookings FOR UPDATE TO authenticated USING (user_id = auth.uid() OR private.is_staff(auth.uid())) WITH CHECK (true);

DROP POLICY "events select" ON public.booking_events;
CREATE POLICY "events select" ON public.booking_events FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND (b.user_id = auth.uid() OR private.is_staff(auth.uid()))));
DROP POLICY "events insert" ON public.booking_events;
CREATE POLICY "events insert" ON public.booking_events FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND (b.user_id = auth.uid() OR private.is_staff(auth.uid()))));

DROP POLICY "roadside select" ON public.roadside_requests;
CREATE POLICY "roadside select" ON public.roadside_requests FOR SELECT TO authenticated USING (user_id = auth.uid() OR private.is_staff(auth.uid()));
DROP POLICY "roadside update" ON public.roadside_requests;
CREATE POLICY "roadside update" ON public.roadside_requests FOR UPDATE TO authenticated USING (user_id = auth.uid() OR private.is_staff(auth.uid())) WITH CHECK (true);

DROP POLICY "estimates select" ON public.estimates;
CREATE POLICY "estimates select" ON public.estimates FOR SELECT TO authenticated USING (user_id = auth.uid() OR private.is_staff(auth.uid()));
DROP POLICY "estimates insert" ON public.estimates;
CREATE POLICY "estimates insert" ON public.estimates FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
DROP POLICY "estimates update" ON public.estimates;
CREATE POLICY "estimates update" ON public.estimates FOR UPDATE TO authenticated USING (user_id = auth.uid() OR private.is_staff(auth.uid())) WITH CHECK (true);

DROP POLICY "messages select" ON public.messages;
CREATE POLICY "messages select" ON public.messages FOR SELECT TO authenticated USING (customer_id = auth.uid() OR private.is_staff(auth.uid()));
DROP POLICY "messages insert" ON public.messages;
CREATE POLICY "messages insert" ON public.messages FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid() AND (customer_id = auth.uid() OR private.is_staff(auth.uid())));

DROP FUNCTION public.is_staff(uuid);
DROP FUNCTION public.has_role(uuid, public.app_role);
