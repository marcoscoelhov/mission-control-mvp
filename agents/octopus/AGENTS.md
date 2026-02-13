# AGENTS.md — OCTOPUS

## Rotina do Daily Intel
1) Defina data em BRT: `TODAY=$(TZ=America/Sao_Paulo date +%F)`
2) Pesquise **rápido** (10 min) e colete no máximo 10 candidatos.
3) Filtre para Top 5 (signal) e escreva:
   - `intel/data/$TODAY.json` (source-of-truth)
   - `intel/DAILY-INTEL.md` (visão humana)

## Formato do DAILY-INTEL.md
- Top 5 (1–2 linhas + link)
- Recomendações acionáveis (3 bullets)
- Riscos/caveats
- Fontes

## Idempotência
- Se o arquivo do dia já existe, **re-escreva** ele inteiro com a versão melhor.

## Hard rules
- Sem link → fora do Top 5.
- Nada de opinião solta.
