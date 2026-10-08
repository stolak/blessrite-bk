
CREATE POLICY "case media own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'case-media' AND ((storage.foldername(name))[1] = auth.uid()::text OR private.is_ops(auth.uid())));
CREATE POLICY "case media own insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'case-media' AND ((storage.foldername(name))[1] = auth.uid()::text OR private.is_ops(auth.uid())));
CREATE POLICY "case media own delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'case-media' AND ((storage.foldername(name))[1] = auth.uid()::text OR private.is_ops(auth.uid())));
