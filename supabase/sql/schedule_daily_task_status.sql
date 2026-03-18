select cron.unschedule(jobid)
from cron.job
where jobname = 'daily-task-status';

-- Replace the placeholder values below before executing this SQL.
-- PROJECT_URL example: https://xfcouttxjdftvntbnjcs.supabase.co
-- CRON_SECRET example: your_shared_cron_secret
select cron.schedule(
  'daily-task-status',
  '* * * * *',
  $$
  select
    net.http_post(
      url := 'PROJECT_URL/functions/v1/daily-task-status',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', 'CRON_SECRET'
      ),
      body := '{"source":"supabase-cron"}'::jsonb
    );
  $$
);
