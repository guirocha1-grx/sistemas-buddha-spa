# Referência técnica — Azure Responses API e ferramentas

## Compatibilidade de raciocínio e web search

Na Azure OpenAI Responses API, `web_search` é uma ferramenta declarada no campo `tools`. Para busca agentiva com modelos de raciocínio, a documentação orienta `reasoning.effort` em `medium` ou `high`; o exemplo de filtro de domínio usa `low`.

Em 2026-08-18, o erro de produção dos agentes confirmou que `web_search` não pode ser usado com `reasoning.effort` em `minimal`. Por isso, as chamadas dos agentes do CRM usam esforço `low`, preservando uma configuração de custo e latência reduzidos sem conflitar com a ferramenta que o provedor pode anexar.

## Fontes oficiais

- [Web search with the Responses API — Microsoft Foundry](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/web-search)
- [Azure OpenAI reasoning models — Microsoft Foundry](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/reasoning)
