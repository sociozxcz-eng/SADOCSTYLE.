create extension if not exists pg_net;
create extension if not exists pg_cron;
create table sadoc_support.request_counter(total bigint not null);
insert into sadoc_support.request_counter values(0);
create table sadoc_support.mail_batches (
  batch bigint primary key, queued_at timestamptz not null default now(),
  request_id bigint, attempted_at timestamptz, accepted_at timestamptz
);
create function sadoc_support.count_request() returns trigger language plpgsql security definer set search_path='' as $$
declare n bigint;
begin
  update sadoc_support.request_counter set total=total+1 where total>=0 returning total into n;
  if n%10=0 then insert into sadoc_support.mail_batches(batch) values(n/10); end if;
  return new;
end $$;
create trigger count_new_requests after insert on sadoc_support.chats
for each row execute function sadoc_support.count_request();
create function sadoc_support.send_batch() returns void language plpgsql security definer set search_path='' as $$
declare item sadoc_support.mail_batches; token text; destination text; rid bigint;
begin
  update sadoc_support.mail_batches b set accepted_at=now() from net._http_response r
  where b.accepted_at is null and b.request_id=r.id and r.status_code between 200 and 299;
  select * into item from sadoc_support.mail_batches where accepted_at is null
    and (attempted_at is null or attempted_at < now()-interval '30 minutes')
    order by batch limit 1 for update skip locked;
  if not found then return; end if;
  select decrypted_secret into token from vault.decrypted_secrets where name='sadoc_resend_key';
  if token is null then return; end if;
  select u.email into destination from sadoc_support.agents a join auth.users u on u.id=a.account_id
    where a.account_id=(select recipient from sadoc_support.mail_recipient limit 1);
  if destination is null then return; end if;
  select net.http_post(url:='https://api.resend.com/emails',
    headers:=jsonb_build_object('Authorization','Bearer '||token,'Content-Type','application/json','Idempotency-Key','sadoc-support-batch-'||item.batch),
    body:=jsonb_build_object('from','SADOCSTYLE <onboarding@resend.dev>','to',jsonb_build_array(destination),
    'subject','SADOCSTYLE · 10 nuevas peticiones de soporte','text','Recibiste 10 nuevas peticiones. Entra con tu cuenta para revisarlas y responder: https://sociozxcz-eng.github.io/SADOCSTYLE./#soporte')) into rid;
  update sadoc_support.mail_batches set request_id=rid,attempted_at=now() where batch=item.batch;
end $$;
create table sadoc_support.mail_recipient(recipient uuid primary key references sadoc_support.agents(account_id));
revoke all on function sadoc_support.count_request(),sadoc_support.send_batch() from public,anon,authenticated;
select cron.schedule('sadoc-support-mail','*/5 * * * *','select sadoc_support.send_batch()');
