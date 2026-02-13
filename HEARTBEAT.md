# HEARTBEAT.md — Self-healing do Reino

Objetivo: manter o sistema **rodando sozinho** (cron + gateway + execução), detectando falhas e forçando re-run quando fizer sentido.

## 0) Regra de silêncio
- Se tudo estiver OK: responder **HEARTBEAT_OK**.
- Se tiver falha: responder com **alerta curto + checklist** (sem textão).

## 1) Cron healthcheck (sempre)
Rodar:
- `openclaw cron list --json`

Calcular (mentalmente) idade desde o `lastRunAtMs`.

### Janelas de tolerância
- Jobs de **5 min**: stale se > **15 min**
- Jobs **diários**: stale se > **26 h**
- Jobs de **relatório a cada 2h**: stale se > **4 h**

### Jobs para monitorar (com ação automática)
1) **CRM auto-executor (every 5 min)**
   - id: `3e1ab231-500d-4b9f-8790-10ba395e7570`
   - Se stale (>15 min): `openclaw cron run 3e1ab231-500d-4b9f-8790-10ba395e7570 --force`

2) **Monitorar dashboard Mission Control (relatório detalhado)**
   - id: `194e0f2d-6cc2-47ed-b004-25ec2eb827a2`
   - Se stale (>4 h): `openclaw cron run 194e0f2d-6cc2-47ed-b004-25ec2eb827a2 --force`

3) **Thor Daily Git Push (00:00)**
   - id: `4f76d5ea-66d3-4ed1-bcc2-41b1049ef77c`
   - Se stale (>26 h): `openclaw cron run 4f76d5ea-66d3-4ed1-bcc2-41b1049ef77c --force`

4) **Octopus Daily Intel (08:05 BRT)**
   - id: `74cd09fa-8011-4081-b725-abe8af1ec3b8`
   - Se stale (>26 h): `openclaw cron run 74cd09fa-8011-4081-b725-abe8af1ec3b8 --force`

5) **Loki Drafts from Intel (08:20 BRT)**
   - id: `da7b64d1-1a5c-4597-9767-c9268fb7f8f6`
   - Se stale (>26 h): `openclaw cron run da7b64d1-1a5c-4597-9767-c9268fb7f8f6 --force`

## 2) Detecção de degradação (sem loop infinito)
Para qualquer job:
- Se `lastStatus=error` **ou** `consecutiveErrors >= 2`:
  - **NÃO** forçar re-run repetido em heartbeat.
  - Reportar: `job name`, `lastError` (1 linha), e sugerir correção (ex.: aumentar `timeoutSeconds`, ajustar script).

## 3) Quick gateway check (somente se há erros)
Se houver 2+ jobs com erro ou stale persistente após 1 force:
- Rodar: `openclaw gateway status`
- Se gateway não estiver healthy: recomendar `openclaw gateway restart` (não executar sem pedido explícito).
