/**
 * The vault conventions, in one place.
 *
 * They used to be written twice: once in the `sb_capture` description read by Claude and ChatGPT
 * over MCP, once in the Telegram router's system prompt. Two copies of the same rules drift, and
 * had already started to. Both prompts are now built from here.
 *
 * `client-config/chat-project-instructions.md` is the third audience — a human pastes it into a
 * chat project — and mirrors these rules deliberately; keep it in step when they change.
 */

export const VAULT_SCOPE = {
  work: "Professional knowledge: employer, clients, colleagues, projects, products, processes and work-related decisions.",
  personal: "Own interests and projects: finances and investments, home, hobbies, side projects, personal tooling.",
} as const;

/** The one test that decides whether something is worth a note at all. */
export const CUT_RULE =
  "Will the user look for this in six months? Keep reasoned decisions, lasting constraints, domain facts not derivable from code, preferences, configurations, solved problems, goals, and sources worth finding again. Never debugging, commands, transient state or small talk. When in doubt, do not capture.";

export const NOTE_TYPES =
  '"concept" for an idea, fact or definition; "project" for something with an outcome and next actions; "area" for an ongoing responsibility; "source" for external material.';

export const NEVER_RULES = [
  "Never move work content into the personal vault: no company names, clients or internal identifiers.",
  "Never invent facts, sources, numbers or names that are not in the material. Rephrasing is fine, adding is not.",
] as const;

export const vaultScopeLine = (id: keyof typeof VAULT_SCOPE) => `"${id}": ${VAULT_SCOPE[id]}`;
