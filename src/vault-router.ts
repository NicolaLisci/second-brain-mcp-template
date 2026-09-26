import type { VaultClient } from "./github";
import type { VaultId } from "./config";
import { searchVault } from "./search";

export type VaultDecision =
  | { vault: VaultId; confidence: "high" | "medium"; reason: string }
  | { vault: null; confidence: "low"; reason: string };

export const WORK_TERMS = [
  "client", "customer", "colleague", "team", "company", "employer", "office",
  "project", "roadmap", "tender", "jira", "ticket", "release", "stakeholder",
  "meeting", "deadline", "product", "process", "architecture", "repository",
];

export const PERSONAL_TERMS = [
  "personal", "home", "household", "family", "finance", "investment", "portfolio",
  "hobby", "travel", "vacation", "car", "fitness", "health", "shopping",
  "side project", "recipe", "budget",
];

function termScore(text: string, terms: string[]): number {
  const normalized = text.toLowerCase();
  return terms.reduce((score, term) => score + (normalized.includes(term) ? 3 : 0), 0);
}

function searchScore(results: Awaited<ReturnType<typeof searchVault>>): number {
  if (!results.length) return 0;
  return results.slice(0, 3).reduce((sum, result, index) => sum + result.score / (index + 1), 0);
}

export async function chooseVault(
  clients: { work: VaultClient & { vault: "work" }; personal: VaultClient & { vault: "personal" } },
  text: string,
): Promise<VaultDecision> {
  const workTerms = termScore(text, WORK_TERMS);
  const personalTerms = termScore(text, PERSONAL_TERMS);

  if (workTerms >= personalTerms + 3) {
    return { vault: "work", confidence: "high", reason: "strong work-domain terms" };
  }
  if (personalTerms >= workTerms + 3) {
    return { vault: "personal", confidence: "high", reason: "strong personal-domain terms" };
  }

  const [workResults, personalResults] = await Promise.all([
    searchVault(clients.work, text, 5),
    searchVault(clients.personal, text, 5),
  ]);
  const workScore = searchScore(workResults) + workTerms;
  const personalScore = searchScore(personalResults) + personalTerms;
  const delta = Math.abs(workScore - personalScore);
  const best = Math.max(workScore, personalScore);

  if (best < 2.5 || delta < 1.5) {
    return { vault: null, confidence: "low", reason: `ambiguous scores work=${workScore.toFixed(1)} personal=${personalScore.toFixed(1)}` };
  }

  return workScore > personalScore
    ? { vault: "work", confidence: delta >= 3 ? "high" : "medium", reason: `vault similarity work=${workScore.toFixed(1)} personal=${personalScore.toFixed(1)}` }
    : { vault: "personal", confidence: delta >= 3 ? "high" : "medium", reason: `vault similarity personal=${personalScore.toFixed(1)} work=${workScore.toFixed(1)}` };
}
