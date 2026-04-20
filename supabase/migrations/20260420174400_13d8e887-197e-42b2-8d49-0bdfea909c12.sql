ALTER TABLE public.orders
  ADD CONSTRAINT orders_ordered_by_profile_fk
  FOREIGN KEY (ordered_by_profile_id)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;