import { Octokit } from "octokit";

/**
 * The `octokit` meta-package installs the retry and throttling plugins by default:
 * they silently re-issue 5xx requests and sleep through rate limits. The spec wants
 * every GitHub failure surfaced to the caller immediately, and a Worker cannot afford
 * to sit in a Bottleneck queue, so both are switched off explicitly.
 */
export function createOctokit(auth: string, fetchImpl?: typeof fetch): Octokit {
  return new Octokit({
    auth,
    retry: { enabled: false },
    throttle: { enabled: false },
    ...(fetchImpl ? { request: { fetch: fetchImpl } } : {}),
  });
}
