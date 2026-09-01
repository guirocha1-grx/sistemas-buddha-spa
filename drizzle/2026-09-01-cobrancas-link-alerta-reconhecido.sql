-- Corrige o alerta de "Link de Pagamento aprovado" reaparecendo para
-- pagamentos já vistos: a dispensa era só client-side (sessionStorage),
-- então qualquer sessão/aba nova fazia o alerta voltar. Passa a
-- persistir o reconhecimento no servidor.
ALTER TABLE `cobrancas_link` ADD COLUMN `alertaReconhecidoEm` TIMESTAMP NULL;
