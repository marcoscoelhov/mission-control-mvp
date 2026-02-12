# Troubleshooting — Mission Control

## 1) Cliquei em “Enviar missão” e não acontece nada
Causas comuns:
- faltou preencher **Critérios de sucesso** (obrigatório)
- cache do browser (JS antigo)

Ação:
- fazer hard refresh (fechar aba e abrir de novo)
- checar se aparece toast com instrução

## 2) Missão ficou presa em "running"
Causa:
- reinício do `app_server.py` durante execução (thread morre)

Ação:
- reexecutar a missão (o backend permite override de running)

## 3) Não aparece "Aguardando você" / "Proof pendente" no mobile
Causa:
- versão antiga do JS (cache)

Ação:
- hard refresh

## 4) Done bloqueado
Verifique:
- PROOF existe (status effective + evidence)
- Risco 1: precisa aprovação Jarvis
- Risco 2: precisa OK Marcos

## 5) Como eu respondo quando pede decisão?
Sempre pelo dashboard:
- Card → **Responder agora**
- Formato:
  OBJETIVO / ARQUIVO-ALVO / SUCESSO
