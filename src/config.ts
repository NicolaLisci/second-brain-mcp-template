export type VaultId = "work" | "personal";
export type NoteType = "concept" | "project" | "area" | "source";

export type VaultConfig = Record<VaultId, { owner: string; repo: string; branch: string }>;

export const VAULTS: VaultConfig = {
  work: { owner: "your-github-username", repo: "second-brain-work", branch: "main" },
  personal: { owner: "your-github-username", repo: "second-brain-personal", branch: "main" },
};

export function vaultsFromEnv(env: {
  GITHUB_OWNER?: string;
  WORK_VAULT_REPO?: string;
  PERSONAL_VAULT_REPO?: string;
  VAULT_BRANCH?: string;
}): VaultConfig {
  const owner = env.GITHUB_OWNER?.trim();
  const workRepo = env.WORK_VAULT_REPO?.trim();
  const personalRepo = env.PERSONAL_VAULT_REPO?.trim();
  const branch = env.VAULT_BRANCH?.trim() || "main";
  if (!owner || !workRepo || !personalRepo) {
    throw new Error("Missing vault configuration: set GITHUB_OWNER, WORK_VAULT_REPO and PERSONAL_VAULT_REPO");
  }
  return {
    work: { owner, repo: workRepo, branch },
    personal: { owner, repo: personalRepo, branch },
  };
}

export const INBOX_DIR = "00 Inbox";
export const TEMPLATE_DIR = "90 System/Templates";
export const CAPTURE_TIMEZONE = "UTC";

export function folderFor(type: NoteType): string {
  switch (type) {
    case "project": return "10 Projects";
    case "area": return "20 Areas";
    default: return "30 Resources";
  }
}

export function templatePath(type: NoteType): string {
  const name = type.charAt(0).toUpperCase() + type.slice(1);
  return `${TEMPLATE_DIR}/${name}.md`;
}

export function slugify(title: string): string {
  const slug = title
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "note";
}

export function inboxPath(title: string, now: Date, timeZone = CAPTURE_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const partMap: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") partMap[part.type] = part.value;
  }

  let hour = partMap.hour || "00";
  hour = hour === "24" ? "00" : hour;
  const stamp = `${partMap.year}-${partMap.month}-${partMap.day} ${hour}${partMap.minute}`;
  return `${INBOX_DIR}/${stamp} ${slugify(title)}.md`;
}

export function explicitPath(type: NoteType, title: string): string {
  const safe = title.replace(/[\/\\]/g, "-").replace(/:/g, " -").replace(/[<>"|?*]/g, "").replace(/\s+/g, " ").trim();
  return `${folderFor(type)}/${safe || "note"}.md`;
}
