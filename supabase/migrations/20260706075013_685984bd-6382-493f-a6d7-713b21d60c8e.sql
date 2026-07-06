-- Fixed quantity "blocks" for product families (e.g. flyers sold as 50/100/250/500 packs)
ALTER TABLE public.product_families
  ADD COLUMN IF NOT EXISTS quantity_mode text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS quantity_blocks jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.product_families
  DROP CONSTRAINT IF EXISTS product_families_quantity_mode_check;
ALTER TABLE public.product_families
  ADD CONSTRAINT product_families_quantity_mode_check
  CHECK (quantity_mode IN ('free','blocks'));

COMMENT ON COLUMN public.product_families.quantity_mode IS
  'free = numeric spinner; blocks = fixed pack quantities (see quantity_blocks).';
COMMENT ON COLUMN public.product_families.quantity_blocks IS
  'Array of {qty:int, price_minor:int, cost_minor?:int} — pack quantities and their total price in minor currency units. Only used when quantity_mode = ''blocks''.';

-- Seed default flyer blocks on the master flyers family (idempotent — only if still empty)
UPDATE public.product_families
   SET quantity_mode  = 'blocks',
       quantity_blocks = '[
         {"qty":50,   "price_minor":30000,  "cost_minor":12000},
         {"qty":100,  "price_minor":50000,  "cost_minor":20000},
         {"qty":250,  "price_minor":100000, "cost_minor":40000},
         {"qty":500,  "price_minor":175000, "cost_minor":70000},
         {"qty":1000, "price_minor":300000, "cost_minor":120000},
         {"qty":2500, "price_minor":650000, "cost_minor":260000},
         {"qty":5000, "price_minor":1200000,"cost_minor":480000}
       ]'::jsonb
 WHERE slug = 'flyers'
   AND tenant_id IS NULL
   AND (quantity_blocks IS NULL OR jsonb_array_length(quantity_blocks) = 0);
