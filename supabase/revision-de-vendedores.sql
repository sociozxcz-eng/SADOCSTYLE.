create policy "Designated reviewer reads listings" on public.clothing_listings
for select to authenticated using ((select auth.jwt())->'app_metadata'->>'clothing_reviewer'='true');
create policy "Designated reviewer moderates pending listings" on public.clothing_listings
for update to authenticated using (status='pending' and (select auth.jwt())->'app_metadata'->>'clothing_reviewer'='true')
with check (status in ('approved','rejected') and (select auth.jwt())->'app_metadata'->>'clothing_reviewer'='true');
