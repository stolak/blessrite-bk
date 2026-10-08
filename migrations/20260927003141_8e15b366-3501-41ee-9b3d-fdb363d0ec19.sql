CREATE OR REPLACE FUNCTION public.recognise_invoice(_invoice_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv record; c record; o_id uuid; o_type text; o_name text; o_rate numeric; rate numeric; comm numeric; ex jsonb; pid uuid;
BEGIN
  SELECT * INTO inv FROM public.invoices WHERE id = _invoice_id;
  IF EXISTS (SELECT 1 FROM public.ledger_entries WHERE invoice_id = _invoice_id AND entry_type = 'customer_charge') THEN RETURN; END IF;
  SELECT * INTO c FROM public.cases WHERE id = inv.case_id;
  ex := jsonb_build_object('vehicle_id', c.vehicle_id, 'rule', jsonb_build_object('tax_rate', inv.tax_rate_applied));
  PERFORM public.ledger_post('customer_charge', inv.total, 'Invoice ' || inv.invoice_number, inv, ex);
  PERFORM public.ledger_post('tax', inv.tax, 'Tax collected on ' || inv.invoice_number, inv, ex);
  SELECT id, org_type, legal_name, commission_rate INTO o_id, o_type, o_name, o_rate FROM public.organizations WHERE id = c.assigned_org_id;
  IF o_id IS NOT NULL AND o_type = 'repair_shop' THEN
    rate := coalesce(o_rate, public.config_value('shop_commission_rate', now()), 0);
    comm := round(inv.subtotal * rate, 2);
    ex := ex || jsonb_build_object('org_id', o_id, 'rule', jsonb_build_object('tax_rate', inv.tax_rate_applied, 'shop_commission_rate', rate));
    PERFORM public.ledger_post('shop_charge', inv.subtotal, 'Repair work by ' || o_name, inv, ex);
    PERFORM public.ledger_post('shop_commission', comm, 'BlessRite commission', inv, ex);
    INSERT INTO public.payouts (beneficiary_type, org_id, case_id, source_type, source_id, gross, fees, taxes, net, rule_snapshot)
    VALUES ('shop', o_id, inv.case_id, 'invoice', inv.id, inv.subtotal, comm, 0, inv.subtotal - comm, ex->'rule')
    ON CONFLICT DO NOTHING RETURNING id INTO pid;
    PERFORM public.ledger_post('shop_payout_obligation', inv.subtotal - comm, 'Owed to ' || o_name, inv, ex || jsonb_build_object('payout_id', pid));
  ELSIF c.origin = 'roadside' THEN
    PERFORM public.ledger_post('roadside_revenue', inv.subtotal, 'Roadside revenue', inv, ex);
  ELSE
    PERFORM public.ledger_post('service_revenue', inv.subtotal, 'BlessRite service revenue', inv, ex);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.record_adjustment(_invoice_id uuid, _payout_id uuid, _amount numeric, _reason text, _reference text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv record; po record; aid uuid; cid uuid;
BEGIN
  IF NOT private.is_finance(auth.uid()) THEN RAISE EXCEPTION 'Only an Admin can record adjustments.'; END IF;
  IF coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'An adjustment requires a reason.'; END IF;
  IF coalesce(_amount,0) = 0 THEN RAISE EXCEPTION 'Enter a non-zero amount.'; END IF;
  IF _invoice_id IS NOT NULL THEN
    SELECT * INTO inv FROM public.invoices WHERE id = _invoice_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found.'; END IF;
    cid := inv.case_id;
    INSERT INTO public.adjustments (target, invoice_id, case_id, customer_id, amount, reason, reference, actor_id)
    VALUES ('invoice', inv.id, inv.case_id, inv.user_id, _amount, _reason, nullif(btrim(_reference),''), auth.uid()) RETURNING id INTO aid;
    PERFORM public.ledger_post('adjustment', _amount, 'Invoice adjustment: ' || _reason, inv, jsonb_build_object('adjustment_id', aid));
    PERFORM public.refresh_invoice_payment(inv.id);
  ELSIF _payout_id IS NOT NULL THEN
    SELECT * INTO po FROM public.payouts WHERE id = _payout_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payout not found.'; END IF;
    IF po.status IN ('Payout Completed','Reversed') THEN RAISE EXCEPTION 'Completed or reversed payouts cannot be adjusted; record a new obligation instead.'; END IF;
    IF po.net + _amount < 0 THEN RAISE EXCEPTION 'The adjustment would make the payout negative.'; END IF;
    cid := po.case_id;
    INSERT INTO public.adjustments (target, payout_id, case_id, amount, reason, reference, actor_id)
    VALUES ('payout', po.id, po.case_id, _amount, _reason, nullif(btrim(_reference),''), auth.uid()) RETURNING id INTO aid;
    UPDATE public.payouts SET adjustments = adjustments + _amount, net = net + _amount,
      status = CASE WHEN status = 'Payout Approved' THEN 'Payout Pending' ELSE status END, updated_at = now() WHERE id = po.id;
    INSERT INTO public.ledger_entries (entry_type, amount, description, case_id, org_id, beneficiary_user_id, payout_id, adjustment_id, created_by)
    VALUES ('adjustment', _amount, 'Payout adjustment: ' || _reason, po.case_id, po.org_id, po.beneficiary_user_id, po.id, aid, auth.uid());
  ELSE RAISE EXCEPTION 'Choose an invoice or a payout.'; END IF;
  INSERT INTO public.audit_events (actor_id, action, entity_type, entity_id, case_id, after, reason)
  VALUES (auth.uid(), 'adjustment.recorded', 'adjustment', aid, cid, jsonb_build_object('amount', _amount, 'reference', _reference), _reason);
  RETURN aid;
END $$;
REVOKE ALL ON FUNCTION public.recognise_invoice(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_adjustment(uuid,uuid,numeric,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_adjustment(uuid,uuid,numeric,text,text) TO authenticated;