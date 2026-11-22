create schema if not exists sadoc_support;
revoke all on schema sadoc_support from public, anon, authenticated;
create table sadoc_support.chats (
  id uuid primary key default gen_random_uuid(),
  access_key uuid not null unique,
  transcript text not null check (length(transcript) between 1 and 24000),
  updated_at timestamptz not null default now()
);
create table sadoc_support.messages (
  id bigint generated always as identity primary key,
  chat_id uuid not null references sadoc_support.chats,
  request_id uuid not null,
  staff boolean not null,
  body text not null check (length(trim(body)) between 1 and 400),
  unique(chat_id,request_id)
);
create index on sadoc_support.messages(chat_id,id);
create index on sadoc_support.chats(updated_at desc);
create function public.sadoc_open_chat(k uuid, transcript_text text) returns uuid
language sql security definer set search_path='' as $$
  insert into sadoc_support.chats(access_key, transcript) values(k,transcript_text)
  on conflict(access_key) do update set access_key=excluded.access_key returning id;
$$;
create table sadoc_support.agents (
  account_id uuid primary key references auth.users(id) on delete cascade
);
create function public.sadoc_chat_agent() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from sadoc_support.agents where account_id=auth.uid());
$$;
revoke all on function public.sadoc_chat_agent() from public, anon, authenticated;
grant execute on function public.sadoc_chat_agent() to authenticated;
create function public.sadoc_chat_inbox() returns table(chat uuid, updated_at timestamptz)
language sql security definer set search_path='' as $$
  select id, updated_at from sadoc_support.chats
  where public.sadoc_chat_agent() order by updated_at desc;
$$;
create function public.sadoc_chat_read(chat uuid, k uuid) returns jsonb
language sql security definer set search_path='' as $$
  select jsonb_build_object('transcript',c.transcript,'messages',coalesce((
    select jsonb_agg(jsonb_build_object('staff',m.staff,'body',m.body) order by m.id)
    from sadoc_support.messages m where m.chat_id=c.id),'[]'::jsonb))
  from sadoc_support.chats c where c.id=chat and
    (c.access_key=k or public.sadoc_chat_agent());
$$;
create function public.sadoc_chat_send(chat uuid,k uuid,request uuid,body_text text) returns void
language plpgsql security definer set search_path='' as $$
declare staff_reply boolean := k is null and public.sadoc_chat_agent();
begin
  if not exists(select 1 from sadoc_support.chats where id=chat and (access_key=k or staff_reply)) then
    raise insufficient_privilege;
  end if;
  insert into sadoc_support.messages(chat_id,request_id,staff,body) values(chat,request,staff_reply,body_text)
  on conflict(chat_id,request_id) do nothing;
  if found then update sadoc_support.chats set updated_at=now() where id=chat; end if;
end $$;
revoke all on function public.sadoc_open_chat(uuid,text),public.sadoc_chat_inbox(),public.sadoc_chat_read(uuid,uuid),public.sadoc_chat_send(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.sadoc_chat_inbox() to authenticated;
grant execute on function public.sadoc_open_chat(uuid,text),public.sadoc_chat_read(uuid,uuid),public.sadoc_chat_send(uuid,uuid,uuid,text) to anon,authenticated;
