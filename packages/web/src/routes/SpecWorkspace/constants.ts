/**
 * Constants for SpecWorkspace
 */

export interface QuirkyMessage {
  text: string;
  icon: string;
}

export const QUIRKY_MESSAGES: QuirkyMessage[] = [
  { text: "Thinkering...", icon: "🧠" },
  { text: "Doing specy things...", icon: "📝" },
  { text: "Hmm, interesting...", icon: "🤔" },
  { text: "Consulting the oracle...", icon: "🔮" },
  { text: "Pondering deeply...", icon: "💭" },
  { text: "Having a eureka moment...", icon: "💡" },
  { text: "Crunching the bits...", icon: "⚙️" },
  { text: "Summoning the answers...", icon: "✨" },
  { text: "Brewing some thoughts...", icon: "☕" },
  { text: "Connecting the dots...", icon: "🔗" },
  { text: "Polishing the response...", icon: "💎" },
  { text: "Consulting the specs...", icon: "📋" },
  { text: "Explaining it to a rubber duck.", icon: "🦆" },
  { text: "This is fine. Everything is fine.", icon: "🔥" },
];

export const ACTIVE_DECOMPOSE_STATUSES = [
  'STARTING',
  'INITIALIZING',
  'DECOMPOSING',
  'REVIEWING',
  'REVISING',
] as const;

export const DECOMPOSE_COMPLETE_STATUSES = ['COMPLETED', 'DECOMPOSED'] as const;
