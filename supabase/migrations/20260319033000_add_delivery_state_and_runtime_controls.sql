insert into public.app_state (key, value)
values
  (
    'delivery_state',
    '{
      "version": 1,
      "sent": {}
    }'::jsonb
  )
on conflict (key) do nothing;

update public.app_state
set value =
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          value,
          '{slack,enabled}',
          coalesce(
            value #> '{slack,enabled}',
            to_jsonb(
              case
                when coalesce(value #>> '{slack,destinationType}', 'channel') = 'channel' then true
                else false
              end
            )
          ),
          true
        ),
        '{schedule,times}',
        coalesce(
          value #> '{schedule,times}',
          to_jsonb(array[coalesce(value #>> '{schedule,time}', '21:00')])
        ),
        true
      ),
      '{taskProperties}',
      coalesce(
        value -> 'taskProperties',
        '["status", "priority", "due", "owner", "blocking"]'::jsonb
      ),
      true
    ),
    '{slack,channelId}',
    coalesce(
      value #> '{slack,channelId}',
      to_jsonb('#all-alpha'::text)
    ),
    true
  )
where key = 'runtime_config';
