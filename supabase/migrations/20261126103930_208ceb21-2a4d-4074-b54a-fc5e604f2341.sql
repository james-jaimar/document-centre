ALTER TABLE public.document_sections ADD COLUMN start_on_right boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.document_sections.start_on_right IS 'Perfect-bound body chapters start on recto by default; ignored for other products.';
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.commit_bookshelf_operation(uuid,uuid,text,uuid,jsonb)'::regprocedure) INTO definition;
 IF position('sort_order,label,color,bank_position)' in definition)=0 THEN RAISE EXCEPTION 'Bookshelf restore definition changed'; END IF;
 definition := replace(definition,'sort_order,label,color,bank_position)','sort_order,label,color,bank_position,start_on_right)');
 definition := replace(definition,'(s->>''bank_position'')::smallint);','(s->>''bank_position'')::smallint,coalesce((s->>''start_on_right'')::boolean,true));');
 EXECUTE definition;
END $migration$;