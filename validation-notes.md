# Registro de validação

Em 11/08/2026, a suíte específica da sincronização global foi executada com sucesso: cinco testes cobriram o plano de etapas, o controlador de estados e o componente React, incluindo abertura, progresso, conclusão, minimizar e restaurar. A checagem TypeScript também foi concluída sem erros.

O preview do dashboard nesta sessão está na tela de autenticação, sem uma sessão autorizada disponível. Por isso, a inspeção visual do fluxo real autenticado — botão global, modal e barra minimizada dentro das rotas reais — permanece pendente e deve ser feita após login com uma conta da equipe. Nenhum atalho de autenticação ou rota de desenvolvimento foi incluído na entrega de produção.

Em 11/08/2026, a produção informada no projeto foi aberta com uma sessão autenticada. O dashboard exibiu a versão anterior, sem o acionador “Sincronizar tudo”, confirmando que o projeto de edição atual precisa ser enviado ao repositório conectado à produção antes da nova interface aparecer para a equipe.

Em 11/08/2026, a base do recurso “Menu de Sincronização” foi deliberadamente recuperada do commit `c166b91` do GitHub (`fix: decouple Mercado Pago global sync`). Sobre essa base foi reaplicada a compactação da sidebar, alterando a largura padrão de 157px para 118px e versionando a chave de armazenamento local. A alteração foi validada nas rotas Dashboard e Comanda Recepção e publicada no checkpoint `b0959a15`.

Em 19/08/2026, a rota `/mensagens` carregou normalmente, embora sem conversa disponível neste ambiente para exercer manualmente o cartão de revisão. A suíte automatizada cobre a carga da sugestão pendente no rascunho editável. A rota `/scripts` também carregou normalmente, exibindo categoria, título, descrição e conteúdo dos Scripts. A tentativa em `/tabela` retornou 404; a rota registrada `/tabela-precos` foi então validada visualmente, exibindo a segunda aba **Campanha do Mês** e o cabeçalho simplificado de consulta manual.
