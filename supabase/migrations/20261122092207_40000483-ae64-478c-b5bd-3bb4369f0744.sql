CREATE OR REPLACE FUNCTION public.bookshelf_enabled(p_tenant_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.tenant_settings WHERE tenant_id=p_tenant_id AND category='bookshelf' AND setting_key='enabled' AND setting_value='true'::jsonb AND is_sensitive=false) $$;
REVOKE ALL ON FUNCTION public.bookshelf_enabled(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bookshelf_enabled(uuid) TO anon, authenticated, service_role;
CREATE TABLE public.bookshelf_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE, app_id uuid NOT NULL, branch_id uuid,
 name text NOT NULL, sku text, snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, revision integer NOT NULL DEFAULT 1,
 revision_history jsonb NOT NULL DEFAULT '[]'::jsonb, archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bookshelf_items TO authenticated;
GRANT ALL ON public.bookshelf_items TO service_role;
ALTER TABLE public.bookshelf_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY bookshelf_owner_read ON public.bookshelf_items FOR SELECT TO authenticated USING (
 profile_id=auth.uid() AND archived_at IS NULL AND public.bookshelf_enabled(tenant_id)
 AND COALESCE((auth.jwt()->>'is_anonymous')::boolean,false)=false
 AND (public.current_storefront_tenant_id() IS NULL OR tenant_id=public.current_storefront_tenant_id())
 AND EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.profile_id=auth.uid() AND m.tenant_id=bookshelf_items.tenant_id AND m.is_active)
);
CREATE INDEX bookshelf_owner_tenant_idx ON public.bookshelf_items(profile_id,tenant_id) WHERE archived_at IS NULL;
CREATE TRIGGER bookshelf_updated BEFORE UPDATE ON public.bookshelf_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE FUNCTION public.commit_bookshelf_operation(p_actor uuid,p_tenant uuid,p_action text,p_id uuid,p_data jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookshelf_items; snap jsonb; d jsonb; s jsonb; oid uuid; iid uuid; source_item public.order_items; source_order public.orders;
BEGIN
 IF NOT public.bookshelf_enabled(p_tenant) THEN RAISE EXCEPTION 'Bookshelf is not enabled for this tenant'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.tenant_memberships WHERE profile_id=p_actor AND tenant_id=p_tenant AND is_active) THEN RAISE EXCEPTION 'No active tenant membership'; END IF;
 IF p_action <> 'create' THEN
  SELECT * INTO b FROM public.bookshelf_items WHERE id=p_id AND profile_id=p_actor AND tenant_id=p_tenant AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bookshelf product not found'; END IF;
  IF p_action IN ('revise','restore') AND b.revision <> (p_data->>'expected_revision')::integer THEN RAISE EXCEPTION 'This product changed. Reload your bookshelf.'; END IF;
 END IF;
 IF p_action IN ('create','revise','rename') THEN
  IF length(trim(coalesce(p_data->>'name',''))) NOT BETWEEN 1 AND 160 OR length(coalesce(p_data->>'sku',''))>80 THEN RAISE EXCEPTION 'Enter a product name (up to 160 characters) and SKU (up to 80)'; END IF;
 END IF;
 IF p_action IN ('create','revise') THEN
  SELECT * INTO source_item FROM public.order_items WHERE id=(p_data->>'source_item_id')::uuid;
  SELECT * INTO source_order FROM public.orders WHERE id=source_item.order_id AND user_id=p_actor AND tenant_id=p_tenant FOR UPDATE;
  IF source_order.id IS NULL THEN RAISE EXCEPTION 'Source product not found'; END IF;
  IF p_action='revise' AND (source_order.order_status<>'draft' OR source_order.metadata->>'bookshelf_item_id'<>p_id::text OR source_order.metadata->>'bookshelf_revision'<>b.revision::text) THEN RAISE EXCEPTION 'Revise a fresh copy of this bookshelf product'; END IF;
  snap := p_data->'snapshot';
  IF coalesce(jsonb_array_length(snap->'documents'),0)=0 OR coalesce((snap->'spec'->>'page_count')::integer,0)<=0 THEN RAISE EXCEPTION 'Configure and assign a PDF before saving'; END IF;
  IF p_action='create' THEN
   INSERT INTO public.bookshelf_items(id,profile_id,tenant_id,app_id,branch_id,name,sku,snapshot)
    VALUES(p_id,p_actor,p_tenant,source_order.app_id,source_order.branch_id,trim(p_data->>'name'),nullif(trim(p_data->>'sku'),''),snap);
  ELSE
   UPDATE public.bookshelf_items SET name=trim(p_data->>'name'),sku=nullif(trim(p_data->>'sku'),''),snapshot=snap,revision=revision+1,
    revision_history=revision_history||jsonb_build_array(jsonb_build_object('revision',revision,'snapshot',snapshot,'saved_at',updated_at)) WHERE id=p_id;
  END IF;
 ELSIF p_action='rename' THEN
  UPDATE public.bookshelf_items SET name=trim(p_data->>'name'),sku=nullif(trim(p_data->>'sku'),'') WHERE id=p_id;
 ELSIF p_action='archive' THEN
  UPDATE public.bookshelf_items SET archived_at=now() WHERE id=p_id;
 ELSIF p_action='restore' THEN
  snap:=p_data->'snapshot'; oid:=(p_data->>'order_id')::uuid; iid:=(p_data->>'item_id')::uuid;
  IF coalesce((p_data->>'quantity')::integer,0)<1 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
  IF b.branch_id IS NOT NULL AND NOT public.branch_subscription_active(b.branch_id) THEN RAISE EXCEPTION 'Ordering is paused for this branch'; END IF;
  INSERT INTO public.orders(id,user_id,ordered_by_profile_id,tenant_id,app_id,branch_id,order_status,total_price,metadata)
   VALUES(oid,p_actor,p_actor,b.tenant_id,b.app_id,b.branch_id,'draft',0,jsonb_build_object('bookshelf_item_id',b.id,'bookshelf_revision',b.revision));
  INSERT INTO public.order_items(id,order_id,product_family_id,title,quantity,unit_price,build_status,spec)
   VALUES(iid,oid,(b.snapshot->>'product_family_id')::uuid,b.name,(p_data->>'quantity')::integer,0,'building',jsonb_set(snap->'spec','{quantity}',to_jsonb((p_data->>'quantity')::integer)));
  FOR d IN SELECT value FROM jsonb_array_elements(snap->'documents') LOOP
   INSERT INTO public.documents(id,order_item_id,file_name,file_path,file_size,mime_type,page_count,page_width_mm,page_height_mm,document_status,preflight_data,thumbnail_urls,sort_order,backend_asset_id)
    VALUES((d->>'id')::uuid,iid,d->>'file_name',d->>'file_path',(d->>'file_size')::bigint,d->>'mime_type',(d->>'page_count')::integer,(d->>'page_width_mm')::numeric,(d->>'page_height_mm')::numeric,(d->>'document_status')::public.document_status,d->'preflight_data',d->'thumbnail_urls',coalesce((d->>'sort_order')::integer,0),nullif(d->>'backend_asset_id','')::uuid);
  END LOOP;
  FOR s IN SELECT value FROM jsonb_array_elements(snap->'sections') LOOP
   INSERT INTO public.document_sections(order_item_id,document_id,section_type,page_range_start,page_range_end,paper_stock,paper_weight_gsm,is_color,is_duplex,lamination,sort_order,label,color,bank_position)
    VALUES(iid,nullif(s->>'document_id','')::uuid,(s->>'section_type')::public.section_type,(s->>'page_range_start')::integer,(s->>'page_range_end')::integer,s->>'paper_stock',(s->>'paper_weight_gsm')::integer,(s->>'is_color')::boolean,(s->>'is_duplex')::boolean,s->>'lamination',(s->>'sort_order')::integer,s->>'label',s->>'color',(s->>'bank_position')::smallint);
  END LOOP;
  RETURN jsonb_build_object('order_id',oid);
 ELSE RAISE EXCEPTION 'Unknown bookshelf operation'; END IF;
 RETURN jsonb_build_object('id',p_id);
END $$;
REVOKE ALL ON FUNCTION public.commit_bookshelf_operation(uuid,uuid,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_bookshelf_operation(uuid,uuid,text,uuid,jsonb) TO service_role;