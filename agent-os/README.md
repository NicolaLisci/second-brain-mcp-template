# Il tuo second brain con l'AI

Questo pacchetto ti dà due cose:

1. **Un second brain**: due archivi di note Obsidian (uno per il lavoro, uno personale) che gli assistenti AI leggono e aggiornano per te. Ricordano decisioni, preferenze, progetti, fonti.
2. **Una configurazione unica per tutte le AI**: un solo file di regole (`AGENT.md`), una scheda su di te (`Me.md`) e una memoria delle tue correzioni (`MEMORY.md`). Claude Code, Codex, l'app Claude e ChatGPT seguono tutti le stesse regole e conoscono le stesse cose di te.

Cambi una regola in un posto e vale ovunque.

## Come funziona, in una frase per pezzo

- Le note stanno su **GitHub**, in due repository privati. Obsidian le mostra sul Mac.
- Un piccolo **server su Cloudflare** (gratuito) fa da ponte: le AI ci parlano per cercare e salvare note.
- Mentre lavori, l'AI **salva da sola** le cose importanti nella cartella `00 Inbox` e te lo dice in una riga.
- Ogni tanto scrivi **"sb-review"**: l'AI ti mostra le note nuove e tu decidi cosa tenere e dove metterlo.

## Installazione

Non devi saper programmare. Ti serve un'ora e:

- un Mac;
- un account **GitHub** e uno **Cloudflare** (si creano gratis durante l'installazione);
- **Claude Code** installato (https://claude.com/claude-code), oppure Codex;
- facoltativo: **Obsidian** per sfogliare le note.

Apri il Terminale nella cartella principale di questo repository, avvia `claude` e incolla:

```text
Leggi agent-os/INSTALLA.md e guidami nell'installazione.
Non sono una persona tecnica: fammi fare una cosa alla volta,
fai tu i comandi che puoi fare tu, e non chiedermi mai di
incollare password o token nella chat.
```

L'agente ti accompagna passo per passo.

## Uso quotidiano

| Vuoi… | Scrivi all'AI |
|---|---|
| Salvare qualcosa | "salva nel second brain che…" |
| Ritrovare una decisione | "cosa avevo deciso su…?" |
| Importare documenti esistenti | "scansiona questa cartella per il second brain" |
| Riordinare le note nuove | "sb-review" |
| Correggere come lavora l'AI | dillo: finisce in `MEMORY.md` e vale per tutte |

## Cosa c'è qui dentro

```
vault-work/        contenuto iniziale del vault di lavoro
  90 System/Agents/  la configurazione centrale delle AI (regole, Me, memoria, skill, script)
vault-personal/    contenuto iniziale del vault personale
app-web.md         istruzioni da incollare in Claude (app/web) e ChatGPT
INSTALLA.md        procedura che l'agente segue per installare tutto
```
