CREATE OR REPLACE FUNCTION public.validate_branch_url_slug() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE reserved text[] := ARRAY['orders','bookshelf','cart','checkout','account','auth','dashboard','print-centre','settings','terms','privacy','upload','t','admin','platform','branch','app','api','public','assets','static'];
BEGIN
 IF NEW.url_slug IS NOT NULL THEN
  IF NEW.url_slug !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' THEN RAISE EXCEPTION 'url_slug must be lowercase alphanumeric with optional hyphens (got: %)', NEW.url_slug; END IF;
  IF NEW.url_slug = ANY(reserved) THEN RAISE EXCEPTION 'url_slug "%" is a reserved word', NEW.url_slug; END IF;
 END IF;
 RETURN NEW;
END $$;