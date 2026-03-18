create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists app_state_set_updated_at on public.app_state;

create trigger app_state_set_updated_at
before update on public.app_state
for each row
execute function public.set_updated_at();

insert into public.app_state (key, value)
values
  (
    'runtime_config',
    '{
      "clickup": {
        "sourceType": "list",
        "sourceId": "901613969789",
        "sourceUrl": "https://app.clickup.com/90161148770/v/li/901613969789"
      },
      "slack": {
        "enabled": false,
        "destinationType": "dm",
        "channelId": "#all-alpha",
        "dmEmail": "yash@get-alpha.ai",
        "dmName": "Yash Makhecha"
      },
      "adminSummary": {
        "enabled": true,
        "destinationType": "dm",
        "dmEmail": "yash@get-alpha.ai",
        "dmName": "Yash Makhecha"
      },
      "schedule": {
        "time": "21:00",
        "times": ["21:00"],
        "timezone": "Asia/Kolkata"
      },
      "includeUnassigned": false,
      "messageStyle": "option_b",
      "taskProperties": ["status", "priority", "due", "owner", "blocking"]
    }'::jsonb
  ),
  (
    'owner_map',
    '{
      "owners": [
        {
          "clickup": {
            "userId": "212515329",
            "email": "yash@get-alpha.ai",
            "name": "Yash Makhecha"
          },
          "slack": {
            "email": "yash@get-alpha.ai",
            "realName": "Yash Makhecha"
          }
        },
        {
          "clickup": {
            "userId": "100984639",
            "email": "ankur@get-alpha.ai",
            "name": "Ankur Sahu"
          },
          "slack": {
            "email": "ankur@get-alpha.ai",
            "realName": "Ankur Sahu"
          }
        },
        {
          "clickup": {
            "userId": "100983707",
            "email": "anshul@get-alpha.ai",
            "name": "Anshul Kardam"
          },
          "slack": {
            "email": "anshul@get-alpha.ai",
            "realName": "Anshul Kardam"
          }
        },
        {
          "clickup": {
            "userId": "100930007",
            "email": "yuvraj@get-alpha.ai",
            "name": "Yuvraj Jangir"
          },
          "slack": {
            "email": "yuvraj@get-alpha.ai",
            "realName": "Yuvraj Jangir"
          }
        }
      ]
    }'::jsonb
  ),
  (
    'overdue_state',
    '{
      "version": 2,
      "lastRunOn": null,
      "tasks": {},
      "owners": {}
    }'::jsonb
  ),
  (
    'delivery_state',
    '{
      "version": 1,
      "sent": {}
    }'::jsonb
  )
on conflict (key) do update
set value = excluded.value;
