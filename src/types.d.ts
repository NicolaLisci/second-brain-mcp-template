declare module "*.txt" {
  const s: string;
  export default s;
}

/**
 * Secrets are set with `wrangler secret put`, so they never appear in wrangler.jsonc and
 * `wrangler types` cannot see them. Declared here so they merge into the generated `Env`.
 */
interface SecondBrainSecrets {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  COOKIE_ENCRYPTION_KEY: string;
  GITHUB_PAT: string;
  HMAC_SECRET: string;
  ALLOWED_LOGIN: string;
  GITHUB_OWNER: string;
  WORK_VAULT_REPO: string;
  PERSONAL_VAULT_REPO: string;
  VAULT_BRANCH?: string;
  CAPTURE_TIMEZONE?: string;
  DENYLIST_TERMS?: string;
}

interface Env extends SecondBrainSecrets {}

/** `import { env } from "cloudflare:workers"` reads Cloudflare.Env, a separate interface. */
declare namespace Cloudflare {
  interface Env extends SecondBrainSecrets {}
}
