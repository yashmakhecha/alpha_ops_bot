function getFormatter(timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
}

function getDateParts(date, timeZone) {
  const formatter = getFormatter(timeZone);
  const parts = formatter.formatToParts(date);
  const map = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = Number(part.value);
    }
  }

  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second
  };
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = getDateParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return asUtc - date.getTime();
}

function toUtcDate(parts, timeZone) {
  const utcGuess = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0)
  );
  const initialOffset = getTimeZoneOffsetMs(utcGuess, timeZone);
  const adjusted = new Date(utcGuess.getTime() - initialOffset);
  const adjustedOffset = getTimeZoneOffsetMs(adjusted, timeZone);

  if (adjustedOffset !== initialOffset) {
    return new Date(utcGuess.getTime() - adjustedOffset);
  }

  return adjusted;
}

function addCalendarDays(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

export function getNextRunDate({ hours, minutes, timeZone, now = new Date() }) {
  const current = getDateParts(now, timeZone);
  const todayTarget = toUtcDate(
    {
      year: current.year,
      month: current.month,
      day: current.day,
      hour: hours,
      minute: minutes,
      second: 0
    },
    timeZone
  );

  if (todayTarget.getTime() > now.getTime()) {
    return todayTarget;
  }

  const tomorrow = addCalendarDays(current, 1);
  return toUtcDate(
    {
      ...tomorrow,
      hour: hours,
      minute: minutes,
      second: 0
    },
    timeZone
  );
}

export function scheduleDaily({ hours, minutes, timeZone, task }) {
  let timer = null;

  const queueNextRun = () => {
    const nextRun = getNextRunDate({ hours, minutes, timeZone });
    const delay = Math.max(1_000, nextRun.getTime() - Date.now());

    console.log(
      `Next reminder scheduled for ${new Intl.DateTimeFormat("en-US", {
        timeZone,
        dateStyle: "medium",
        timeStyle: "short"
      }).format(nextRun)} (${timeZone})`
    );

    timer = setTimeout(async () => {
      try {
        await task();
      } catch (error) {
        console.error("Scheduled run failed:", error);
      } finally {
        queueNextRun();
      }
    }, delay);
  };

  queueNextRun();

  return () => {
    if (timer) {
      clearTimeout(timer);
    }
  };
}
