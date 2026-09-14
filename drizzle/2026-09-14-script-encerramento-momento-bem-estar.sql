-- Achado real (2026-09-14, análise de "por onde melhorar a aprovação
-- integral" nos agentes que não a Carol): a recepção usa direto, na mão,
-- a frase "Seu momento de bem-estar estará sempre te esperando conosco
-- 💆‍♀️✨\nAté breve. Namastê 🙏" pra encerrar conversas (vista em
-- edições da Diana, Estela e adjacente à Bianca) — mas ela não existia
-- como Script cadastrado, só a de confirmação de agendamento (ID 30014,
-- só pra Carol). Sem ela no catálogo, os agentes nunca podiam
-- selecioná-la (regra "prefira Scripts prontos"), então a recepção
-- sempre reescrevia na mão. Liberada pra todos os especialistas, não só
-- Carol, por ser um encerramento genérico (não específico de
-- agendamento).
INSERT INTO `scripts` (`categoriaScript`, `titulo`, `descricao`, `agentesPermitidos`, `script`, `ativo`, `tipo`)
VALUES (
  'Agendamento',
  'Encerramento cordial — seu momento de bem-estar',
  'Mensagem breve e calorosa para encerrar o atendimento depois que a dúvida ou solicitação do cliente já foi resolvida (agendamento, voucher, dúvida sobre terapia, etc.); despedida cordial e acolhedora, não específica de agendamento.',
  '["bianca","fabricia","estela","carol","diana"]',
  'Seu momento de bem-estar estará sempre te esperando conosco 💆‍♀️✨\nAté breve. Namastê 🙏',
  1,
  'texto'
);
