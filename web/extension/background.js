// Sends what the Gmail page reports to Easeus HQ, with this person's key.
// A sent email that can't get through waits in a queue and goes later.

async function post(body) {
  const { key, base } = await chrome.storage.local.get(["key", "base"]);
  if (!key || !base) return false;
  try {
    const res = await fetch(`${base}/api/mail`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tracker-key": key },
      body: JSON.stringify(body),
    });
    // a bad email won't get better by trying again; a bad key might (reconnect)
    return res.ok || (res.status === 400);
  } catch {
    return false;
  }
}

let flushing = Promise.resolve();
function flush() {
  flushing = flushing.then(async () => {
    const { queue = [] } = await chrome.storage.local.get("queue");
    const left = [];
    for (const item of queue) if (!(await post(item))) left.push(item);
    // anything newer that arrived while this ran stays too
    const { queue: now = [] } = await chrome.storage.local.get("queue");
    await chrome.storage.local.set({ queue: [...left, ...now.slice(queue.length)].slice(-1000) });
  });
  return flushing;
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.kind === "sent") {
    flushing = flushing.then(async () => {
      const { queue = [] } = await chrome.storage.local.get("queue");
      await chrome.storage.local.set({ queue: [...queue, msg] });
    });
    flush();
  } else if (msg?.kind === "self") post(msg);
});

chrome.alarms.create("flush", { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener(flush);
chrome.runtime.onStartup.addListener(flush);
