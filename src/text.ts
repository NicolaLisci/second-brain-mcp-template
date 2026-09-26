/** Shared tokenizer: the query, note titles and note bodies must all be cut the same way. */
/**
 * Function words and interrogatives carry no retrieval signal, but each one used to be worth a
 * body hit: asking "quanto verso ogni mese per le spese di casa" surfaced a note on a credit line
 * because it says "mese", and one on Cloudflare because it says "quanto". Dropped from both the
 * query and the notes, so neither side can match on them.
 */
const STOP = new Set([
  "che", "con", "per", "del", "della", "dello", "dei", "degli", "delle", "una", "uno", "gli",
  "nel", "nella", "nei", "negli", "nelle", "sul", "sulla", "sui", "sugli", "sulle", "dal", "dalla",
  "dai", "dagli", "dalle", "col", "coi", "tra", "fra", "non", "anche", "ancora", "oppure",
  "come", "cosa", "cose", "quale", "quali", "quando", "quanto", "quanta", "quanti", "quante",
  "dove", "perche", "chi", "ogni", "tutto", "tutta", "tutti", "tutte", "molto", "molti", "poco",
  "pochi", "piu", "meno", "altro", "altri", "altra", "altre",
  "essere", "sono", "sia", "siamo", "siete", "stato", "stata", "avere", "hanno", "abbiamo",
  "fare", "faccio", "fatto", "deve", "devo", "devono", "puo", "posso", "possono", "viene",
  "vengono", "verso", "mio", "mia", "miei", "mie", "suo", "sua", "suoi", "sue", "loro", "nostro",
  "nostra", "questo", "questa", "questi", "queste", "quello", "quella", "quelli", "quelle",
  "the", "and", "for", "with", "what", "when", "where", "which", "who", "how", "much", "many",
  "this", "that", "these", "those", "from", "into", "about", "have", "has", "had", "been", "are",
  "was", "were", "will", "would", "should", "could", "does", "did", "not", "you", "your", "its",
]);

export function tokenize(s: string): string[] {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t));
}

/**
 * Light Italian stemming, applied to BOTH sides of every comparison: quota/quote, mensile/mensili,
 * spesa/spese, costo/costi. Without it "quale è la mia quota mensile" scores zero against a note
 * whose heading reads "Quote mensili personali" — the note holding the answer never surfaces.
 * Only the final vowel of a token of five characters or more: short words keep their identity
 * (casa/caso stay apart) and consonant endings are untouched.
 */
export function stem(token: string): string {
  return token.length >= 5 ? token.replace(/[aeio]$/, "") : token;
}

export const stems = (tokens: string[]): string[] => tokens.map(stem);

/**
 * Tags the capture pipeline writes to record WHERE a note came from, not what it is about.
 * They must never contribute to relevance: every Telegram capture carries `telegram`, so
 * scoring them made any message mentioning Telegram a "duplicate" of every earlier capture.
 */
export const PROVENANCE_TAGS = new Set(["telegram", "auto", "explicit", "forwarded", "link", "vault-work", "vault-personal"]);
