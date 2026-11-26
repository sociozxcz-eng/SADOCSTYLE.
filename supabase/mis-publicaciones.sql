create function public.mis_publicaciones(desde integer default 0)
returns table(id uuid, name text, price bigint, image text, status text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id,p.name,p.price,p.image,p.status,p.created_at
  from public.clothing_listings p where p.seller_id = (select auth.uid())
  order by p.created_at desc,p.id desc
  limit 7 offset greatest(desde,0)
$$;
revoke all on function public.mis_publicaciones(integer) from public,anon;
grant execute on function public.mis_publicaciones(integer) to authenticated;
