// On Easeus HQ's Mail tracker page: takes this person's key from the page,
// so every email is logged as theirs on that site, and answers the page's
// "is the tracker here?"
const el = document.querySelector("[data-tracker-key]");
// and which Gmail accounts it works in (the sales inbox, not anyone's own)
if (el)
  chrome.storage.local.set({
    key: el.getAttribute("data-tracker-key"),
    base: location.origin,
    inboxes: (el.getAttribute("data-tracker-inboxes") || "").split(",").filter(Boolean),
  });

window.addEventListener("message", (e) => {
  if (e.source === window && e.data?.type === "easeus-mail-tracker:ping")
    window.postMessage({ type: "easeus-mail-tracker:here", version: chrome.runtime.getManifest().version }, location.origin);
});
