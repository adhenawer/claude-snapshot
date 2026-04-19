# claude-snapshot — Design Spec

**Data:** 2026-04-16
**Status:** Design aprovado, aguardando plano de implementacao
**Prior art:** Nenhum projeto relevante (ver secao Prior Art)

---

## Problema

Configurar Claude Code e um processo manual e fragil. Plugins, hooks, marketplaces extras, CLAUDE.md global, settings — tudo vive em `~/.claude/` sem mecanismo de export/import. Quem usa 2+ maquinas (pessoal + trabalho + VM) precisa recriar o setup manualmente toda vez.

## Solucao

Plugin do Claude Code que exporta um snapshot portavel do setup completo e aplica em outra maquina, recriando o ambiente identico.

**Metafora:** memory card de videogame — salva o estado, carrega em outro console.

---

## Prior Art

| Projeto | Stars | O que faz | Mata a ideia? |
|---|---|---|---|
| `elizabethfuentes12/claude-code-dotfiles` | 5 | Git wrapper simples para `~/.claude` | Nao — prova demanda, solucao minima |
| `zircote/.claude` | 21 | Repo de dotfiles curado (arquivado) | Nao — template, nao ferramenta |
| `claude-code-sync` (npm) | - | Sync de sessoes para dashboard | Nao — tracking, nao config |
| `claude-code-config` (npm) | - | Proxy/permission switcher | Nao — nao e sync cross-machine |

**Veredito:** Nenhum prior art serio. O projeto mais proximo tem 5 stars e e um Git wrapper sem resolucao de conflitos, diff, ou instalacao de plugins.

---

## Cenario de uso principal

Uso pessoal, 2-3 maquinas. Export no pessoal, arquivo no Drive, apply no trabalho. Setup identico em <2 minutos.

---

## Comandos

### `/snapshot export [--full] [--output <path>]`

Gera `claude-snapshot-YYYY-MM-DD.tar.gz` em `~/` (ou path especificado).

- **Default (slim):** manifest + settings + MDs + hooks + plugin manifests (~12K)
- **`--full`:** inclui caches de plugins para uso offline (~50M)

```
> /snapshot export

Exporting snapshot...
  ok settings.json (1.6K)
  ok CLAUDE.md, RTK.md (2 files)
  ok hooks/rtk-rewrite.sh (1 file)
  ok plugins manifest (8 user-scoped, 2 project-scoped skipped)
  ok marketplaces (3 extra)

Snapshot saved: ~/claude-snapshot-2026-04-16.tar.gz (12K)
```

### `/snapshot inspect <path>`

Le manifest.json do tarball sem extrair. Mostra resumo rapido.

```
> /snapshot inspect ~/claude-snapshot-2026-04-16.tar.gz

Snapshot from: macbook-pessoal (2026-04-16)
Plugins (8): superpowers@5.0.7, claude-mem@12.1.5, claude-hud@0.0.12, ...
Marketplaces (3): claude-plugins-official, thedotmack, claude-hud
Hooks (1): rtk-rewrite.sh
Global MDs (2): CLAUDE.md, RTK.md
Mode: slim (no plugin caches)
```

### `/snapshot diff <path>`

Compara snapshot vs setup atual da maquina.

```
> /snapshot diff ~/claude-snapshot-2026-04-16.tar.gz

Plugins:
  + claude-mem@12.1.5        (missing locally)
  + claude-hud@0.0.12        (missing locally)
  ~ superpowers 5.0.5 -> 5.0.7  (version mismatch)
  = context7@unknown          (match)

Hooks:
  + rtk-rewrite.sh           (missing locally)

Settings:
  ~ env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS  (missing locally)
  ~ permissions.defaultMode  (differs: default -> bypassPermissions)

Global MDs:
  + RTK.md                   (missing locally)
  ~ CLAUDE.md                (content differs, sha256 mismatch)
```

### `/snapshot apply <path>`

Aplica com confirmacao. Faz backup de conflitos (`.bak`).

```
> /snapshot apply ~/claude-snapshot-2026-04-16.tar.gz

Diff detected (run /snapshot diff for details):
  2 plugins to install
  1 plugin to upgrade
  1 hook to copy
  1 MD to add, 1 MD with conflicts
  settings.json changes

Apply all? [y/n]
```

Sequencia de apply:
1. Backup de arquivos que serao sobrescritos (`.bak`)
2. Copiar `settings.json`, MDs globais, hooks
3. Registrar marketplaces extras
4. Instalar plugins via `claude plugin install`
5. Com `--full`: copiar caches ao inves de baixar

---

## Anatomia do Snapshot

```
claude-snapshot-2026-04-16.tar.gz
|-- manifest.json
|-- settings.json
|-- global-md/
|   |-- CLAUDE.md
|   |-- RTK.md
|-- hooks/
|   |-- rtk-rewrite.sh
|-- plugins/
|   |-- installed_plugins.json
|   |-- known_marketplaces.json
|   |-- blocklist.json
|-- cache/                        # so com --full
    |-- <plugin-caches>/
```

### manifest.json

```json
{
  "version": "1.0.0",
  "exportedAt": "2026-04-16T14:30:00Z",
  "exportedFrom": "macbook-pessoal",
  "claudeCodeVersion": "2.1.x",
  "plugins": [
    { "name": "superpowers", "marketplace": "claude-plugins-official", "version": "5.0.7", "scope": "user" },
    { "name": "claude-mem", "marketplace": "thedotmack", "version": "12.1.5", "scope": "user" },
    { "name": "claude-hud", "marketplace": "claude-hud", "version": "0.0.12", "scope": "user" }
  ],
  "marketplaces": [
    { "name": "thedotmack", "source": "github", "repo": "thedotmack/claude-mem" },
    { "name": "claude-hud", "source": "github", "repo": "jarrodwatts/claude-hud" }
  ],
  "hooks": ["hooks/rtk-rewrite.sh"],
  "globalMd": ["CLAUDE.md", "RTK.md"],
  "checksums": {
    "settings.json": "sha256:abc...",
    "hooks/rtk-rewrite.sh": "sha256:def..."
  }
}
```

---

## Arquitetura do Plugin

### Stack

- Node.js (runtime padrao de plugins Claude Code)
- `tar` (npm) para criar/ler tarball
- `crypto` (built-in) para sha256 checksums
- Zero dependencias externas pesadas

### Estrutura

```
claude-snapshot/
|-- plugin.json
|-- package.json
|-- src/
|   |-- commands/
|   |   |-- export.ts
|   |   |-- apply.ts
|   |   |-- diff.ts
|   |   |-- inspect.ts
|   |-- core/
|   |   |-- collector.ts     # le ~/.claude/ e monta snapshot
|   |   |-- manifest.ts      # gera/parsea manifest.json
|   |   |-- reconciler.ts    # diff + merge logic
|   |   |-- installer.ts     # instala plugins/marketplaces no destino
|   |-- index.ts              # registra slash commands
|-- tests/
```

### Fluxo de dados

```
EXPORT:  ~/.claude/ -> collector -> manifest + tarball -> .tar.gz
INSPECT: .tar.gz -> le manifest.json -> print
DIFF:    .tar.gz manifest -> reconciler <- ~/.claude/ atual -> report
APPLY:   .tar.gz -> reconciler -> backup conflicts -> write files -> installer
```

### Decisoes tecnicas

| Decisao | Escolha | Motivo |
|---|---|---|
| Formato do arquivo | `.tar.gz` | Universal, diffavel, suporta binarios |
| Manifest dentro do tar | Sim, primeiro entry | `tar.list()` le sem extrair tudo |
| Plugin install no apply | Shell exec `claude plugin install` | Nao reimplementar logica de install |
| Conflito de arquivos | Backup `.bak` + aviso | Seguro, reversivel |
| Plugins project-scoped | Ignorados no export | Sao do projeto, nao do setup |
| Paths absolutos em hooks | Normalizar `$HOME` | Export: `/Users/adhenawer/` -> `$HOME/`. Apply: resolve pro `$HOME` local |
| Paths com versao de runtime (nvm, etc) | Reescrita no export | StatusLine pode ter `/Users/x/.nvm/versions/node/vX.Y.Z/bin/node`; export reescreve para `node` (usa PATH do destino) pra evitar falha silenciosa quando a versao nao existe na outra maquina |

---

## O que migra vs o que nao migra

| Artefato | Migra? | Motivo |
|---|---|---|
| `settings.json` | Sim | Core do setup (plugins, hooks, permissions, env, statusLine) |
| `CLAUDE.md` + `*.md` globais | Sim | Instrucoes pessoais |
| `plugins/installed_plugins.json` | Sim | Manifest de plugins |
| `plugins/known_marketplaces.json` | Sim | Registros de marketplaces extras |
| `plugins/blocklist.json` | Sim | Lista de bloqueio |
| `hooks/*.sh` | Sim | Scripts de hook customizados |
| `sessions/`, `projects/`, `plans/` | Nao | Dados de sessao, locais |
| `cache/`, `telemetry/` | Nao | Dados efemeros |
| `history.jsonl` | Nao | Historico de comandos local |
| `stats-cache.json` | Nao | Cache local |

---

## Escopo do MVP (v0.1.0)

### Inclui

- `/snapshot export` (slim)
- `/snapshot export --full` (com caches)
- `/snapshot inspect <path>`
- `/snapshot diff <path>`
- `/snapshot apply <path>` (com confirmacao + backup `.bak`)
- Normalizacao de paths absolutos (`$HOME`)
- Publicacao como plugin em marketplace GitHub

### Fora do MVP (backlog)

| Feature | Motivo |
|---|---|
| `--selective` interativo no apply | Complexidade de UX; diff antes + all-or-nothing resolve |
| Sync automatico (watch + push) | Over-engineering para 2-3 maquinas |
| Encriptacao do snapshot | Uso pessoal via Drive; adicionar se virar team |
| Merge inteligente de CLAUDE.md | Dificil fazer bem; backup `.bak` e seguro |
| MCP servers config | Investigar se existe config centralizada; v0.2 |
| Diff visual (HTML report) | Nice-to-have |

---

## Criterios de sucesso (3 meses)

- **Funcional:** export + apply produz setup identico em <2min
- **Pessoal:** uso semanal entre maquinas sem atrito
- **Comunidade:** validado por terceiros

---

## Riscos e mitigacoes

| Risco | Probabilidade | Mitigacao |
|---|---|---|
| Anthropic adiciona sync nativo | Media | Focar em features que Anthropic nao faria (diff, inspect, offline) |
| Estrutura de `~/.claude/` muda entre versoes | Alta | Manifest versionado; detect breaking changes no apply |
| `claude plugin install` CLI muda de interface | Media | Wrapper isolado em `installer.ts`; facil de atualizar |
| Hooks com dependencias externas (ex: RTK binario) | Baixa | Documentar que o snapshot copia scripts, nao dependencias do sistema |
