// The starting template, lifted from what the agency already does in Notion
// rather than invented: the onboarding steps are the six in the written
// "Client Onboarding SOP", and the deliverables and document headings match
// the shape every properly set-up client page already has.
//
// This is only the seed. Once it's in the database ops edits it in the app,
// and this file stops being the source of truth.

export type TemplateItem = { name: string; detail: string };
export type TemplateStep = { title: string; detail: string };

export const DEFAULT_ONBOARDING: TemplateStep[] = [
  { title: "Create the WhatsApp group", detail: "Client + the internal team. Name it “<Client> × Easeus Media”." },
  { title: "Send welcome message + onboarding form", detail: "Welcome them in the group and share the onboarding form link." },
  { title: "Request brand assets", detail: "Logo (PNG/SVG), brand colour codes, brand guidelines or brand book, fonts." },
  { title: "Tell them the credentials email is coming", detail: "A short heads-up in the group before asking for logins." },
  { title: "Send the credentials request email", detail: "Instagram and TikTok logins, plus access to their YouTube channel." },
  { title: "Confirm everything received", detail: "Form, assets, credentials and YouTube access — then confirm in the group." },
  { title: "Fill in client information", detail: "Profession, language, brand fonts and colours — the editors work from this." },
  { title: "Write the editing SOP and quality checklist", detail: "How their work gets edited, and the final pass before anything is uploaded." },
  { title: "Set the deliverables and billing rule", detail: "What they're contracted for each cycle, and when they get invoiced." },
];

export const DEFAULT_DELIVERABLES: TemplateItem[] = [
  { name: "Long-form episodes", detail: "2 per month" },
  { name: "Trailer", detail: "1 per episode" },
  { name: "Short-form clips", detail: "6 per episode" },
  { name: "Custom thumbnails", detail: "For all content" },
  { name: "Channel management & distribution", detail: "YouTube, TikTok, Instagram" },
  { name: "Monthly analytics & growth strategy", detail: "" },
];

export const DEFAULT_DOCS = {
  brandGuidelines: `This page helps the team understand who this client is, so editing choices match their brand before anyone checks a rule.

## About the client

## Content type
-

## Language
UK English. Every word on screen — captions, titles, lower-thirds — uses British spelling.

## Brand assets


## Brand fonts
-

## Brand colours
| Colour | Hex code | Where it's used |
| | | |`,

  sop: `Before you start editing, follow these steps in order.

## Setup
1. Download all raw files and assets from the task.
2. Download the project templates — check Client information if you don't have them.
3. Confirm logo placement against the brand assets. Never reposition or resize by preference.
4. Add the hook/title within the first 5 seconds.
5. Add the guest name and title within the first 10 seconds, on screen for ~4 seconds.
6. Add the outro at the end.

## While editing

### Brand
- Only use the approved colours from Client information.
- Match the client's language and currency.

### Visuals
- Speaker centred in frame.
- No black bars at the edges after zooming or cropping.

### Typography & text
- Consistent text sizing throughout.
- All text inside the safe zone for Instagram, TikTok and YouTube Shorts.
- Each caption on screen long enough to read comfortably.

### Music
- Keep background music below -20dB so the speaker's voice is always clearest.
- Never use copyrighted music — royalty-free or properly licensed only.

### Export settings
| Setting | Value |
| Format | H.264 (.mp4) |
| Bitrate mode | VBR, 1-pass |
| Target bitrate | ~35 Mbps |
| Resolution | 1080 × 1920 |
| Frame rate | Match source |`,

  qualityChecklist: `Go through this top to bottom before uploading a draft. It's the final safety net for the small things that are easy to miss after hours on a timeline.

## Hard rules
- No spelling mistakes in titles, captions or on-screen text
- Correct language variant used throughout

## Visuals & text
- Speaker centred in frame
- No black bars at the edges after zoom or crop
- Title hook appears within the first 4–5 seconds
- All text within the safe zone
- Text sizing consistent throughout
- No overlapping text
- Captions stay on screen long enough to read
- No black frame at the end

## Guest info
- Guest name and title introduced within the first 10 seconds
- Guest name and title as a lower-third for ~4 seconds

## Brand
- Logo placement follows the brand guidelines
- Only approved colours used
- Outro included at the end

## Audio
- Background music at -20dB or lower
- Speaker's voice is the clearest, most prominent sound

## Final check
- Watch the export start to finish before uploading`,

  meetingNotes: `Running notes from calls with this client — newest at the top.

## `,

  resources: `Links the team needs for this client — asset folders, templates, brand drives.

## Brand assets


## Templates


## Other
`,
};

export const DEFAULT_TAGS = ["Subscription"];
