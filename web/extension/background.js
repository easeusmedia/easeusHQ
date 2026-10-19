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

// Checking in (1.0.8): while Chrome is open, every half hour and whenever
// it's connected, so Easeus HQ can tell it's on even in a browser without
// it (Safari, the Dock app)
const checkIn = () => post({ kind: "here", version: chrome.runtime.getManifest().version });

// made once: making one again (each time the worker wakes) would push it
// back, and the half-hourly check-in would never come
for (const [name, periodInMinutes] of [["flush", 5], ["here", 30]])
  chrome.alarms.get(name).then((a) => a || chrome.alarms.create(name, { periodInMinutes }));
chrome.alarms.onAlarm.addListener((a) => (a.name === "here" ? checkIn() : flush()));
chrome.runtime.onStartup.addListener(() => {
  flush();
  checkIn();
});
chrome.runtime.onInstalled.addListener(checkIn);
chrome.storage.onChanged.addListener((changes) => {
  if (changes.key || changes.base) checkIn();
});
