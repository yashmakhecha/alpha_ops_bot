import { loadConfig } from "./config.mjs";
import { runReminder } from "./reminder-worker.mjs";
import { scheduleDaily } from "./scheduler.mjs";

async function main() {
  const config = loadConfig();

  if (config.once) {
    await runReminder(config);
    return;
  }

  scheduleDaily({
    hours: config.schedule.hours,
    minutes: config.schedule.minutes,
    timeZone: config.schedule.timezone,
    task: () => runReminder(config)
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
