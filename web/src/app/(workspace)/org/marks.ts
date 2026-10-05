import { Building2, Clapperboard, Handshake, Lightbulb, Send, TrendingUp, UserPlus, Wallet, Wrench, type LucideIcon } from "lucide-react";

// What each department does, as its icon, by the words in its name
const MARKS: [RegExp, LucideIcon][] = [
  [/technical|\btech\b|\bit\b/i, Wrench],
  [/sales/i, TrendingUp],
  [/client|operat/i, Handshake],
  [/content|strateg|idea/i, Lightbulb],
  [/produc/i, Clapperboard],
  [/distrib|growth/i, Send],
  [/\bhr\b|talent|hiring|recruit/i, UserPlus],
  [/financ|admin/i, Wallet],
];
export const markOf = (name: string): LucideIcon => MARKS.find(([key]) => key.test(name))?.[1] ?? Building2;
