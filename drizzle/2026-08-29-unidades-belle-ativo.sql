-- Liga/desliga a integração com o Belle por unidade sem apagar o token.
ALTER TABLE `unidades`
  ADD COLUMN IF NOT EXISTS `belleAtivo` BOOLEAN NOT NULL DEFAULT TRUE;
