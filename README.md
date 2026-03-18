# ClickUp to Slack Follow-up Worker

This project posts a daily Slack reminder for open ClickUp work on one configured list or view. It includes tasks and subtasks, groups them into due-date buckets, and tags owners in Slack when it can resolve them.

## What it does

1. Reads open tasks and subtasks from a specific ClickUp list or view.
2. Matches each ClickUp assignee to a Slack user using `config/owner-map.json`.
3. Falls back to Slack email or name lookups if a direct Slack user ID is not provided.
4. Builds two alert sections: `Due Today` and `Overdue`.
5. Uses subtasks when they exist, and shows the parent task name as an inline chip.
6. Posts a single end-of-day message in a Slack channel or DM asking for updates.
7. Can run once or stay alive and trigger itself every day at a preset local time.
8. Keeps a private overdue log that tracks missed deadlines, total overdue days, and overdue days where the task status did not change.
9. Can send that private summary only to an admin DM, such as Yash.

## Required Slack scopes

- `chat:write`
- `users:read`
- `users:read.email`

For direct-message delivery, also add:

- `im:write`

## Required ClickUp access

- A personal API token with access to the target list or view.

## Setup

1. Copy [.env.example](/Users/yashmakhecha/Downloads/Alpha%20Downloads/followup_assistant/.env.example) to `.env` and fill in your real values.
2. Copy [config/owner-map.example.json](/Users/yashmakhecha/Downloads/Alpha%20Downloads/followup_assistant/config/owner-map.example.json) to `config/owner-map.json`.
3. Update the owner map so each ClickUp person can be resolved to the right Slack user.

Suggested mapping shape:

```json
{
  "owners": [
    {
      "clickup": {
        "userId": "123456",
        "email": "alex@company.com",
        "name": "Alex Smith"
      },
      "slack": {
        "userId": "U0123456789",
        "email": "alex@company.com",
        "displayName": "alex.smith",
        "realName": "Alex Smith"
      }
    }
  ]
}
```

For the cleanest tagging, use Slack `userId` whenever possible.

## Commands

Run one reminder immediately:

```bash
npm run once
```

Preview the Slack message without sending it:

```bash
npm run dry-run
```

Keep the worker alive for daily reminders:

```bash
npm start
```

## Configuration

The worker reads these environment variables:

- `CLICKUP_TOKEN`: ClickUp personal API token.
- `CLICKUP_SOURCE_TYPE`: `list` or `view`.
- `CLICKUP_SOURCE_ID`: the ClickUp list ID or view ID to inspect.
- `CLICKUP_SOURCE_URL`: optional direct link to the ClickUp list or board referenced in the intro line.
- `SLACK_BOT_TOKEN`: Slack bot token.
- `SLACK_DESTINATION_TYPE`: `channel` or `dm`.
- `SLACK_CHANNEL_ID`: channel where reminders will be posted when destination type is `channel`.
  You can use a Slack channel ID such as `C0123456789` or a public channel name such as `#all-alpha`.
- `SLACK_DM_USER_ID`: target Slack user ID for DM delivery.
- `SLACK_DM_EMAIL`: target Slack email for DM delivery.
- `SLACK_DM_NAME`: target Slack display name or real name for DM delivery.
- `OWNER_MAP_FILE`: local path to the JSON mapping file.
- `MESSAGE_STYLE`: `option_a` for the compact table layout or `option_b` for the friendlier bullet-and-sub-bullet layout.
- `OVERDUE_LOG_FILE`: JSON file where overdue history is stored across runs.
- `ADMIN_DM_ENABLED`: `true` to send the private deadline log to a separate admin DM.
- `ADMIN_DM_USER_ID`: target Slack user ID for the private admin DM.
- `ADMIN_DM_EMAIL`: target Slack email for the private admin DM.
- `ADMIN_DM_NAME`: target Slack name for the private admin DM.
- `SCHEDULE_TIME`: local reminder time in `HH:MM` 24-hour format.
- `SCHEDULE_TIMEZONE`: IANA timezone for the schedule, such as `Asia/Kolkata` or `America/New_York`.
- `INCLUDE_UNASSIGNED`: `true` to include open unassigned tasks in the reminder.

If you choose `view`, the worker follows whatever that ClickUp view exposes. If subtasks are critical, `list` is the safer default because ClickUp documents explicit subtask expansion on the list tasks endpoint.

## Alert rules

- Only open ClickUp work is considered.
- Closed, completed, done, and archived tasks are excluded.
- Only tasks with a due date are included in the alert.
- Items due on the current local date go into `Due Today`.
- Items with due dates before the current local date go into `Overdue`.
- If a parent task has subtasks, the alert lists the subtasks instead of the parent task.
- If a task has no subtasks, the task itself is listed.
- Subtasks display the parent task name in an inline chip.
- Each listed task includes the mapped Slack owner mention.

## Private overdue log

When `ADMIN_DM_ENABLED=true`, the worker also sends a private summary DM that is separate from the public reminder.

The log tracks:

- `Missed Deadlines`: how many times a task first entered the overdue bucket.
- `Overdue Days Logged`: total overdue run-days across tasks and owners.
- `Unchanged-Status Overdue Days`: overdue run-days where the task stayed overdue and the ClickUp status did not change since the previous day.

Counting stops as soon as a task is no longer overdue or is no longer open. If an overdue task changes status, total overdue days continue, but unchanged-status overdue days stop until the task stays in the new status on a later run.

## How daily scheduling works

`npm start` stays alive and schedules the next reminder for the configured time every day.

For production, the more reliable pattern is usually:

- keep `npm run once` as the only command
- trigger it daily from your hosting platform, cron, GitHub Actions, or a process manager

That avoids duplicate reminders if multiple app instances are running at the same time.

## Deployment

The recommended free deployment path for this repo is:

- Supabase Postgres for state
- Supabase Edge Function for execution
- Supabase Cron for the daily trigger
- GitHub for normal branching and version history

This repo includes:

- [supabase/config.toml](/Users/yashmakhecha/Downloads/Alpha%20Downloads/followup_assistant/supabase/config.toml)
- [supabase/functions/daily-task-status/index.ts](/Users/yashmakhecha/Downloads/Alpha%20Downloads/followup_assistant/supabase/functions/daily-task-status/index.ts)
- [supabase/migrations/20260318234500_alpha_ops_state.sql](/Users/yashmakhecha/Downloads/Alpha%20Downloads/followup_assistant/supabase/migrations/20260318234500_alpha_ops_state.sql)
- [supabase/sql/schedule_daily_task_status.sql](/Users/yashmakhecha/Downloads/Alpha%20Downloads/followup_assistant/supabase/sql/schedule_daily_task_status.sql)
- [supabase/secrets.example.env](/Users/yashmakhecha/Downloads/Alpha%20Downloads/followup_assistant/supabase/secrets.example.env)
- [supabase/project.example.env](/Users/yashmakhecha/Downloads/Alpha%20Downloads/followup_assistant/supabase/project.example.env)

Why this path:

- free Supabase gives you one hosted database and Edge Functions
- the overdue log now fits naturally in Postgres-backed JSON state
- GitHub still handles code branches and reviews without needing a paid hosting layer
- Vercel is optional later if you want a separate admin UI

## Supabase Setup

1. Create or open the Supabase project with ref `xfcouttxjdftvntbnjcs`.
2. Install the Supabase CLI, then run:

```bash
npx supabase login
npx supabase link --project-ref xfcouttxjdftvntbnjcs
```

3. Push the database schema:

```bash
npm run supabase:db:push
```

4. Set the function secrets from the committed env file:

First copy:

```bash
cp supabase/secrets.example.env supabase/secrets.env
cp supabase/project.example.env supabase/project.env
```

Then fill in the real values in those local files.

```bash
npm run supabase:secrets:set
```

5. Deploy the Edge Function:

```bash
npm run supabase:function:deploy
```

6. In the Supabase dashboard, enable the `pg_cron` and `pg_net` extensions if they are not already enabled.

7. In the SQL Editor, run [supabase/sql/schedule_daily_task_status.sql](/Users/yashmakhecha/Downloads/Alpha%20Downloads/followup_assistant/supabase/sql/schedule_daily_task_status.sql) to create the daily 9:00 PM IST trigger.

8. Manually invoke the function once to confirm the DM output before changing the destination to a shared channel.

## Notes

- The function uses a shared `CRON_SECRET` header instead of JWT verification for the scheduled trigger.
- Runtime config, owner mapping, and overdue state are stored in `alpha_ops.app_state`.
- The existing local Node worker still works, but Supabase is the intended free hosted path.
