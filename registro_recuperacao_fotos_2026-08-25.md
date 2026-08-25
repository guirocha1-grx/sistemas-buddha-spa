# Registro de recuperação de fotos do Inbox — 25/08/2026

## Contexto

Após a migração da aplicação para Railway, algumas conversas do WhatsApp continuaram apontando para fotos armazenadas antes da migração. Essas referências não eram mais encontradas no bucket atual, gerando respostas `NoSuchKey` para mídias antigas. Ao mesmo tempo, a presença de `fotoUrl` na conversa evitava uma nova consulta à Z-API.

O comportamento de cache foi preservado: depois de uma consulta válida, seja com foto retornada ou com ausência de foto confirmada, a conversa não deve consultar a Z-API novamente em cada mensagem.

## Ação aplicada no TiDB compartilhado

Foi executada uma limpeza restrita na tabela `inbox_conversas`:

```sql
UPDATE inbox_conversas
SET fotoUrl = NULL
WHERE canal = 'zapi'
  AND fotoUrl IS NOT NULL
  AND fotoUrl <> '';
```

| Resultado | Quantidade | Tratamento |
|---|---:|---|
| Referências reais de foto removidas | 274 | A próxima mensagem da conversa poderá consultar a Z-API e salvar uma foto atual, se disponível. |
| Conversas sem referência, prontas para reconsulta | 278 | Inclui as 274 limpas e 4 que já estavam sem referência. |
| Ausências de foto já confirmadas | 136 | Preservadas como `fotoUrl = ''`; não gerarão nova consulta desnecessária. |

## Escopo e segurança

A limpeza abrangeu conversas individuais e grupos do canal `zapi`, sem alterar mensagens, clientes, atendimentos, automações ou demais dados operacionais. Não foi executado lote de consulta à Z-API: a atualização ocorre gradualmente quando cada contato ou grupo receber uma nova mensagem.

## Validação pontual

A conversa de grupo `900001` foi revalidada antes da limpeza geral. Ao definir apenas seu `fotoUrl` como `NULL`, a próxima mensagem disparou uma consulta de grupo e recuperou a imagem corretamente. Isso confirmou que a causa era a referência antiga persistida após a migração, e não ausência de credenciais R2 ou falha permanente da Z-API.
