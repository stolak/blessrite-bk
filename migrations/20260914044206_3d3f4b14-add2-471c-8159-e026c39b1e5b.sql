CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','staff','superadmin')); $$;

CREATE OR REPLACE FUNCTION private.is_superadmin(_user_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'superadmin'); $$;

REVOKE ALL ON FUNCTION private.is_superadmin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_superadmin(uuid) TO authenticated, service_role;

CREATE POLICY "superadmin manage roles insert" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (private.is_superadmin(auth.uid()));
CREATE POLICY "superadmin manage roles update" ON public.user_roles
  FOR UPDATE TO authenticated USING (private.is_superadmin(auth.uid())) WITH CHECK (private.is_superadmin(auth.uid()));
CREATE POLICY "superadmin manage roles delete" ON public.user_roles
  FOR DELETE TO authenticated USING (private.is_superadmin(auth.uid()) AND role <> 'superadmin');

GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;