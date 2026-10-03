// The podcast outreach sequence exactly as the FigJam board "Podcast Outreach
// Sequence — Full Reply Map (Final)" has it, by stage of the Dream 156 board:
// one stage per touch, so a day that goes out on two platforms (Day 1, Day 7)
// is two stages. Each message's name is its card's heading, its body the
// card's words, and its note only the card's own rule lines. Nothing is
// added. The board's placeholders become {{Variables}} so each lead fills
// them: NAME is {{Name}}, PODCAST {{Podcast}}, GUEST and X {{Guest}}, (Gap)
// {{Gap}}; the short version of the gap is {{Short gap}}, the short version
// of Email 2's observation {{Short audit point}}.
// outreach-setup.ts sync writes these onto the board's stages.

const SIGN = "Best,\nAshmit Shahi\nEaseus Media";

export type SequenceMessage = {
  name: string;
  channel: "email" | "instagram" | "linkedin" | "other";
  note: string;
  subject?: string;
  body: string;
  // its earlier names, so a rewrite keeps the same message
  was?: string[];
};

export const SEQUENCE: Record<string, SequenceMessage[]> = {
  "Day 1 · Email 1": [
    {
      name: "DAY 1 · EMAIL 1 · ALL ACCOUNTS",
      was: ["Email 1"],
      channel: "email",
      note: "",
      body: `Hey {{Name}},

I know you're busy, so this'll only take 20secs.
Watched your {{Guest}} episode - love the sharp questions and production quality.

That's why this stood out: {{Gap}}

Context, In the last 6 months we helped a client's podcast:
• Drive ~1M total YouTube views
• Engineer their most-viewed episode & YouTube Short.

No increase in recording. No change in guests.

It came from fixing packaging, distribution, and building an audience capture system. You can check our work here!

I recorded a 5-minute audit showing exactly what I would change for {{Podcast}} & some low hanging fruits that'd help with visibility.

Should I send it over?

${SIGN}`,
    },
  ],
  "Day 1 · LinkedIn note": [
    {
      name: "DAY 1 · LINKEDIN · ALL ACCOUNTS",
      was: ["LinkedIn connection note"],
      channel: "linkedin",
      note: "",
      body: `Hey {{Name}},
Watched your episode with {{Guest}}.
Noticed, {{Short gap}}
Had a few ideas on how it could get more visibility!
I've put together a short audit for {{Podcast}}.
Should I send it over?`,
    },
  ],
  "Day 2 · Instagram 1": [
    {
      name: "DAY 2 · INSTAGRAM 1 · DIDN'T OPEN EMAIL 1",
      was: ["Instagram 1 · didn't open Email 1", "Instagram 1 (didn't open Email 1)"],
      channel: "instagram",
      note: "",
      body: `Hey {{Name}}, watched your {{Guest}} episode. Sharp questions, well produced.

That's why this stood out: {{Short gap}}

You can check our work here:

Recorded a 5-minute audit - 3 things I'd change and some low-hanging fruits that would help with visibility.

Should I send it over?`,
    },
    {
      name: "DAY 2 · INSTAGRAM 1 · ALREADY OPENED EMAIL 1",
      was: ["Instagram 1 · already opened Email 1", "Instagram 1 (opened Email 1)"],
      channel: "instagram",
      note: "",
      body: `Hey {{Name}},

Emailed you about {{Podcast}} yesterday - probably landed somewhere you never look.

Short version: watched your episode with {{Guest}}. Something stood out: {{Gap}}

You can check our work here:

Recorded a 5-minute audit - 3 things I'd change and some low-hanging fruits that would help with visibility.

Should I send it over?`,
    },
  ],
  "Day 3 · Email 2": [
    {
      name: "DAY 3 · EMAIL 2",
      was: ["Email 2"],
      channel: "email",
      note: "",
      body: `{{Name}},

One thing from the audit, so you know what's in it. People are watching {{Podcast}} & some of them subscribe. But there's no audience capture system on the channel, so you don't know who they are, where they came from, or how to reach them again.

That matters the day you want to invite them to something, tell them about an offer, or let them know a new episode is live. Right now the only way back to them is YouTube choosing to show them your next episode, & that isn't something you control.

That's 1 of 3. The other 2 are about turning first-time viewers into returning ones.

Should I send over a 5min video audit?

Ashmit`,
    },
  ],
  "Day 4 · LinkedIn DM": [
    {
      name: "DAY 4 · LINKEDIN DM · ACCEPTED BUT SILENT",
      was: ["LinkedIn DM · accepted but silent", "LinkedIn DM (accepted but silent)"],
      channel: "linkedin",
      note: "THE ONLY LINKEDIN MESSAGE",
      body: `Thanks for connecting, {{Name}}.

Quick one from the audit, so you know it isn't generic: People are watching {{Podcast}} & some of them subscribe. But there's no audience capture system on the channel, so you don't know who they are, where they came from, or how to reach them again.

That's 1 of 3.

Happy to send the full audit here if that's easier than email.

P.S. You can check our work here: https://easeus.media/`,
    },
  ],
  "Day 5 · Instagram 2": [
    {
      name: "DAY 5 · INSTAGRAM 2 · STILL SILENT",
      was: ["Instagram 2"],
      channel: "instagram",
      note: "",
      body: `One thing from the audit, so you know what's in it.

{{Short audit point}}

The other 2 are about what happens to an episode after it goes live.

Should I send over a proper video audit?`,
    },
  ],
  "Day 6 · Email 3": [
    {
      name: "DAY 6 · EMAIL 3 · WHITEBOARD PHOTO",
      was: ["Email 3 · whiteboard photo", "Email 3 (whiteboard photo)"],
      channel: "email",
      note: "",
      body: `Pick one of three. Real phone photo, real marker.

A — Sign: Is growing {{Podcast}} a priority yet?
Blackbar: Audit's still here if the answer is yes`,
    },
  ],
  "Day 7 · Instagram 3": [
    {
      name: "DAY 7 · INSTAGRAM 3 · STILL SILENT · LAST MESSAGE",
      was: ["Instagram 3 · last message", "Instagram 3 (last message)"],
      channel: "instagram",
      note: "",
      body: `Hey {{Name}},
The audit I am to share is my way of connecting with you so even if we don't work right now, there would still be a potential for collaboration in the future.
Should I send the audit, or is it not relevant right now?`,
    },
  ],
  "Day 7 · LinkedIn 3": [
    {
      name: "DAY 7 · LinkedIn 3 · STILL SILENT · LAST MESSAGE",
      was: ["LinkedIn 3 · last message", "LinkedIn 3 (last message)"],
      channel: "linkedin",
      note: "",
      body: `Hey {{Name}},
The audit I am to share is my way of connecting with you so even if we don't work right now, there would still be a potential for collaboration in the future.
Should I send the audit, or is it not relevant right now?`,
    },
  ],
  "Day 8 · Email 4": [
    {
      name: "DAY 8 · EMAIL 4 · LAST",
      was: ["Email 4 · last", "Email 4 (last)"],
      channel: "email",
      note: "",
      body: `Hey {{Name}},

Haven't heard back, so I'll pause here.

If it's just timing, tell me when to come back. If someone else owns this side of {{Podcast}}, point me at them.

Either way the audit's still here. Say the word and it's yours.

Ashmit`,
    },
  ],

  Replied: [
    {
      name: "REPLY · WHAT DO YOU DO",
      was: ["What do you do"],
      channel: "email",
      note: "THIS IS A WIN. IT IS A REPLY.",
      body: `Hey {{Name}},  We run everything after you hit record: the edit, clips, packaging, distribution & an audience capture system, so every episode leaves behind people you can reach again.

Easier to show than explain, so I'll send the audit for {{Podcast}} today. You'll see how we think before we talk about anything else.

You can check our work here! (Link embedded in the text)

${SIGN}`,
    },
    {
      name: "REPLY · WE ALREADY HAVE AN EDITOR",
      was: ["We already have an editor"],
      channel: "email",
      note: "",
      body: `Hey {{Name}},

Good, keep them.

They handle production. We're the layer above it: which moments get cut, how they're packaged, where they go, & what happens after they publish.

Most shows don't have a production problem. They have a nothing-happens-after-publishing problem.

If your editor is good, we make their work travel further.

The audit's useful either way, even just to hand to them. Sending it over today.

${SIGN}`,
    },
    {
      name: "REPLY · I'M NOT THE RIGHT PERSON",
      was: ["I'm not the right person"],
      channel: "email",
      note: "A NAME IS THE WIN. A redirect beats a no. Then send the email to the referred contact.",
      body: `Hey {{Name}},

Appreciate you saying so.

Who looks after {{Podcast}}'s channel & clips? Happy to go to them directly. Mind if I mention you pointed me their way?

${SIGN}`,
    },
    {
      name: "EMAIL TO THE REFERRED CONTACT",
      was: ["Email to the referred contact"],
      channel: "email",
      note: "WARM INTRO, NOT COLD. If silent, 1 follow-up after 4 days, then stop. Never run them through the 8-day sequence. Yes goes to Delivery.",
      subject: "{{Name}} suggested I reach out",
      body: `Hey {{New name}},

{{Name}} mentioned you look after {{Podcast}}'s channel, so I'm coming to you directly.

I put together a 5-minute audit for {{Podcast}}: 3 things I'd change to get more out of each episode.

Should I send it over?

${SIGN}`,
    },
    {
      name: "REPLY · HOW MUCH",
      was: ["How much?"],
      channel: "email",
      note: "NO PRICE ON THE FIRST ASK. Goes to Delivery. If they ask again, use Pushes for a number.",
      body: `Hey {{Name}},

Fair question. It's a monthly retainer, scoped to how often you publish & what needs building, so the honest answer depends on your show.

Let me send the audit first. If what's in it is worth doing, a 15-min call gets you an exact number, not a range.

Sending it today.

${SIGN}`,
    },
    {
      name: "REPLY · PUSHES FOR A NUMBER (asks again)",
      was: ["Pushes for a number (asks again)"],
      channel: "email",
      note: "REFUSING TWICE LOSES THEM. Use $3,000 & $4,600 for US & Canada.",
      body: `Hey {{Name}},

Understood. Most shows we run land between £2,500 & £4,000 a month, depending mainly on how many episodes you publish.

The audit shows what that buys on {{Podcast}} specifically. Want it?

${SIGN}`,
    },
    {
      name: "REPLY · WHO ELSE HAVE YOU WORKED WITH?",
      was: ["Who else have you worked with?"],
      channel: "email",
      note: "Yes goes to Delivery.",
      body: `Hey {{Name}},

Fair to ask. You can see the work here: easeus.media/projects.html

The best proof for your show is still the audit, because it's about {{Podcast}}, not someone else's. Want it?

${SIGN}`,
    },
    {
      name: "REPLY · CAN YOU JUST DO THE CLIPS / TRAILER?",
      was: ["Can you just do the clips / trailer?"],
      channel: "email",
      note: "THE AMPLIFIER IS A DIFFERENT PRODUCT, NEVER A DISCOUNT. Price on the call. Goes to Delivery.",
      body: `Hey {{Name}},

We do that too, as a separate service focused only on clips & trailers, cut from the episodes you already have.

The audit covers the clips side as well, so it's still the right starting point. Sending it today.

${SIGN}`,
    },
    {
      name: "REPLY · SEND ME MORE INFO / A DECK",
      was: ["Send me more info / a deck"],
      channel: "email",
      note: "NEVER BUILD A DECK FOR AN UNQUALIFIED PROSPECT. Goes to Delivery.",
      body: `Hey {{Name}},

The audit's the better version of that, because it's about {{Podcast}} instead of us. 5 minutes. Sending it today.

${SIGN}`,
    },
    {
      name: "REPLY · IS THIS AUTOMATED / AI?",
      was: ["Is this automated / AI?"],
      channel: "email",
      note: "ONLY SEND IF EVERY LINE IS TRUE FOR THIS PROSPECT.",
      body: `Hey {{Name}},

Fair question. We use tools to pull channel data, but a person watched your episode & every line was checked before it went out. The audit is me on camera talking about {{Podcast}}, not a template.

${SIGN}`,
    },
    {
      name: "REPLY · WE'RE DOING IT IN-HOUSE / HIRING",
      was: ["We're doing it in-house / hiring"],
      channel: "email",
      note: "Yes goes to Delivery.",
      body: `Hey {{Name}},

Makes sense. If you're hiring, the audit's a useful brief for whoever takes it on: 3 things I'd have them fix first.

Want it?

${SIGN}`,
    },
    {
      name: "REPLY · NOT RIGHT NOW",
      was: ["Not right now"],
      channel: "email",
      note: '(also use for "later" to Email 3) A DATE IS THE WIN. Lock it, then honour it exactly. Goes to PARKED, never Dead.',
      body: `Hey {{Name}},

Totally fair, & thanks for telling me rather than leaving it.

When's a better time to pick this up? If you're not sure, I'll check back in a month & won't chase you before then.

The audit's yours in the meantime if you want it. No strings.

${SIGN}`,
    },
    {
      name: "REPLY · NOT INTERESTED",
      was: ["Not interested"],
      channel: "email",
      note: "DO NOT ARGUE. DO NOT OFFER ONE MORE THING. Suppress on every channel today.",
      body: `Hey {{Name}},

Understood, I'll stop here. Thanks for letting me know.

If anything changes, I'm easy to find.

${SIGN}`,
    },
    {
      name: "REPLY · ANNOYED / COMPLAINS ABOUT A MESSAGE",
      was: ["Annoyed / complains about a message"],
      channel: "email",
      note: "DON'T DEFEND, DON'T PITCH. Stop every channel. Goes to DEAD.",
      body: `Hey {{Name}},

Fair point, & thanks for saying it rather than just deleting it. That one missed the mark.

I'll leave it there.

${SIGN}`,
    },
    {
      name: "REPLY · STOP / UNSUBSCRIBE / REMOVE ME",
      was: ["Stop / unsubscribe / remove me"],
      channel: "email",
      note: "SUPPRESS ON EMAIL, INSTAGRAM & LINKEDIN TODAY. No follow-up of any kind. Goes to DEAD.",
      body: "Done. You won't hear from me again.",
    },
  ],

  "Audit sent": [
    {
      name: "SAME DAY · DELIVERY · PDF PLUS LOOM",
      was: ["The audit · same day as their yes", "The audit (same day as their yes)"],
      channel: "email",
      note: "",
      body: `Hey {{Name}},

Here's the audit for {{Podcast}}:

[GIF thumbnail linked to the Loom]

If it's useful, the next step is a 15-min call to see whether this is worth running every week.

Book a Call Here! (Hyperlink embedded in text)

${SIGN}`,
    },
    {
      name: "THEY SAY THANKS, USEFUL · SAME DAY",
      was: ["They say thanks, useful"],
      channel: "email",
      note: "NEVER RESPOND TO THIS WITH ANOTHER FREE THING.",
      body: `Hey {{Name}},

Glad it landed.

The obvious next question is what this looks like running every week rather than once. That's a 15-min conversation rather than an email.

Thursday or Friday work?

${SIGN}`,
    },
    {
      name: "THEY DISAGREE WITH A FINDING",
      was: ["They disagree with a finding"],
      channel: "email",
      note: "DISAGREEMENT IS WARMER THAN THANKS USEFUL. Concede fast, hold one.",
      body: `Hey {{Name}},

Fair, & you'd know better than me from the inside.

The one I'd still hold to is {{Finding}}, because {{Reason}}.

Worth 15 minutes to argue about it properly? I'd rather be corrected than right.

${SIGN}`,
    },
    {
      name: "AFTER CALL 1 · SAME DAY",
      was: ["After Call 1"],
      channel: "email",
      note: "",
      body: `Hey {{Name}},

Thanks for today. I'll have the 90-day plan for {{Podcast}} ready for {{Day}} at {{Time}}.

If anyone else should see it, forward the invite & I'll walk them through it too.

${SIGN}`,
    },
    {
      name: "NO-SHOW",
      was: ["No-show"],
      channel: "email",
      note: "ONE RESCHEDULE ATTEMPT. A 2nd no-show goes to PARKED.",
      body: `Hey {{Name}},

Looks like today got away from you. Happens to everyone.

Want to grab another slot? calendly.com/ashmitshahi/easeus-media

${SIGN}`,
    },
  ],

  "No reply after the audit": [
    {
      name: "SILENT AFTER AUDIT · DAY +5",
      was: ["Silent after the audit · day +5"],
      channel: "email",
      note: "ASK A QUESTION, NEVER NAG",
      body: `Hey {{Name}},

Curious which of the 3 you'd push back on. I'd rather hear where it's wrong for {{Podcast}} than assume it's right.

${SIGN}`,
    },
    {
      name: "STILL SILENT · DAY +12 · DIRECT ASK",
      was: ["Still silent · day +12"],
      channel: "email",
      note: "",
      body: `Hey {{Name}},

You've got the audit. The real question is what it looks like applied every week rather than once.

15 minutes & I'll walk you through the first 90 days.

Thursday or Friday?

${SIGN}`,
    },
    {
      name: "COLD · WAS ENGAGED, NOW SILENT",
      was: ["Cold · was engaged, now silent"],
      channel: "email",
      note: "WAIT 2 TO 3 WEEKS GENUINELY. FRAMED AS SPONTANEOUS. ONE ATTEMPT ONLY.",
      body: `Hey {{Name}},

Was on your channel for something unrelated & noticed your titles.

Current: {{Their title}}
Rewritten: {{Your version}}

Did 4 more. Want them?

${SIGN}`,
    },
  ],

  "Parked for later": [
    {
      name: "PARKED · WAITING ON A DATE",
      was: ["Parked · waiting on a date"],
      channel: "email",
      note: 'From: not right now, "later", 2nd no-show. Set a reminder for the date they gave, or 1 month if they didn\'t give one. On the date, in the original thread. Yes goes to Delivery. Silent goes to DEAD. Never send a day early.',
      body: `Hey {{Name}},

You said to come back around now, so here I am.

Is growing {{Podcast}} a priority now? If yes, the audit's ready & I'll send it today.

${SIGN}`,
    },
  ],
};
