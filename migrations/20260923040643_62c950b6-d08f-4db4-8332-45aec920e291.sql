
REVOKE EXECUTE ON FUNCTION public.after_estimate_approval() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_estimate_approval() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.case_completion_effects() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.estimate_sent_effects() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_case_approval() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inspection_published_after() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inspection_published_effects() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_estimate_version() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recalc_estimate_totals() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_customer(uuid,uuid,text,text,text,text) FROM PUBLIC;
