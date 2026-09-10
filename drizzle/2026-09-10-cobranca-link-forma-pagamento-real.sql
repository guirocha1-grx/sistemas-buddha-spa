-- Forma de pagamento REAL usada no checkout do Link (Pix, Débito,
-- Crédito à vista ou parcelado) — vem do webhook do Mercado Pago
-- (payment_method_id/payment_type_id/installments), diferente de
-- `formaPagamentoInformada` (só um palpite da recepção ao criar o
-- Link). Pedido do usuário 2026-09-10: mostrar isso no alerta de
-- pagamento aprovado e na tela de Confirmação de Pagamento.
ALTER TABLE `cobrancas_link`
  ADD COLUMN `paymentMethodId` VARCHAR(40),
  ADD COLUMN `paymentTypeId` VARCHAR(40),
  ADD COLUMN `paymentInstallments` INT;
