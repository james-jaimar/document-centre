ALTER TABLE public.delivery_zone_locations ADD COLUMN IF NOT EXISTS notes text;
CREATE UNIQUE INDEX IF NOT EXISTS delivery_zone_locations_unique_idx
  ON public.delivery_zone_locations (zone_id, match_type, lower(value), country);