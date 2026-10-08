
-- roles
CREATE TYPE public.app_role AS ENUM ('admin','staff','customer');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','staff'));
$$;

CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  phone text,
  address text,
  city text,
  province text DEFAULT 'Manitoba',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles select" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "profiles insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.is_staff(auth.uid())) WITH CHECK (true);
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'phone')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'customer') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- vehicles
CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year integer,
  make text NOT NULL,
  model text NOT NULL,
  vin text,
  plate text,
  colour text,
  mileage integer,
  photo_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vehicles select" ON public.vehicles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "vehicles insert" ON public.vehicles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "vehicles update" ON public.vehicles FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid())) WITH CHECK (true);
CREATE POLICY "vehicles delete" ON public.vehicles FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER vehicles_updated BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- trusted repair shops
CREATE TABLE public.repair_shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  phone text,
  contact_person text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repair_shops TO authenticated;
GRANT ALL ON public.repair_shops TO service_role;
ALTER TABLE public.repair_shops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shops select" ON public.repair_shops FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "shops insert" ON public.repair_shops FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "shops update" ON public.repair_shops FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "shops delete" ON public.repair_shops FOR DELETE TO authenticated USING (user_id = auth.uid());

-- bookings
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  shop_id uuid REFERENCES public.repair_shops(id) ON DELETE SET NULL,
  service_type text NOT NULL,
  description text,
  preferred_date date,
  preferred_time text,
  location text,
  needs_pickup boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'Requested',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bookings select" ON public.bookings FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "bookings insert" ON public.bookings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "bookings update" ON public.bookings FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid())) WITH CHECK (true);
CREATE TRIGGER bookings_updated BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.booking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  status text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.booking_events TO authenticated;
GRANT ALL ON public.booking_events TO service_role;
ALTER TABLE public.booking_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events select" ON public.booking_events FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND (b.user_id = auth.uid() OR public.is_staff(auth.uid())))
);
CREATE POLICY "events insert" ON public.booking_events FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND (b.user_id = auth.uid() OR public.is_staff(auth.uid())))
);

-- roadside
CREATE TABLE public.roadside_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  issue_type text NOT NULL,
  description text,
  location text,
  latitude double precision,
  longitude double precision,
  contact_name text,
  contact_phone text NOT NULL,
  vehicle_info text,
  status text NOT NULL DEFAULT 'Requested',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.roadside_requests TO authenticated;
GRANT ALL ON public.roadside_requests TO service_role;
ALTER TABLE public.roadside_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roadside select" ON public.roadside_requests FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "roadside insert" ON public.roadside_requests FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "roadside update" ON public.roadside_requests FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid())) WITH CHECK (true);
CREATE TRIGGER roadside_updated BEFORE UPDATE ON public.roadside_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- estimates
CREATE TABLE public.estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  parts_cost numeric(10,2) NOT NULL DEFAULT 0,
  labour_cost numeric(10,2) NOT NULL DEFAULT 0,
  tax numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL DEFAULT 0,
  decision text NOT NULL DEFAULT 'Pending',
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.estimates TO authenticated;
GRANT ALL ON public.estimates TO service_role;
ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "estimates select" ON public.estimates FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "estimates insert" ON public.estimates FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "estimates update" ON public.estimates FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid())) WITH CHECK (true);

-- messages
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_staff boolean NOT NULL DEFAULT false,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages select" ON public.messages FOR SELECT TO authenticated USING (customer_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "messages insert" ON public.messages FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid() AND (customer_id = auth.uid() OR public.is_staff(auth.uid())));

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
