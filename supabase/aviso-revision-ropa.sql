create extension if not exists http with schema extensions;
create schema if not exists sadoc_moderation;
revoke all on schema sadoc_moderation from public, anon, authenticated;

create or replace function sadoc_moderation.notify_review() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  token text;
  http_status integer;
begin
  select decrypted_secret into token from vault.decrypted_secrets
    where name = 'sadoc_github_review_dispatch' limit 1;
  if nullif(token, '') is null then return null; end if;
  perform set_config('http.curlopt_timeout_ms','2500',true);
  select result.status into http_status from extensions.http((
    'POST','https://api.github.com/repos/sociozxcz-eng/SADOCSTYLE./actions/workflows/revision-ropa.yml/dispatches',
    array[extensions.http_header('Authorization','Bearer ' || token),
          extensions.http_header('User-Agent','SADOCSTYLE-review'),
          extensions.http_header('Accept','application/vnd.github+json')],
    'application/json','{"ref":"main"}'
  )::extensions.http_request) result;
  if http_status not between 200 and 299 then
    raise warning 'SADOCSTYLE: revisión inmediata pendiente, HTTP %', http_status;
  end if;
  return null;
exception when others then
  raise warning 'SADOCSTYLE: revisión inmediata no disponible; se conserva el turno periódico';
  return null;
end;
$$;
revoke all on function sadoc_moderation.notify_review() from public,anon,authenticated;
create trigger clothing_review_on_insert after insert on public.clothing_listings
for each row when (new.status = 'pending') execute function sadoc_moderation.notify_review();