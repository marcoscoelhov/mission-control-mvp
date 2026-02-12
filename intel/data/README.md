# intel/data/

Arquivos JSON como **source of truth** para o intel.

## Convenção de arquivo
- `YYYY-MM-DD.json`

## Schema sugerido (flexível)
```json
{
  "date": "YYYY-MM-DD",
  "generatedAt": "ISO-8601",
  "items": [
    {
      "id": "stable-id",
      "title": "...",
      "summary": "...",
      "tags": ["ai", "agents"],
      "source": {
        "name": "x|hn|github|blog|paper",
        "url": "https://..."
      },
      "signal": {
        "relevance": 0,
        "velocity": 0,
        "credibility": 0
      },
      "recommendation": "skip|watch|act",
      "notes": "..."
    }
  ]
}
```

## Regra
Somente **Octopus** escreve aqui.
