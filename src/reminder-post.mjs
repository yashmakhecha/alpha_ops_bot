export async function postReminderBundle({
  slack,
  channel,
  summaryMessage,
  detailMessage
}) {
  const parentResult = await slack.postMessage({
    channel,
    text: summaryMessage.text,
    blocks: summaryMessage.blocks
  });
  const threadTs = parentResult?.ts || parentResult?.message?.ts || null;
  let detailResult = {
    ok: true,
    skipped: true
  };

  if (threadTs) {
    detailResult = await slack.postMessage({
      channel,
      text: detailMessage.text,
      blocks: detailMessage.blocks,
      threadTs
    });
  }

  return {
    parentResult,
    detailResult,
    threadTs
  };
}
