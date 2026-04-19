-- Email accounts: platform admin full access
CREATE POLICY "email_accounts_select_platform_admin"
  ON public.email_accounts FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY "email_accounts_insert_platform_admin"
  ON public.email_accounts FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY "email_accounts_update_platform_admin"
  ON public.email_accounts FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY "email_accounts_delete_platform_admin"
  ON public.email_accounts FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'platform_admin'::app_role));

-- Email outbox: platform admin select + update
CREATE POLICY "email_outbox_select_platform_admin"
  ON public.email_outbox FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY "email_outbox_update_platform_admin"
  ON public.email_outbox FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_admin'::app_role));