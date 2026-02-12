# intel/

Barramento de **inteligência** do Reino.

## Princípios
- **Um escreve, muitos leem**:
  - **Escritor canônico:** `Octopus` (Intel/Pesquisa)
  - **Leitores típicos:** Loki (conteúdo), Wanda (UX), Thanos (execução), Vision/Batman (QA), Stark (orquestração)
- Markdown é para humanos; JSON é a **fonte de verdade**.

## Estrutura
- `DAILY-INTEL.md` → visão humana do dia (resumo + links + recomendações)
- `data/YYYY-MM-DD.json` → dados estruturados (dedupe/histórico)

## Regras
- Ninguém além do Octopus deve editar `DAILY-INTEL.md` ou `data/*.json`.
- Se precisar corrigir algo: abra um card/solicitação para o Octopus.
