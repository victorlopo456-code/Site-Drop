-- Reforços gratuitos: MFA para operações administrativas e limite de abuso dos endpoints.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select
    coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create table if not exists public.api_rate_limits (
  rate_key text not null,
  bucket text not null,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  primary key (rate_key, bucket)
);

alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from anon, authenticated;

create or replace function public.consume_api_rate_limit(
  p_key text,
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer set search_path = ''
as $$
declare
  v_attempts integer;
begin
  if char_length(p_key) not between 1 and 200
     or char_length(p_bucket) not between 1 and 80
     or p_limit not between 1 and 1000
     or p_window_seconds not between 10 and 86400 then
    raise exception 'invalid rate limit parameters';
  end if;

  insert into public.api_rate_limits as limits (
    rate_key, bucket, window_started_at, attempts
  ) values (p_key, p_bucket, now(), 1)
  on conflict (rate_key, bucket) do update set
    attempts = case
      when limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then 1
      else limits.attempts + 1
    end,
    window_started_at = case
      when limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then now()
      else limits.window_started_at
    end
  returning attempts into v_attempts;

  return v_attempts <= p_limit;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, text, integer, integer) from public;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer) to service_role;
