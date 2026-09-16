// What a client may send from their shared page. Nobody signs in to send it,
// so it's checked here before it's stored: plain text, a sensible length,
// and the hidden trap field (only a bot fills it in) left empty.

export const FEEDBACK_MAX = 2000;
export const FEEDBACK_PER_HOUR = 20;

export type FeedbackInput = { name: string; message: string; trap: string };

export function checkFeedback(input: FeedbackInput): { name: string | null; message: string } | { error: string } {
  if (input.trap) return { error: "Couldn't send that." };
  const message = input.message.trim();
  if (!message) return { error: "Write something first." };
  if (message.length > FEEDBACK_MAX) return { error: `Keep it under ${FEEDBACK_MAX} characters.` };
  return { name: input.name.trim().slice(0, 80) || null, message };
}
