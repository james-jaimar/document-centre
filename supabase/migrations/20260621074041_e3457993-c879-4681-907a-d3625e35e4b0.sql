UPDATE public.catalog_papers AS child
   SET stocked_sizes        = master.stocked_sizes,
       is_cover_stock       = master.is_cover_stock,
       is_edge_to_edge_only = master.is_edge_to_edge_only
  FROM public.catalog_papers AS master
 WHERE master.scope_type = 'master'
   AND child.code = master.code
   AND child.scope_type IN ('tenant','branch')
   AND (child.stocked_sizes IS NULL OR child.stocked_sizes = '{}');