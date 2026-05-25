create policy "branches_update_branch_manager"
on public.branches
for update
to authenticated
using (
  exists (
    select 1 from public.tenant_memberships tm
    where tm.profile_id = auth.uid()
      and tm.tenant_id  = branches.tenant_id
      and tm.branch_id  = branches.id
      and tm.is_active  = true
      and tm.role       = 'branch_manager'
  )
)
with check (
  exists (
    select 1 from public.tenant_memberships tm
    where tm.profile_id = auth.uid()
      and tm.tenant_id  = branches.tenant_id
      and tm.branch_id  = branches.id
      and tm.is_active  = true
      and tm.role       = 'branch_manager'
  )
);