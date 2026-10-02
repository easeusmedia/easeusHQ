// The podcast outreach sequence, as designed on the FigJam board (Notion:
// "Podcast Outreach Sequence · Full Reply Map", part 1), by stage. Words
// that change per lead are {{Variables}}: Name and Podcast fill themselves
// from the lead; Guest, Gap, Short gap and Audit link are typed on it.
// outreach-setup.ts seeds these onto the Dream 156 board's stages.

const SIGN = "Best,\nAshmit Shahi\nEaseus Media";

export const SEQUENCE: Record<string, { name: string; channel: "email" | "instagram" | "linkedin" | "other"; body: string }[]> = {
  "Day 1": [
    {
      name: "Email 1",
      channel: "email",
      body: `Hey {{Name}},

I know you're busy, so this'll only take 20secs.
Watched your {{Guest}} episode - love the sharp questions and production quality.

That's why this stood out: {{Gap}}

Context, In the last 6 months we helped a client's podcast:
Drive ~1M total YouTube views
Engineer their most-viewed YouTube Short
Produce their most-viewed long-form episode

No increase in recording. No change in guests.

It came from fixing packaging, distribution, and building an audience capture system. You can check our work here!

I recorded a 5-minute audit showing exactly what I would change for {{Podcast}} & some low hanging fruits that'd help with visibility.

Should I send it over?

${SIGN}`,
    },
    {
      name: "LinkedIn connection note",
      channel: "linkedin",
      body: "Hey {{Name}}, Watched your episode with {{Guest}}. Noticed, {{Short gap}} Had a few ideas on how it could get more visibility! I've put together a short audit for {{Podcast}}. Should I send it over?",
    },
  ],
  "Day 2": [
    {
      name: "Instagram 1 (didn't open Email 1)",
      channel: "instagram",
      body: `Hey {{Name}}, watched your {{Guest}} episode. Sharp questions, well produced.

Thing that stood out: {{Gap}}

You can check our work here:

Recorded a 5-minute audit - 3 things I'd change and some low-hanging fruits that would help with visibility.

Should I send it over?`,
    },
    {
      name: "Instagram 1 (opened Email 1)",
      channel: "instagram",
      body: `Hey {{Name}},

Emailed you about {{Podcast}} yesterday - probably landed somewhere you never look.

Short version: watched your episode with {{Guest}}. Something stood out: {{Gap}}

You can check our work here:

Recorded a 5-minute audit - 3 things I'd change and some low-hanging fruits that would help with visibility.

Should I send it over?`,
    },
  ],
  "Day 3": [
    {
      name: "Email 2",
      channel: "email",
      body: `{{Name}},

One thing from the audit, so you know what's in it. People are watching {{Podcast}} & some of them subscribe. But there's no audience capture system on the channel, so you don't know who they are, where they came from, or how to reach them again.

That matters the day you want to invite them to something, tell them about an offer, or let them know a new episode is live. Right now the only way back to them is YouTube choosing to show them your next episode, & that isn't something you control.

That's 1 of 3. The other 2 are about turning first-time viewers into returning ones.

Should I send it over, or is it not relevant right now?

Ashmit`,
    },
  ],
  "Day 4": [
    {
      name: "LinkedIn DM (accepted but silent)",
      channel: "linkedin",
      body: `Thanks for connecting, {{Name}}.

Quick one from the audit, so you know it isn't generic: People are watching {{Podcast}} & some of them subscribe. But there's no audience capture system on the channel, so you don't know who they are, where they came from, or how to reach them again.

That's 1 of 3.

Happy to send the full audit here if that's easier than email.

P.S. You can check our work here: https://easeus.media/`,
    },
  ],
  "Day 5": [
    {
      name: "Instagram 2",
      channel: "instagram",
      body: `One thing from the audit, so you know what's in it.

People are watching {{Podcast}} & some of them subscribe. But there's no audience capture system on the channel, so you don't know who they are, where they came from, or how to reach them again.

The other 2 are about what happens to an episode after it goes live.

Should I send it over, or is it not relevant right now?`,
    },
  ],
  "Day 6": [
    {
      name: "Email 3 (whiteboard photo)",
      channel: "email",
      body: `Pick one of three. Real phone photo, real marker.

A — Sign: Is growing {{Podcast}} a priority yet?
Blackbar: Audit's still here if the answer is yes

B — https://meme.app/create/i-bet-hes-thinking-about-other-women
Copy: I bet he's thinking about other women             When will {{Name}} reply to my email!`,
    },
  ],
  "Day 7": [
    { name: "Instagram 3 (last message)", channel: "instagram", body: "Same as Email 3. No body text." },
    { name: "LinkedIn 3 (last message)", channel: "linkedin", body: "Same as Email 3. No body text." },
  ],
  "Day 8": [
    {
      name: "Email 4 (last)",
      channel: "email",
      body: `Hey {{Name}},

Haven't heard back, so I'll pause here.

If it's just timing, tell me when to come back. If someone else owns this side of {{Podcast}}, point me at them.

Either way the audit's still here. Say the word and it's yours.

Ashmit`,
    },
  ],
  "Lead Magnet Sent": [
    {
      name: "The audit (same day as their yes)",
      channel: "email",
      body: `Hey {{Name}},

Here's the audit for {{Podcast}}: {{Audit link}}

If it's useful, the next step is a 15-min call to see whether this is worth running every week.

Book a Call Here!

${SIGN}`,
    },
  ],
};
