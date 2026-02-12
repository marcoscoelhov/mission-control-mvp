# Mission Control (Reino) — Docs

Este diretório é a documentação operacional do **Mission Control** (dashboard oficial do Reino do Marcos).

## TL;DR (o que é)
- Um **kanban de missões** com execução real via OpenClaw.
- O board é **fonte de verdade** do estado.
- Missões possuem **contrato** (tipo/risco/critério de sucesso/proof).

## URLs
- Dashboard/UI: `http://<host>:8080/`
- API health: `GET /api/health`

## Como rodar (dev)
No servidor:

```bash
cd /root/.openclaw/workspace-stark/APP
python3 app_server.py
```

O server sobe em `0.0.0.0:8080`.

## Arquivos importantes
- `index.html`, `styles.css`, `script.js` — UI
- `app_server.py` — backend (API + execução)
- `data.json` — estado do board (persistido)
- `MISSOES_TRAJETO.md` — trilha/histórico em texto
- `MISSAO.md` — constituição do Reino (regras e gates)

## Leitura recomendada
- `OPERACAO.md` (como o Marcos opera)
- `FLUXO.md` (estados + gates)
- `TROUBLESHOOTING.md`
- `GLOSSARIO.md`
