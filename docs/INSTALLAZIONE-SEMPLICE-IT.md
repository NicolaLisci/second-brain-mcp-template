# Installazione semplice — guida in italiano

Questa guida è pensata per chi vuole replicare il Second Brain senza essere esperto di sviluppo.

## Cosa otterrai

Alla fine avrai:

- un archivio personale di note;
- un archivio di note di lavoro;
- un piccolo server su Cloudflare che permette agli assistenti AI di leggere e aggiornare quelle note;
- accesso protetto tramite il tuo account GitHub;
- opzionalmente un bot Telegram per salvare conoscenza dal telefono.

Non devi imparare a programmare per seguire l'installazione.

## Metodo consigliato

Apri questo repository con Claude Code, Codex o un altro agente di coding e incolla:

```text
Leggi docs/AGENT-INSTALLER.md e guidami nell'installazione di questo Second Brain.

Considera che non sono una persona tecnica:
- spiegami ogni passaggio in modo semplice;
- fammi fare una sola operazione esterna alla volta;
- quando puoi eseguire tu un comando o modificare un file, fallo tu;
- quando devo cliccare qualcosa su GitHub o Cloudflare, dimmi esattamente dove andare;
- verifica ogni passaggio prima di proseguire;
- non chiedermi mai di incollare password, token o secret nella chat;
- se devo inserire un secret, fammelo incollare direttamente nel terminale o nell'interfaccia corretta.
```

L'agente userà `docs/AGENT-INSTALLER.md` come procedura operativa.

## Cosa ti servirà

Prima di iniziare assicurati di avere:

1. un account GitHub;
2. un account Cloudflare;
3. Claude Code, Codex o un agente equivalente installato sul computer;
4. circa due repository GitHub privati da creare durante la procedura.

Telegram è opzionale e può essere aggiunto in un secondo momento.

## Concetti essenziali

**Vault**: è semplicemente il repository che contiene le tue note Markdown.

**Work / Personal**: il sistema tiene separate le conoscenze professionali da quelle personali.

**MCP**: è il collegamento che permette all'assistente AI di usare il tuo Second Brain.

**Cloudflare Worker**: è il piccolo servizio online che fa da ponte tra l'AI e i tuoi vault.

**GitHub OAuth**: è il login che assicura che solo il tuo account possa collegarsi.

**PAT**: è una credenziale che permette al Worker di leggere e scrivere solo nei repository che autorizzi.

## Come capisci che funziona

L'installazione è completata quando puoi chiedere all'assistente:

```text
Cerca nel mio Second Brain la nota di prova.
```

e poi dirgli:

```text
Ricorda questa decisione: per il progetto di prova userò l'opzione A.
```

La prima richiesta deve trovare una nota esistente. La seconda deve creare o aggiornare una nota attraverso `sb_capture`.

## Sicurezza

Non rendere pubblici i repository contenenti le tue note.

Il repository pubblico è soltanto il codice del sistema.

I token e i secret non devono mai essere salvati nel repository o incollati in una chat.
