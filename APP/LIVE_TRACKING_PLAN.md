# Live Tracking Center — Plano Operacional

Atualizado em: 2026-02-10 23:53:11 UTC

## Objetivo
Transformar o painel Live no centro de rastreamento real das tarefas do dashboard.

## Estrutura recomendada
1. Fila em tempo real por missão (missionId, owner, status).
2. Prova de execução sempre visível (status/evidence/session).
3. Linha do tempo por missão (from/to, actor, timestamp, reason).
4. Alertas de falha e bloqueio sem proof.

## Próximos parafusos
- Corrigir consistência de status (execution.status vs executionStatus).
- Eliminar eventos com missionId unknown.
- Exibir timeline dedicada no Live por missão selecionada.
