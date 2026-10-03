// The podcast outreach sequence, word for word from the FigJam board
// "Podcast Outreach Sequence — Full Reply Map (Final)", by stage of the
// Dream 156 board. Each day sends one message per platform; where the board
// splits a day (Day 2: opened Email 1 or not), each version is its own
// message. Replies, the audit and what follows it sit on the stages they
// belong to. `note` is the board's rule for when (and whether) to send it.
// Words that change per lead are {{Variables}}: Name and Podcast fill
// themselves from the lead; the rest are typed on it.
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
  "Day 1 · Email 1 and LinkedIn note": [
    {
      name: "Email 1",
      channel: "email",
      note: "Day 1, all accounts.",
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
    {
      name: "LinkedIn connection note",
      channel: "linkedin",
      note: "Day 1, all accounts. The note on the connection request; the gap is Email 1's, in short.",
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
      name: "Instagram 1 · didn't open Email 1",
      was: ["Instagram 1 (didn't open Email 1)"],
      channel: "instagram",
      note: "Silent, and they didn't open Email 1. The observation is Email 1's, smaller.",
      body: `Hey {{Name}}, watched your {{Guest}} episode. Sharp questions, well produced.

That's why this stood out: {{Short gap}}

You can check our work here:

Recorded a 5-minute audit - 3 things I'd change and some low-hanging fruits that would help with visibility.

Should I send it over?`,
    },
    {
      name: "Instagram 1 · already opened Email 1",
      was: ["Instagram 1 (opened Email 1)"],
      channel: "instagram",
      note: "Silent, but they opened Email 1. The observation is the same as Email 1's.",
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
      name: "Email 2",
      channel: "email",
      note: "Day 3, still silent. One thing from the audit, so they know what's in it.",
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
      name: "LinkedIn DM · accepted but silent",
      was: ["LinkedIn DM (accepted but silent)"],
      channel: "linkedin",
      note: "The only LinkedIn message, and only to people who accepted the connection. The audit point is Email 2's.",
      body: `Thanks for connecting, {{Name}}.

Quick one from the audit, so you know it isn't generic: People are watching {{Podcast}} & some of them subscribe. But there's no audience capture system on the channel, so you don't know who they are, where they came from, or how to reach them again.

That's 1 of 3.

Happy to send the full audit here if that's easier than email.

P.S. You can check our work here: https://easeus.media/`,
    },
  ],
  "Day 5 · Instagram 2": [
    {
      name: "Instagram 2",
      channel: "instagram",
      note: "Day 5, still silent. Email 2's observation about their podcast, in short.",
      body: `One thing from the audit, so you know what's in it.

People watch {{Podcast}} & some subscribe, but there's no audience capture system, so there's no way to reach them again.

The other 2 are about what happens to an episode after it goes live.

Should I send over a proper video audit?`,
    },
  ],
  "Day 6 · Email 3": [
    {
      name: "Email 3 · whiteboard photo",
      was: ["Email 3 (whiteboard photo)"],
      channel: "email",
      note: "Day 6, still silent. The email is a photo: a real phone photo of a whiteboard, in real marker. Write the sign, with the black bar under it.",
      body: `Sign: Is growing {{Podcast}} a priority yet?
Black bar: Audit's still here if the answer is yes`,
    },
  ],
  "Day 7 · Instagram 3 and LinkedIn 3": [
    {
      name: "Instagram 3 · last message",
      was: ["Instagram 3 (last message)"],
      channel: "instagram",
      note: "Day 7, still silent. The last Instagram message.",
      body: `Hey {{Name}},
The audit I am to share is my way of connecting with you so even if we don't work right now, there would still be a potential for collaboration in the future.
Should I send the audit, or is it not relevant right now?`,
    },
    {
      name: "LinkedIn 3 · last message",
      was: ["LinkedIn 3 (last message)"],
      channel: "linkedin",
      note: "Day 7, still silent. The last LinkedIn message.",
      body: `Hey {{Name}},
The audit I am to share is my way of connecting with you so even if we don't work right now, there would still be a potential for collaboration in the future.
Should I send the audit, or is it not relevant right now?`,
    },
  ],
  "Day 8 · Final email": [
    {
      name: "Email 4 · last",
      was: ["Email 4 (last)"],
      channel: "email",
      note: "Day 8, the last touch. A reply goes to its reply branch; silence ends the sequence.",
      body: `Hey {{Name}},

Haven't heard back, so I'll pause here.

If it's just timing, tell me when to come back. If someone else owns this side of {{Podcast}}, point me at them.

Either way the audit's still here. Say the word and it's yours.

Ashmit`,
    },
  ],

  // A reply on any channel ends the cold sequence on every channel the same
  // day. Reply in the channel they used, with the same words.
  Replied: [
    {
      name: "What do you do",
      channel: "email",
      note: "This is a win: it's a reply. Goes to Delivery.",
      body: `Hey {{Name}},

We run everything after you hit record: the edit, clips, packaging, distribution & an audience capture system, so every episode leaves behind people you can reach again.

Easier to show than explain, so I'll send the audit for {{Podcast}} today. You'll see how we think before we talk about anything else.

You can check our work here!

${SIGN}`,
    },
    {
      name: "We already have an editor",
      channel: "email",
      note: "Goes to Delivery.",
      body: `Hey {{Name}},

Good, keep them.

They handle production. We're the layer above it: which moments get cut, how they're packaged, where they go, & what happens after they publish.

Most shows don't have a production problem. They have a nothing-happens-after-publishing problem.

If your editor is good, we make their work travel further.

The audit's useful either way, even just to hand to them. Sending it over today.

${SIGN}`,
    },
    {
      name: "I'm not the right person",
      channel: "email",
      note: "A name is the win: a redirect beats a no. Then send the email to the referred contact.",
      body: `Hey {{Name}},

Appreciate you saying so.

Who looks after {{Podcast}}'s channel & clips? Happy to go to them directly. Mind if I mention you pointed me their way?

${SIGN}`,
    },
    {
      name: "Email to the referred contact",
      channel: "email",
      note: "A warm intro, not cold. If silent, 1 follow-up after 4 days, then stop. Never run them through the 8-day sequence. Yes goes to Delivery.",
      subject: "{{Name}} suggested I reach out",
      body: `Hey {{New name}},

{{Name}} mentioned you look after {{Podcast}}'s channel, so I'm coming to you directly.

I put together a 5-minute audit for {{Podcast}}: 3 things I'd change to get more out of each episode.

Should I send it over?

${SIGN}`,
    },
    {
      name: "How much?",
      channel: "email",
      note: "No price on the first ask. Goes to Delivery. If they ask again, use Pushes for a number.",
      body: `Hey {{Name}},

Fair question. It's a monthly retainer, scoped to how often you publish & what needs building, so the honest answer depends on your show.

Let me send the audit first. If what's in it is worth doing, a 15-min call gets you an exact number, not a range.

Sending it today.

${SIGN}`,
    },
    {
      name: "Pushes for a number (asks again)",
      channel: "email",
      note: "Refusing twice loses them. Use $3,000 & $4,600 for the US & Canada.",
      body: `Hey {{Name}},

Understood. Most shows we run land between £2,500 & £4,000 a month, depending mainly on how many episodes you publish.

The audit shows what that buys on {{Podcast}} specifically. Want it?

${SIGN}`,
    },
    {
      name: "Who else have you worked with?",
      channel: "email",
      note: "Yes goes to Delivery.",
      body: `Hey {{Name}},

Fair to ask. You can see the work here: easeus.media/projects.html

The best proof for your show is still the audit, because it's about {{Podcast}}, not someone else's. Want it?

${SIGN}`,
    },
    {
      name: "Can you just do the clips / trailer?",
      channel: "email",
      note: "The amplifier is a different product, never a discount. Price on the call. Goes to Delivery.",
      body: `Hey {{Name}},

We do that too, as a separate service focused only on clips & trailers, cut from the episodes you already have.

The audit covers the clips side as well, so it's still the right starting point. Sending it today.

${SIGN}`,
    },
    {
      name: "Send me more info / a deck",
      channel: "email",
      note: "Never build a deck for an unqualified prospect. Goes to Delivery.",
      body: `Hey {{Name}},

The audit's the better version of that, because it's about {{Podcast}} instead of us. 5 minutes. Sending it today.

${SIGN}`,
    },
    {
      name: "Is this automated / AI?",
      channel: "email",
      note: "Only send if every line is true for this prospect.",
      body: `Hey {{Name}},

Fair question. We use tools to pull channel data, but a person watched your episode & every line was checked before it went out. The audit is me on camera talking about {{Podcast}}, not a template.

${SIGN}`,
    },
    {
      name: "We're doing it in-house / hiring",
      channel: "email",
      note: "Yes goes to Delivery.",
      body: `Hey {{Name}},

Makes sense. If you're hiring, the audit's a useful brief for whoever takes it on: 3 things I'd have them fix first.

Want it?

${SIGN}`,
    },
    {
      name: "Not right now",
      channel: "email",
      note: "Also for \"later\" to Email 3. A date is the win: lock it, then honour it exactly. Goes to Parked, never Dead.",
      body: `Hey {{Name}},

Totally fair, & thanks for telling me rather than leaving it.

When's a better time to pick this up? If you're not sure, I'll check back in a month & won't chase you before then.

The audit's yours in the meantime if you want it. No strings.

${SIGN}`,
    },
    {
      name: "Not interested",
      channel: "email",
      note: "Do not argue. Do not offer one more thing. Suppress on every channel today.",
      body: `Hey {{Name}},

Understood, I'll stop here. Thanks for letting me know.

If anything changes, I'm easy to find.

${SIGN}`,
    },
    {
      name: "Annoyed / complains about a message",
      channel: "email",
      note: "Don't defend, don't pitch. Stop every channel. Goes to Dead.",
      body: `Hey {{Name}},

Fair point, & thanks for saying it rather than just deleting it. That one missed the mark.

I'll leave it there.

${SIGN}`,
    },
    {
      name: "Stop / unsubscribe / remove me",
      channel: "email",
      note: "Suppress on email, Instagram & LinkedIn today. No follow-up of any kind. Goes to Dead.",
      body: "Done. You won't hear from me again.",
    },
  ],

  // The audit goes out the same day as the yes, then what follows it
  "Audit sent": [
    {
      name: "The audit · same day as their yes",
      was: ["The audit (same day as their yes)"],
      channel: "email",
      note: "Same day as the yes, always. PDF plus Loom: put a GIF thumbnail linked to the Loom where the link is, and link Book a Call Here!",
      body: `Hey {{Name}},

Here's the audit for {{Podcast}}:

{{Audit link}}

If it's useful, the next step is a 15-min call to see whether this is worth running every week.

Book a Call Here!

${SIGN}`,
    },
    {
      name: "They say thanks, useful",
      channel: "email",
      note: "Same day. Never respond to this with another free thing.",
      body: `Hey {{Name}},

Glad it landed.

The obvious next question is what this looks like running every week rather than once. That's a 15-min conversation rather than an email.

Thursday or Friday work?

${SIGN}`,
    },
    {
      name: "They disagree with a finding",
      channel: "email",
      note: "Disagreement is warmer than thanks, useful. Concede fast, hold one.",
      body: `Hey {{Name}},

Fair, & you'd know better than me from the inside.

The one I'd still hold to is {{Finding}}, because {{Reason}}.

Worth 15 minutes to argue about it properly? I'd rather be corrected than right.

${SIGN}`,
    },
    {
      name: "After Call 1",
      channel: "email",
      note: "The same day as Call 1. On the call: their show and goals, what a new client is worth to them, no price, and close on booking Call 2 for the 90-day plan.",
      body: `Hey {{Name}},

Thanks for today. I'll have the 90-day plan for {{Podcast}} ready for {{Day}} at {{Time}}.

If anyone else should see it, forward the invite & I'll walk them through it too.

${SIGN}`,
    },
    {
      name: "No-show",
      channel: "email",
      note: "One reschedule attempt. A 2nd no-show goes to Parked.",
      body: `Hey {{Name}},

Looks like today got away from you. Happens to everyone.

Want to grab another slot? calendly.com/ashmitshahi/easeus-media

${SIGN}`,
    },
  ],

  "No reply after the audit": [
    {
      name: "Silent after the audit · day +5",
      channel: "email",
      note: "Ask a question, never nag.",
      body: `Hey {{Name}},

Curious which of the 3 you'd push back on. I'd rather hear where it's wrong for {{Podcast}} than assume it's right.

${SIGN}`,
    },
    {
      name: "Still silent · day +12",
      channel: "email",
      note: "A direct ask.",
      body: `Hey {{Name}},

You've got the audit. The real question is what it looks like applied every week rather than once.

15 minutes & I'll walk you through the first 90 days.

Thursday or Friday?

${SIGN}`,
    },
    {
      name: "Cold · was engaged, now silent",
      channel: "email",
      note: "Wait 2 to 3 weeks, genuinely. Framed as spontaneous. One attempt only.",
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
      name: "Parked · waiting on a date",
      channel: "email",
      note: "From not right now, \"later\", or a 2nd no-show. On the date they gave (or 1 month on), in the original thread. Yes goes to Delivery; silent goes to Dead. Never send a day early.",
      body: `Hey {{Name}},

You said to come back around now, so here I am.

Is growing {{Podcast}} a priority now? If yes, the audit's ready & I'll send it today.

${SIGN}`,
    },
  ],
};
