// What someone may change about their own account, checked the same way on
// the form and on the server. Pure, so it's tested without a database.

export const MIN_PASSWORD = 8;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type AccountInput = { name: string; email: string; currentPassword: string; newPassword: string };

// The cleaned-up values, or what's wrong with them. `current` is the account
// as it stands; changing the email or the password asks for the current
// password (whether it's right is the server's to check).
export function checkAccount(input: AccountInput, current: { email: string }): { error: string } | { name: string; email: string; newPassword: string | null; needsPassword: boolean } {
  const name = input.name.trim().replace(/\s+/g, " ");
  const email = input.email.trim().toLowerCase();
  if (!name) return { error: "Enter your name." };
  if (name.length > 80) return { error: "That name is too long." };
  if (!EMAIL.test(email) || email.length > 200) return { error: "Enter a valid email address." };
  const newPassword = input.newPassword || null;
  if (newPassword && newPassword.length < MIN_PASSWORD) return { error: `Use at least ${MIN_PASSWORD} characters for the new password.` };
  if (newPassword && newPassword.length > 200) return { error: "That password is too long." };
  const needsPassword = email !== current.email || !!newPassword;
  if (needsPassword && !input.currentPassword) return { error: "Enter your current password to change your email or password." };
  return { name, email, newPassword, needsPassword };
}
