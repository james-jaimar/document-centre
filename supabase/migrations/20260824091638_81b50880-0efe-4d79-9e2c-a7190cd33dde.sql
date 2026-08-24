DROP POLICY IF EXISTS "Admins and branch managers can manage branch settings" ON public.branch_settings;

CREATE POLICY "Authorised staff can manage branch settings"
ON public.branch_settings
FOR ALL
TO authenticated
USING (public.user_can_manage_branch(branch_id))
WITH CHECK (public.user_can_manage_branch(branch_id));