import { answerQuestion, classifyMessage, type AiDecision, type AiLike, type AiNote } from "./ai-router";
import { vaultsFromEnv, type VaultId } from "./config";
import { capture, type CaptureResult } from "./capture";
import { GitHubVault } from "./github";
import { createOctokit } from "./octokit";
import { ANSWER_COVERAGE, searchVault, type SearchResult } from "./search";
import { clearPending, putPending, readClarificationAnswer, takePending, type KvLike, type PendingCapture } from "./pending";
import { loadDenylist } from "./validate";
import { resolveRelated, vaultContext, type VaultContext } from "./vault-context";
import { chooseVault } from "./vault-router";
import DENYLIST from "../denylist.txt";

type TelegramUser = { id: number; username?: string; first_name?: string; last_name?: string };
type TelegramChat = { id: number; title?: string; username?: string };
type TelegramDocument = { file_id: string; file_name?: string; mime_type?: string };
type TelegramPhotoSize = { file_id: string; width: number; height: number };
type TelegramForwardOrigin = { type?: string; date?: number; sender_user?: TelegramUser; sender_user_name?: string; chat?: TelegramChat };
type TelegramMessage = { message_id: number; text?: string; caption?: string; from?: TelegramUser; chat: TelegramChat; date: number; forward_origin?: TelegramForwardOrigin; forward_from?: TelegramUser; forward_sender_name?: string; forward_date?: number; photo?: TelegramPhotoSize[]; document?: TelegramDocument };
type TelegramUpdate = { update_id: number; message?: TelegramMessage };
type TelegramEnv = Env & { TELEGRAM_BOT_TOKEN: string; TELEGRAM_WEBHOOK_SECRET: string; TELEGRAM_ALLOWED_USER_ID: string; AI?: AiLike; OAUTH_KV?: KvLike };
type VaultSelection = "personal" | "work";
export type ParsedIntent = { kind: "help" } | { kind: "ask"; query: string; vault: VaultSelection | "both" } | { kind: "save"; text: string; vault: VaultSelection; forced: boolean } | { kind: "auto"; text: string };

const URL_RE = /https?:\/\/[^\s<>]+/gi;
const DURABLE_PATTERNS = [/\b(decisione|deciso|scegliamo|scelto|preferisco|preferenza|ricordami|ricorda|configurazione|configurato|setup|impostazione|regola|vincolo|criterio|architettura|progetto|obiettivo|idea|soluzione|problema risolto|funziona così|account|repo|repository|worker|mcp|workflow|processo|procedura)\b/i,/\b(decision|decided|prefer|preference|remember|configuration|configured|setup|rule|constraint|architecture|project|goal|idea|solution|resolved|workflow|process|procedure)\b/i];
const TRANSIENT_PATTERNS = [/^(ok|okay|va bene|perfetto|grazie|thanks|test|prova|ciao|hello|hey|ci sei)[.!?\s]*$/i,/^(sì|si|no)[.!?\s]*$/i];

/**
 * Conversational first: the owner writes normally and Workers AI decides intent, vault, relevance
 * and the shape of the note. /save, /work and /ask stay as explicit overrides — and the regex
 * heuristics below stay as the fallback for when the model is unavailable or answers badly.
 */
export async function handleTelegram(request: Request, env: TelegramEnv): Promise<Response> {
  if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) return new Response("forbidden", { status: 403 });
  let update: TelegramUpdate;
  try { update = await request.json<TelegramUpdate>(); } catch { return new Response("bad request", { status: 400 }); }
  const message = update.message;
  if (!message?.from) return new Response("ok");
  if (String(message.from.id) !== env.TELEGRAM_ALLOWED_USER_ID) return new Response("forbidden", { status: 403 });
  if (message.photo?.length || message.document) {
    await reply(env, message.chat.id, "📎 Allegato ricevuto. L'estrazione da foto e documenti non è ancora attiva; aggiungi una didascalia testuale se vuoi salvarne subito il contesto.");
    if (!message.caption?.trim()) return new Response("ok");
  }
  const raw = (message.text ?? message.caption ?? "").trim();
  if (!raw) return new Response("ok");
  const intent = parseIntent(raw);
  if (intent.kind === "help") { await reply(env, message.chat.id, helpText()); return new Response("ok"); }

  try {
    const octokit = createOctokit(env.GITHUB_PAT);
    const vaultConfig = vaultsFromEnv(env);
    const clients = { work: new GitHubVault(octokit, "work", vaultConfig), personal: new GitHubVault(octokit, "personal", vaultConfig) };
    const deps = { clients, hmacSecret: env.HMAC_SECRET, denylist: loadDenylist(`${DENYLIST}\n${(env.DENYLIST_TERMS || "").replace(/,/g, "\n")}`), capturedBy: "telegram", now: () => new Date(), timezone: env.CAPTURE_TIMEZONE || "UTC" };

    // An outstanding vault question is answered in plain language; anything else drops it and is
    // treated as a new message, so a forgotten question can never swallow the next thing written.
    if (intent.kind === "auto") {
      const pending = await takePending(env.OAUTH_KV, message.chat.id);
      if (pending) {
        const answer = readClarificationAnswer(raw);
        await clearPending(env.OAUTH_KV, message.chat.id);
        if (answer === "cancel") { await reply(env, message.chat.id, "🗑️ Va bene, l'ho scartato."); return new Response("ok"); }
        if (answer) {
          const plan = { vault: answer, note: pending.note, trigger: "auto" as const, reason: "vault scelto da te" };
          await reply(env, message.chat.id, await runSave(env, message.chat.id, deps, plan, { urls: pending.urls, forwarded: pending.forwarded, source: pending.source }));
          return new Response("ok");
        }
      }
    }

    if (intent.kind === "ask") {
      await reply(env, message.chat.id, await runAsk(env, clients, intent.query, intent.vault));
      return new Response("ok");
    }

    const text = intent.text;
    const forwarded = isForwarded(message);
    const urls = extractUrls(text);
    // Links are read before classifying, so the model structures the article and not just the URL.
    const enriched = urls.length ? await enrichLinks(text, urls) : { summary: text, sources: [] as Array<{ kind: "url"; ref: string }> };
    const linkContent = enriched.summary === text ? undefined : enriched.summary.slice(text.length).trim();

    // The model classifies against the real vaults: nearby notes anchor the routing and the
    // wikilinks, the tag vocabulary stops it inventing synonyms. `capture` reloads the same
    // snapshot from cache, so on the vault that gets written this costs no extra request.
    const vaults = env.AI ? await vaultContexts(clients, intent, text) : undefined;
    const decision = (await classifyMessage(env.AI, { text, forwarded, urls, linkContent, vaults }))
      ?? await heuristicDecision(clients, text, forwarded, urls, enriched.summary);
    const plan = planMessage(intent, decision, text);

    switch (plan.action) {
      case "ignore":
        await reply(env, message.chat.id, `↪️ Non l'ho salvato: ${plan.reason}\nUsa /save o /work con lo stesso testo per forzarlo.`);
        break;
      case "ask":
        await reply(env, message.chat.id, await runAsk(env, clients, plan.query, plan.vault));
        break;
      case "clarify": {
        const pending: PendingCapture = { text, forwarded, urls, note: plan.note, source: telegramSource(message), askedAt: Date.now() };
        await putPending(env.OAUTH_KV, message.chat.id, pending);
        await reply(env, message.chat.id, formatClarification(plan.note, plan.reason, Boolean(env.OAUTH_KV)));
        break;
      }
      case "save":
        await reply(env, message.chat.id, await runSave(env, message.chat.id, deps, plan, { urls, forwarded, source: telegramSource(message), urlSources: enriched.sources }));
        break;
    }
  } catch (error) {
    console.error("Telegram handler failed", error);
    await reply(env, message.chat.id, `❌ Operazione non riuscita: ${error instanceof Error ? error.message : "errore sconosciuto"}`);
  }
  return new Response("ok");
}

export type Plan =
  | { action: "ask"; query: string; vault: VaultSelection | "both" }
  | { action: "save"; vault: VaultSelection; note: AiNote; trigger: "auto" | "explicit"; reason: string }
  | { action: "clarify"; note: AiNote; reason: string }
  | { action: "ignore"; reason: string };

/** Below this the model's own vault choice is not worth trusting, whatever it claims. */
const CLARIFY_BELOW = 0.4;

/**
 * Turn an explicit command plus the model's decision into one action. Pure, so the whole routing
 * matrix is testable without a network. Commands override intent and vault, never the note: a
 * `/save` still gets the structure the model produced for it.
 */
export function planMessage(intent: ParsedIntent, decision: AiDecision, text: string): Plan {
  const note = decision.note ?? fallbackNote(text);
  if (intent.kind === "ask") return { action: "ask", query: intent.query, vault: intent.vault };
  if (intent.kind === "save") return { action: "save", vault: intent.vault, note, trigger: "explicit", reason: "comando esplicito" };

  switch (decision.intent) {
    case "ask":
      return { action: "ask", query: decision.query ?? text, vault: decision.vault ?? "both" };
    case "ignore":
      return { action: "ignore", reason: decision.reason };
    case "clarification":
      return { action: "clarify", note, reason: decision.reason };
    default:
      if (!decision.vault || decision.confidence < CLARIFY_BELOW) return { action: "clarify", note, reason: decision.reason };
      return { action: "save", vault: decision.vault, note, trigger: "auto", reason: `${Math.round(decision.confidence * 100)}%: ${decision.reason}` };
  }
}

/** What the bot did before Workers AI: regex relevance plus similarity-based vault routing. */
export async function heuristicDecision(
  clients: { work: GitHubVault<"work">; personal: GitHubVault<"personal"> },
  text: string, forwarded: boolean, urls: string[], summary = text,
): Promise<AiDecision> {
  const worthSaving = forwarded || urls.length > 0 || isDurableMessage(text);
  if (!worthSaving) return { intent: "ignore", vault: null, confidence: 0.5, reason: "sembra transitorio (euristica)" };
  const routed = await chooseVault(clients, text);
  return {
    intent: urls.length || forwarded ? "save_source" : "save",
    vault: routed.vault,
    confidence: routed.vault ? (routed.confidence === "high" ? 0.8 : 0.6) : 0.3,
    reason: `${routed.reason} (euristica)`,
    note: fallbackNote(text, summary),
  };
}

/** The note the bot wrote before the model structured them: the raw message, verbatim. */
export function fallbackNote(text: string, summary = text): AiNote {
  return { type: "source", title: makeTitle(text), summary, tags: [], related: [] };
}

/**
 * Both vaults when the message has to be routed; only the named one when a command already
 * decided it — there is nothing to route, and the other vault's tarball would be wasted.
 */
async function vaultContexts(
  clients: { work: GitHubVault<"work">; personal: GitHubVault<"personal"> },
  intent: ParsedIntent, text: string,
): Promise<Partial<Record<VaultId, VaultContext>>> {
  if (intent.kind === "save") return { [intent.vault]: await vaultContext(clients[intent.vault], text) };
  const [personal, work] = await Promise.all([vaultContext(clients.personal, text), vaultContext(clients.work, text)]);
  return { personal, work };
}

interface SaveContext {
  urls: string[];
  forwarded: boolean;
  source: { kind: "conversation"; ref: string; date?: string };
  urlSources?: Array<{ kind: "url"; ref: string }>;
}

async function runSave(
  env: TelegramEnv, chatId: number,
  deps: Parameters<typeof capture>[1],
  plan: { vault: VaultSelection; note: AiNote; trigger: "auto" | "explicit"; reason: string },
  ctx: SaveContext,
): Promise<string> {
  const { note } = plan;
  const { urls, forwarded } = ctx;
  // Only titles that resolve to a real note survive, as filename stems: an unresolved [[link]]
  // is a broken link in Obsidian, and the model is not the authority on what the vault holds.
  const related = await resolveRelated(deps.clients[plan.vault], note.related, note.title);
  const urlSources = ctx.urlSources ?? urls.map((ref) => ({ kind: "url" as const, ref }));
  // Provenance lives in the tags, the frontmatter and the commit — never in the body, where it
  // would make every capture look like a duplicate of every other one.
  const tags = [...note.tags, "telegram", plan.trigger === "explicit" ? "explicit" : "auto", `vault-${plan.vault}`];
  if (forwarded) tags.push("forwarded");
  if (urls.length) tags.push("link");
  const uniqueTags = [...new Set(tags)];
  const baseInput = {
    // Telegram is a capture channel, not a filing system: even a forced /save lands in 00 Inbox
    // to be filed later. `trigger` keeps saying who asked for it.
    vault: plan.vault, type: note.type, title: note.title, trigger: plan.trigger, destination: "inbox" as const,
    fields: {
      summary: note.summary,
      why_it_matters: note.why_it_matters, fact: note.fact, idea: note.idea, decision: note.decision, action: note.action,
      related, sources: [...urlSources, ctx.source], tags: uniqueTags,
    },
  };
  let result = await capture({ ...baseInput, mode: "check" }, deps);
  // Explicit commands mean exactly that: the user has already decided this should be a new note.
  // We still run check first so capture() issues a signed dedup token — and so the near-duplicates
  // can be named in the reply instead of being dropped on the floor.
  let similar: string[] = [];
  if (plan.trigger === "explicit" && result.status === "candidates") {
    similar = result.candidates.map((c) => c.path);
    result = await capture({ ...baseInput, mode: "new", dedup_token: result.dedup_token }, deps);
  }
  return formatReply(result, plan.vault, plan.trigger === "auto" ? plan.reason : null, similar);
}

export function parseIntent(raw:string):ParsedIntent{const t=raw.trim();if(t==="/start"||t==="/help")return{kind:"help"};const aw=commandBody(t,"/askwork");if(aw!==null)return{kind:"ask",query:aw,vault:"work"};const ap=commandBody(t,"/askpersonal");if(ap!==null)return{kind:"ask",query:ap,vault:"personal"};const a=commandBody(t,"/ask");if(a!==null)return{kind:"ask",query:a,vault:"both"};const sw=commandBody(t,"/savework");if(sw!==null)return{kind:"save",text:sw,vault:"work",forced:true};const s=commandBody(t,"/save");if(s!==null)return{kind:"save",text:s,vault:"personal",forced:true};const w=commandBody(t,"/work");if(w!==null)return{kind:"save",text:w,vault:"work",forced:true};return{kind:"auto",text:t};}
export function isDurableMessage(text:string):boolean{const n=text.trim();if(!n||TRANSIENT_PATTERNS.some(p=>p.test(n)))return false;if(extractUrls(n).length||DURABLE_PATTERNS.some(p=>p.test(n))||n.length>=180)return true;return n.length>=90&&n.split(/[.!?]\s+/).filter(Boolean).length>=2;}
function commandBody(text:string,command:string):string|null{if(text===command)return"";if(!text.startsWith(`${command} `))return null;return text.slice(command.length).trim();}
function extractUrls(text:string):string[]{return[...new Set(text.match(URL_RE)??[])].map(u=>u.replace(/[),.;!?]+$/, ""));}
function isForwarded(m:TelegramMessage):boolean{return Boolean(m.forward_origin||m.forward_from||m.forward_sender_name||m.forward_date);}
function telegramSource(m:TelegramMessage){const o=forwardOriginLabel(m);return{kind:"conversation" as const,ref:o?`telegram:${m.chat.id}:${m.message_id}:forwarded-from:${o}`:`telegram:${m.chat.id}:${m.message_id}`,date:new Date(m.date*1000).toISOString()};}
function forwardOriginLabel(m:TelegramMessage):string|null{const o=m.forward_origin;if(o?.sender_user)return o.sender_user.username?`@${o.sender_user.username}`:String(o.sender_user.id);if(o?.sender_user_name)return o.sender_user_name;if(o?.chat)return o.chat.username?`@${o.chat.username}`:o.chat.title??String(o.chat.id);if(m.forward_from)return m.forward_from.username?`@${m.forward_from.username}`:String(m.forward_from.id);return m.forward_sender_name??null;}
/** Search, then let the model answer from what was found; the hits are listed underneath either way. */
async function runAsk(env: TelegramEnv, clients: { work: GitHubVault<"work">; personal: GitHubVault<"personal"> }, query: string, vault: VaultSelection | "both"): Promise<string> {
  const results = await askSecondBrain(clients, query, vault);
  const answer = await answerQuestion(env.AI, query, results.slice(0, 4));
  return formatAskResults(query, results, answer);
}

async function askSecondBrain(c:{work:GitHubVault;personal:GitHubVault},q:string,v:VaultSelection|"both"):Promise<SearchResult[]>{
  if(!q.trim())return[];
  const ids=v==="both"?(["work","personal"] as const):([v] as const);
  const all=(await Promise.all(ids.map(id=>searchVault(c[id],q,5)))).flat().sort((a,b)=>b.score-a.score);
  // Relevance for a human, not for the dedup. A note that shares no query word at all is here
  // only because something that did match links to it: never show that. Among the rest, a note
  // covering two query words beats one covering a single word, and pushes it out of the list.
  // Relevance for a human, not for the dedup: keep what carries enough of the question, weighted
  // by how rare each word is in the vault. No fallback on purpose — when nothing clears the bar,
  // an honest "non ho trovato nulla" beats a note that shares one word by accident.
  return all.filter(r=>r.coverage>=ANSWER_COVERAGE).slice(0,5);
}
function formatAskResults(q:string,r:SearchResult[],answer:string|null=null):string{
  if(!q.trim())return"Usa /ask seguito da una domanda o da parole chiave.";
  if(!r.length)return`🔎 Non ho trovato nulla di rilevante per “${q}”.`;
  // With an answer the notes become citations; without one they are all the user gets, so they
  // keep their excerpts.
  if(answer)return`🧠 ${answer}\n\n📎 Fonti:\n${r.map((x,i)=>`${i+1}. [${x.vault}] ${x.title} — ${x.path}`).join("\n")}`;
  return`🧠 Risultati per “${q}”\n\n${r.map((x,i)=>`${i+1}. [${x.vault}] ${x.title}\n${truncate(x.excerpt,280)}\n${x.path}`).join("\n\n")}`;
}
async function enrichLinks(text:string,urls:string[]):Promise<{summary:string;sources:Array<{kind:"url";ref:string}>}>{const snippets:string[]=[];for(const url of urls.slice(0,3)){try{const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),5000);const response=await fetch(url,{redirect:"follow",signal:controller.signal,headers:{"user-agent":"SecondBrainBot/1.0"}});clearTimeout(timeout);if(!response.ok)continue;const ct=response.headers.get("content-type")??"";if(!ct.includes("text/html")&&!ct.includes("text/plain"))continue;const extracted=extractReadableText(await response.text(),ct);if(extracted)snippets.push(`${url}\n${truncate(extracted,1400)}`);}catch(error){console.warn("Telegram link enrichment failed",url,error);}}return{summary:snippets.length?`${text}\n\nContenuto estratto:\n${snippets.join("\n\n")}`:text,sources:urls.map(ref=>({kind:"url" as const,ref}))};}
function extractReadableText(body:string,ct:string):string{if(ct.includes("text/plain"))return collapseWhitespace(body).slice(0,5000);const clean=body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi," ");const title=clean.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]??"";return collapseWhitespace(`${decodeEntities(title)} ${decodeEntities(clean.replace(/<[^>]+>/g," "))}`).slice(0,5000);}
function decodeEntities(v:string):string{return v.replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'");}
function collapseWhitespace(v:string):string{return v.replace(/\s+/g," ").trim();}function truncate(v:string,max:number):string{return v.length<=max?v:`${v.slice(0,max-3).trimEnd()}...`;}
function makeTitle(text:string):string{const first=text.split(/\r?\n/,1)[0].replace(/^#+\s*/,"").trim();const compact=first.replace(/https?:\/\/\S+/g,"").replace(/\s+/g," ").trim()||first;return compact.length<=80?compact:`${compact.slice(0,77).trimEnd()}...`;}
function formatResult(r:CaptureResult):string{if(r.status==="created"||r.status==="updated"){const verb=r.status==="created"?"Salvato":"Aggiornato";return`✅ ${verb} in ${r.vault}: ${r.path}${r.warning?`\n⚠️ ${r.warning}`:""}`;}return`⚠️ Ho trovato possibili duplicati, quindi non ho salvato automaticamente:\n${r.candidates.slice(0,5).map(c=>`• ${c.path}`).join("\n")}\nUsa /save (o /work) con lo stesso testo per salvarlo comunque.`;}
export function formatReply(result:CaptureResult,vault:VaultSelection,routingReason:string|null,similar:string[]):string{const lines=[formatResult(result),`🧭 Vault: ${vault}${routingReason?` — ${routingReason}`:""}`];if(similar.length)lines.push(`ℹ️ Note simili già in vault:\n${similar.slice(0,5).map(p=>`• ${p}`).join("\n")}`);return lines.join("\n");}
function formatClarification(note:AiNote,reason:string,stateful:boolean):string{const lines=[`🤔 «${note.title}» vale la pena tenerlo, ma non capisco se sia personale o di lavoro (${reason}).`];lines.push(stateful?"Rispondi «personale» o «lavoro» — oppure «lascia perdere». Tengo il messaggio da parte per 10 minuti.":"Usa /save <testo> per personal oppure /work <testo> per work.");return lines.join("\n");}
function helpText():string{return["🧠 Memoria — Second Brain","","Scrivimi normalmente: capisco da solo se un messaggio va salvato, se è una domanda al vault e se riguarda personal o work, e ne ricavo titolo, tipo, sintesi e tag.","Se non capisco in quale vault va, te lo chiedo: rispondi «personale» o «lavoro».","","Comandi, solo come override:","/save <testo> → forza una nuova nota nel personal.","/work <testo> o /savework <testo> → forza una nuova nota nel work.","/ask <query> → cerca in entrambi i vault.","/askpersonal <query> → solo personal.","/askwork <query> → solo work.","","Link → estrae il contenuto leggibile e lo usa per strutturare la nota.","Messaggi inoltrati → trattati come fonti.","Foto/documenti → riconosciuti; estrazione prevista in seguito."].join("\n");}

async function reply(env:TelegramEnv,chatId:number,text:string):Promise<void>{const response=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:chatId,text:truncate(text,3900),disable_web_page_preview:true})});if(!response.ok)console.error("Telegram sendMessage failed",response.status,await response.text());}
