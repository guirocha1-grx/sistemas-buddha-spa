-- Parcela do relatório "Registros Financeiros" do Belle com "Recebido"
-- zerado (ainda não confirmada, comum em cartão não liquidado) --
-- soma pelo "Valor" contratado como fallback (tem Vcto real), mas fica
-- marcada como pendente pra avisar na tela.
ALTER TABLE `belle_registros_financeiros` ADD COLUMN `pendenteConfirmacao` BOOLEAN NOT NULL DEFAULT FALSE;
