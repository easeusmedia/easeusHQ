// Easeus Mail Tracker, on Gmail. As an email is sent it adds a 1-pixel image
// and routes each link through Easeus HQ, then logs the email there. It also
// tells Easeus HQ when you're looking at an email you sent, so your own look
// isn't counted as an open. Nothing happens until the tracker is connected
// from the app's Mail tracker page.

let config = {};
chrome.storage.local.get(["key", "base"], (c) => (config = c));
chrome.storage.onChanged.addListener((changes) => {
  for (const [k, v] of Object.entries(changes)) config[k] = v.newValue;
});

const PIXEL = /\/m\/o\/([A-Za-z0-9_-]{12,40})/;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const EMAILS = new RegExp(EMAIL.source, "gi");
const SEND = '.aoO, [role="button"][data-tooltip^="Send"], [role="button"][aria-label^="Send"]';
const BODY = '[g_editable="true"][contenteditable="true"], [contenteditable="true"][role="textbox"]';

function tell(msg) {
  try {
    chrome.runtime.sendMessage(msg);
  } catch {
    // the extension was updated or reloaded: this page needs a refresh
  }
}

// the signed-in Gmail address ("Inbox - name@gmail.com - Gmail")
const account = () => (document.title.match(EMAIL) || [""])[0].toLowerCase();

// the compose window (or reply in a thread) something belongs to: the
// nearest box holding a message body
function composeOf(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement) if (n.querySelector(BODY)) return n;
  return null;
}

function recipients(root, body, me) {
  const found = new Set();
  const add = (v) => {
    const e = (v.match(EMAIL) || [""])[0].toLowerCase();
    if (e && e !== me) found.add(e);
  };
  for (const n of root.querySelectorAll("[email], [data-hovercard-id]")) if (!body.contains(n)) add(n.getAttribute("email") || n.getAttribute("data-hovercard-id") || "");
  for (const i of root.querySelectorAll('input[name="to"], input[name="cc"], input[name="bcc"], textarea[name="to"]')) (i.value.match(EMAILS) || []).forEach(add);
  return [...found];
}

// Just before Gmail sends: the image and the links, then log it. Sending
// the same email again (after Undo send) keeps its id.
function prepare(root) {
  if (!root || !config.key || !config.base) return;
  const body = root.querySelector(BODY);
  if (!body) return;
  const me = ((root.querySelector('input[name="from"]')?.value || "").match(EMAIL)?.[0] || account()).toLowerCase();
  const to = recipients(root, body, me);
  if (!to.length) return;

  const existing = [...body.querySelectorAll("img")].map((i) => (i.getAttribute("src") || "").match(PIXEL)).find(Boolean);
  const id = existing ? existing[1] : crypto.randomUUID().replace(/-/g, "");
  const links = [];
  if (!existing) {
    for (const a of body.querySelectorAll("a[href]")) {
      // the earlier messages quoted under a reply stay as they are
      if (a.closest(".gmail_quote")) continue;
      const href = a.getAttribute("href") || "";
      if (!/^https?:\/\//i.test(href) || href.startsWith(config.base)) continue;
      a.setAttribute("href", `${config.base}/m/c/${id}/${links.length}`);
      links.push(href);
    }
    const img = document.createElement("img");
    img.setAttribute("src", `${config.base}/m/o/${id}`);
    img.setAttribute("width", "1");
    img.setAttribute("height", "1");
    img.setAttribute("alt", "");
    img.setAttribute("style", "width:1px;height:1px;border:0");
    body.appendChild(img);
  }
  const subject = root.querySelector('input[name="subjectbox"]')?.value || root.querySelector('input[name="subject"]')?.value || document.querySelector("h2.hP")?.textContent || "";
  tell({ kind: "sent", id, from: me, to, subject, links });
}

// Send, by mouse (on press, before Gmail acts on the click) or keyboard
window.addEventListener(
  "mousedown",
  (e) => {
    const send = e.button === 0 && e.target.closest?.(SEND);
    if (send) prepare(composeOf(send));
  },
  true
);
window.addEventListener(
  "keydown",
  (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const send = e.target.closest?.(SEND);
    if (send) return prepare(composeOf(send));
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) prepare(composeOf(e.target));
  },
  true
);

// An email you sent, on your screen (your Sent folder, a thread): Gmail
// fetches its image too, and Easeus HQ sets that open aside
const told = new Map();
function looked(node) {
  const imgs = node.tagName === "IMG" ? [node] : node.querySelectorAll ? node.querySelectorAll("img") : [];
  for (const img of imgs) {
    const m = (img.getAttribute("src") || "").match(PIXEL);
    if (!m || img.closest('[contenteditable="true"]')) continue;
    if (Date.now() - (told.get(m[1]) || 0) < 60_000) continue;
    told.set(m[1], Date.now());
    tell({ kind: "self", id: m[1] });
  }
}
new MutationObserver((records) => {
  if (!config.key) return;
  for (const r of records) {
    if (r.type === "attributes") looked(r.target);
    else for (const n of r.addedNodes) if (n.nodeType === 1) looked(n);
  }
}).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
