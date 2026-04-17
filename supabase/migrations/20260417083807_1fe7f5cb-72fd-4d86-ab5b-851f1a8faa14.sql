TRUNCATE TABLE
  public.status_history,
  public.messages,
  public.job_proofs,
  public.payments,
  public.order_pricing_snapshots,
  public.order_documents,
  public.order_addresses,
  public.order_jobs,
  public.document_sections,
  public.documents,
  public.order_items,
  public.orders,
  public.derived_files,
  public.jobs,
  public.assets
RESTART IDENTITY CASCADE;