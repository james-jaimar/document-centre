CREATE OR REPLACE FUNCTION public.apply_order_artwork_revision(p_document_id uuid, p_actor uuid, p_expected_configuration jsonb, p_configuration jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.order_documents; j public.order_jobs; o public.orders; staff boolean; old_path text;
BEGIN
 SELECT * INTO d FROM public.order_documents WHERE id=p_document_id FOR UPDATE;
 IF d.id IS NULL OR d.document_type <> 'artwork_revision' OR d.created_by IS DISTINCT FROM p_actor OR d.metadata->>'state' <> 'uploading' THEN RAISE EXCEPTION 'Invalid artwork revision'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=d.order_id FOR UPDATE;
 SELECT * INTO j FROM public.order_jobs WHERE id=d.job_id AND order_id=o.id FOR UPDATE;
 IF j.id IS NULL OR j.tenant_id IS DISTINCT FROM d.tenant_id OR o.tenant_id IS DISTINCT FROM d.tenant_id THEN RAISE EXCEPTION 'Invalid tenant context'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.tenant_memberships m WHERE m.profile_id=p_actor AND m.tenant_id=o.tenant_id AND m.is_active AND m.role IN ('owner','admin','sales','production','branch_manager','store_operator') AND (m.branch_id IS NULL OR m.branch_id=o.branch_id)) OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role='platform_admin') INTO staff;
 IF NOT staff AND NOT (o.user_id=p_actor OR o.ordered_by_profile_id=p_actor) THEN RAISE EXCEPTION 'Not authorised'; END IF;
 IF NOT staff AND coalesce(o.admin_status,'') NOT IN ('new_order','under_review') THEN RAISE EXCEPTION 'Customer artwork updates are closed'; END IF;
 IF staff AND coalesce(btrim(d.metadata->>'reason'),'')='' THEN RAISE EXCEPTION 'A reason is required'; END IF;
 IF staff THEN
   IF coalesce(o.admin_status,'') NOT IN ('new_order','under_review','approved','in_production')
      OR coalesce(j.job_status,'') NOT IN ('new','new_job','awaiting_files','awaiting_payment','proof_pending','awaiting_proof','proof_ready','proof_approved','approved_for_production','in_production') THEN
     RAISE EXCEPTION 'Artwork updates are closed once the job goes to print';
   END IF;
 ELSE
   IF coalesce(j.job_status,'') NOT IN ('new','new_job','awaiting_files','awaiting_payment','proof_pending','awaiting_proof','proof_ready','proof_approved','approved_for_production') THEN
     RAISE EXCEPTION 'Customer artwork updates are closed';
   END IF;
 END IF;
 IF j.configuration IS DISTINCT FROM p_expected_configuration THEN RAISE EXCEPTION 'Artwork changed while uploading; reload and try again'; END IF;
 old_path := d.metadata->>'replaces_path';
 UPDATE public.order_documents SET metadata=metadata||jsonb_build_object('state','applied','applied_at',now()), is_customer_visible=true WHERE id=d.id;
 INSERT INTO public.order_documents(app_id,tenant_id,branch_id,order_id,job_id,document_type,file_name,storage_bucket,storage_path,is_customer_visible,created_by,metadata) VALUES(o.app_id,o.tenant_id,o.branch_id,o.id,j.id,'artwork_original',coalesce(d.metadata->>'original_name','Original artwork.pdf'),'s3',old_path,true,p_actor,jsonb_build_object('superseded_by',d.id));
 UPDATE public.order_jobs SET configuration=p_configuration,proof_status='pending',job_status='awaiting_proof',file_status='ready',print_ready_pdf_path=NULL,print_ready_pdf_paths=NULL,print_ready_spec_hash=NULL,print_ready_assembled_at=NULL,imposed_pdf_path=NULL,imposed_components='{}'::jsonb,job_ticket_pdf_path=NULL,assembly_report=NULL,updated_at=now() WHERE id=j.id;
 UPDATE public.job_proofs SET proof_status='rejected',metadata=coalesce(metadata,'{}')||jsonb_build_object('superseded_by_artwork_revision',d.id) WHERE job_id=j.id;
 INSERT INTO public.timeline_events(app_id,tenant_id,branch_id,order_id,job_id,event_type,visibility,actor_type,actor_profile_id,description,metadata) VALUES(o.app_id,o.tenant_id,o.branch_id,o.id,j.id,'artwork_updated','both',CASE WHEN staff THEN 'admin' ELSE 'customer' END,p_actor,'Artwork updated: '||d.file_name||'. New proof review required.',jsonb_build_object('document_id',d.id,'previous_path',old_path,'reason',d.metadata->>'reason'));
 RETURN jsonb_build_object('success',true,'document_id',d.id);
END; $$;
REVOKE ALL ON FUNCTION public.apply_order_artwork_revision(uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_order_artwork_revision(uuid,uuid,jsonb,jsonb) TO service_role;