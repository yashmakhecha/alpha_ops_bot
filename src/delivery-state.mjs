function getDateFormatter(timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function getTimeFormatter(timeZone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

export function createEmptyDeliveryState() {
  return {
    version: 1,
    sent: {}
  };
}

export function normalizeDeliveryState(parsed) {
  return {
    version: parsed?.version || 1,
    sent: parsed?.sent || {}
  };
}

export function getCurrentScheduleSlot({ now = new Date(), timeZone, scheduleTimes }) {
  return {
    dateKey: getDateFormatter(timeZone).format(now),
    timeKey: getTimeFormatter(timeZone).format(now),
    scheduleTimes: Array.isArray(scheduleTimes) ? scheduleTimes : []
  };
}

export function hasDeliveredForSlot(state, { dateKey, timeKey }) {
  const deliveryState = normalizeDeliveryState(state);

  return Boolean(deliveryState.sent?.[dateKey]?.[timeKey]);
}

export function markDeliveredForSlot(state, { dateKey, timeKey, sentAt }) {
  const deliveryState = normalizeDeliveryState(state);

  if (!deliveryState.sent[dateKey]) {
    deliveryState.sent[dateKey] = {};
  }

  deliveryState.sent[dateKey][timeKey] = {
    sentAt
  };

  const retainedDates = Object.keys(deliveryState.sent).sort().slice(-45);
  deliveryState.sent = Object.fromEntries(retainedDates.map((date) => [date, deliveryState.sent[date]]));

  return deliveryState;
}
