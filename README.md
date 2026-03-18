# Alpha Ops Bot

Daily ClickUp-to-Slack follow-up automation for Alpha.

The bot reads work from a ClickUp list, builds a Slack update grouped into `Due Today` and `Overdue`, sends a private manager summary, and keeps overdue history in Supabase.

## Current Production Shape

- ClickUp as the task source
- Slack for delivery
- Supabase Edge Function for execution
- Supabase Postgres for runtime state
- Supabase Cron for daily scheduling
- GitHub for code history and branching

## What It Does

- Pulls open tasks from a configured ClickUp list
- Supports task, subtask, and sub-subtask hierarchy
- Shows the full visible task path with indentation
- Sorts task cards by priority first, then blocking status, then the remaining work
- Splits updates into `Due Today` and `Overdue`
- Tags Slack owners using the ClickUp-to-Slack owner map
- Sends a private admin summary with:
  - missed deadlines
  - overdue days logged
  - unchanged-status overdue days
  - current overdue tasks by owner
- Publishes a private Slack App Home control panel for the admin user
- Lets the admin Home tab control:
  - which task properties appear in reminders
  - whether the public reminder is enabled
  - which public channel receives it
  - whether the private `Team Progress Update` DM is enabled
  - one or more daily send times

## Repo Layout

- [src/](/Users/yashmakhecha/Downloads/Alpha%20Downloads/followup_assistant/src): shared ClickUp, Slack, formatting, and overdue-log logic
- [supabase/functions/daily-task-status/index.ts](/Users/yashmakhecha/Downloads/Alpha%20Downloads/followup_assistant/supabase/functions/daily-task-status/index.ts): hosted runtime entrypoint
- [supabase/migrations/](/Users/yashmakhecha/Downloads/Alpha%20Downloads/followup_assistant/supabase/migrations): database schema and state migrations
- [supabase/sql/schedule_daily_task_status.sql](/Users/yashmakhecha/Downloads/Alpha%20Downloads/followup_assistant/supabase/sql/schedule_daily_task_status.sql): schedule template
- [config/owner-map.example.json](/Users/yashmakhecha/Downloads/Alpha%20Downloads/followup_assistant/config/owner-map.example.json): local owner-map template
- [test/](/Users/yashmakhecha/Downloads/Alpha%20Downloads/followup_assistant/test): automated coverage

## Secrets And Config

Tracked files are templates only.

- Use [`.env.example`](/Users/yashmakhecha/Downloads/Alpha%20Downloads/followup_assistant/.env.example) for local worker development
- Use [supabase/secrets.example.env](/Users/yashmakhecha/Downloads/Alpha%20Downloads/followup_assistant/supabase/secrets.example.env) for Edge Function secrets
- Use [supabase/project.example.env](/Users/yashmakhecha/Downloads/Alpha%20Downloads/followup_assistant/supabase/project.example.env) for local project metadata

Real secret files stay local and are ignored:

- `.env`
- `supabase/secrets.env`
- `supabase/project.env`
- `data/overdue-state.json`

## Local Development

1. Copy [`.env.example`](/Users/yashmakhecha/Downloads/Alpha%20Downloads/followup_assistant/.env.example) to `.env`
2. Copy [config/owner-map.example.json](/Users/yashmakhecha/Downloads/Alpha%20Downloads/followup_assistant/config/owner-map.example.json) to `config/owner-map.json`
3. Fill in the real values

Commands:

```bash
npm run test
npm run dry-run
npm run once
npm start
```

## Supabase Deployment

Project ref:

```text
xfcouttxjdftvntbnjcs
```

### One-Time Setup

1. Log in to Supabase CLI

```bash
npx supabase login
```

2. Link the repo

```bash
npx supabase link --project-ref xfcouttxjdftvntbnjcs
```

3. Create local secret files from the templates

```bash
cp supabase/secrets.example.env supabase/secrets.env
cp supabase/project.example.env supabase/project.env
```

4. Fill in the real values in those local files

Important Slack values for App Home:

- `SLACK_SIGNING_SECRET`
- optional `SLACK_APP_HOME_ADMIN_USER_ID`

If `SLACK_APP_HOME_ADMIN_USER_ID` is left blank, the App Home will fall back to the user configured for the private admin summary.

### Deploy

Push database changes:

```bash
npm run supabase:db:push
```

Sync Edge Function secrets:

```bash
npm run supabase:secrets:set
```

Deploy the function:

```bash
npm run supabase:function:deploy
npm run supabase:function:deploy:app-home
```

### Schedule

The bot now runs on a minute-level cron and checks the configured `schedule.times` list in `public.app_state`. That makes multiple daily send times possible without editing the cron job every time.

The SQL template in [supabase/sql/schedule_daily_task_status.sql](/Users/yashmakhecha/Downloads/Alpha%20Downloads/followup_assistant/supabase/sql/schedule_daily_task_status.sql) is safe to commit because it uses placeholders. Fill in the real project URL and cron secret before executing it in the Supabase SQL editor.

## Runtime State

Supabase stores the bot state in `public.app_state`.

Current keys:

- `runtime_config`
- `owner_map`
- `overdue_state`
- `delivery_state`

## Required Slack Scopes

- `chat:write`
- `users:read`
- `users:read.email`
- `im:write` for DM delivery

## Slack App Home Setup

After deploying [supabase/functions/slack-app-home/index.ts](/Users/yashmakhecha/Downloads/Alpha%20Downloads/followup_assistant/supabase/functions/slack-app-home/index.ts):

1. In Slack app settings, enable `App Home`
2. Set the Home tab as visible
3. Turn on `Interactivity & Shortcuts`
4. Set the Request URL to:

```text
https://xfcouttxjdftvntbnjcs.supabase.co/functions/v1/slack-app-home
```

5. Turn on `Event Subscriptions`
6. Set the same Request URL there
7. Subscribe to the bot event `app_home_opened`
8. Reinstall the app to the workspace

Behavior:

- Yash-only admin view: the configured admin user gets the full control panel
- Everyone else: they see a locked App Home with no controls
- Current controls:
  - choose visible task properties
  - enable or disable the public reminder
  - choose the public reminder channel
  - enable or disable the private `Team Progress Update` DM
  - edit one or more daily send times
  - `Save Settings`
  - `Refresh Home`
  - `Send Test DM Now`
  - `Send Public Message Now`
  - `Open Dev Board`

## Message Behavior

- Public reminder title: `Daily Task Status`
- Private admin summary title: `Team Progress Update`
- Visible task hierarchy is rendered as nested bullets
- Blocking lines appear at the task level where the dependency exists
- Standalone tasks, subtasks, and sub-subtasks are all supported

## App Home Behavior

- The Home tab uses live ClickUp data and the same overdue log state as the daily reminder
- It is private per-user because Slack App Home views are published individually
- Only the configured admin user gets controls; everyone else sees a restricted view
- `Send Test DM Now` sends the reminder and, if enabled, `Team Progress Update` only to the admin user
- `Send Public Message Now` posts the public reminder to the selected channel immediately
- Saved Home settings directly change future scheduled sends

## Roadmap

- optional Vercel admin page if a richer web UI becomes useful

## Notes

- The Slack app icon must still be changed manually in the Slack app settings
- The existing Node worker is still usable locally, but Supabase is the intended hosted path
