begin;

create table public.clothing_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 70),
  price bigint not null check (price between 1000 and 1000000000000),
  description text not null default '' check (char_length(description) <= 400),
  image text not null check (
    char_length(image) <= 650000 and image ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'
  ),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);
create index clothing_listings_status_date on public.clothing_listings (status, created_at desc);
create index clothing_listings_seller on public.clothing_listings (seller_id);

alter table public.clothing_listings enable row level security;
revoke all on public.clothing_listings from public, anon, authenticated;
grant select (id, name, price, description, image, status, created_at)
  on public.clothing_listings to anon, authenticated;
grant insert (name, price, description, image) on public.clothing_listings to authenticated;
grant update (status) on public.clothing_listings to authenticated;

create policy "Visitors can see approved listings" on public.clothing_listings
  for select to anon, authenticated using (status = 'approved');

create policy "Sellers can see their listings" on public.clothing_listings
  for select to authenticated using (seller_id = (select auth.uid()));

create policy "Sellers can submit pending listings" on public.clothing_listings
  for insert to authenticated
  with check (seller_id = (select auth.uid()) and status = 'pending');

create policy "Owner can review all listings" on public.clothing_listings
  for select to authenticated
  using (((select auth.jwt()) -> 'app_metadata' ->> 'sadoc_role') = 'owner');

create policy "Owner can approve or reject pending listings" on public.clothing_listings
  for update to authenticated
  using (status = 'pending' and ((select auth.jwt()) -> 'app_metadata' ->> 'sadoc_role') = 'owner')
  with check (status in ('approved', 'rejected') and ((select auth.jwt()) -> 'app_metadata' ->> 'sadoc_role') = 'owner');

commit;
