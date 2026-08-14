-- Fluxos de automação de WhatsApp (porte do mobai-crm) — 3 tabelas:
-- definição do fluxo, nós (passos) e execuções por conversa. Só os 9
-- tipos de nó "mecânicos" por enquanto (sem agente/assistente de IA).
CREATE TABLE fluxos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  unidadeId INT NOT NULL,
  nome VARCHAR(150) NOT NULL,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  entradaNoOrdem INT,
  gatilhoTipo ENUM('manual', 'mensagem_recebida', 'dias_sem_contato', 'cliente_novo') NOT NULL DEFAULT 'manual',
  gatilhoConfig JSON,
  visivelNoInbox BOOLEAN NOT NULL DEFAULT false,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX fluxos_unidade_idx (unidadeId)
);

CREATE TABLE fluxo_nos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fluxoId INT NOT NULL,
  tipo ENUM('mensagem', 'aguardar', 'condicional', 'salvar_variavel', 'fim', 'randomizador', 'webhook', 'midia', 'menu') NOT NULL,
  ordem INT NOT NULL,
  config JSON NOT NULL,
  proximoNoOrdem INT,
  posX INT,
  posY INT,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX fluxo_nos_fluxo_ordem_unique (fluxoId, ordem)
);

CREATE TABLE fluxo_execucoes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fluxoId INT NOT NULL,
  conversaId INT NOT NULL,
  clienteId INT,
  status ENUM('ativo', 'pausado', 'concluido', 'cancelado', 'erro', 'aguardando_resposta') NOT NULL DEFAULT 'ativo',
  noAtualOrdem INT NOT NULL,
  variaveis JSON NOT NULL,
  proximaExecucaoEm TIMESTAMP NULL,
  erroMsg TEXT,
  iniciadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  concluidoEm TIMESTAMP NULL,
  INDEX fluxo_execucoes_fluxo_idx (fluxoId),
  INDEX fluxo_execucoes_conversa_idx (conversaId),
  INDEX fluxo_execucoes_status_idx (status)
);
