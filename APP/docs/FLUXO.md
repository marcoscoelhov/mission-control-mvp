# Fluxo oficial (Pipeline) — Mission Control

## Estados do board
- **Entrada** (`inbox`)
- **Delegadas** (`assigned`)
- **Executando** (`in_progress`)
- **Em revisão** (`review`)
- **Concluídas** (`done`)
- **Proof pendente** (`proof_pending`)
- **Aguardando você** (`awaiting_monarca`)
- **Falharam** (`failed`)

> Observação: internamente o sistema usa chaves normalizadas (`normalizeColumnKey`).

## Gates (regras de passagem)

### Gate Jarvis (aprovação)
- Para avançar com mudanças de **Risco ≥ 1**, exige **Aprovação do Jarvis**.

### Gate Marcos (OK)
- Para **Risco 2**, exige **OK do Marcos**.

### Gate PROOF (Done)
- `Done` só entra se:
  - `execution.status = effective`
  - `execution.evidence[]` não vazio

## PROOF: o que vale
Preferências (ordem):
1) diff/commit hash
2) output de comando
3) screenshot/link

## Rotas de falha
- Se execução rodou mas proof falhou → **Proof pendente**
- Se faltou contexto/decisão → **Aguardando você**
- Se crash/erro → **Falharam**
