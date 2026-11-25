-- Three most recent reviewed listings establish a seller's current track record.
alter table public.clothing_listings add column review_priority boolean not null default false;
create index clothing_seller_recent on public.clothing_listings (seller_id, created_at desc, id desc);

create function sadoc_moderation.set_review_priority() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.seller_id::text, 0));
  select count(*) = 3 and count(*) filter (where status = 'approved') = 3
    into new.review_priority
    from (select status from public.clothing_listings
          where seller_id = new.seller_id and status <> 'pending'
          order by created_at desc, id desc limit 3) last_reviews;
  if not new.review_priority and exists (
    select 1 from public.clothing_listings where seller_id = new.seller_id
      and created_at >= (date_trunc('day', now() at time zone 'America/Bogota') at time zone 'America/Bogota')
  ) then
    raise exception using errcode = 'P0001',
      message = 'SADOC_DAILY_LIMIT';
  end if;
  return new;
end;
$$;
revoke all on function sadoc_moderation.set_review_priority() from public, anon, authenticated;
create trigger clothing_submission_limit before insert on public.clothing_listings
for each row execute function sadoc_moderation.set_review_priority();

-- A bounded head start gives established sellers priority while older listings keep advancing.
create function public.clothing_review_queue() returns table(id uuid)
language sql stable set search_path = '' as $$
  select p.id from public.clothing_listings p where p.status = 'pending'
  order by p.created_at - case when p.review_priority then interval '30 minutes' else interval '0' end, p.id
  limit 20;
$$;
revoke all on function public.clothing_review_queue() from public, anon, authenticated;
grant execute on function public.clothing_review_queue() to service_role;
