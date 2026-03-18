create table if not exists public.app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists app_state_set_updated_at on public.app_state;

create trigger app_state_set_updated_at
before update on public.app_state
for each row
execute function public.set_updated_at();

insert into public.app_state (key, value, updated_at)
select key, value, updated_at
from alpha_ops.app_state
on conflict (key) do update
set
  value = excluded.value,
  updated_at = excluded.updated_at;
