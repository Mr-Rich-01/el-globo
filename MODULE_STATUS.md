# EL Globo — Estado dos Módulos

> Criado em 2026-07-16 (não existia antes desta data). Regista o estado de
> entregas por módulo; complementa o `CONTEXTO_MANUAL_ELGLOBO.md` (regras de
> negócio) e o `DEPLOY.md` (infraestrutura).

## ✅ Concluído

### Exportação Excel + pesquisa na sessão Produtos — 2026-07-23
- **Exportação** (`GET /api/produtos/export`): `.xlsx` com o mesmo layout de colunas do template de importação (re-importável). Aceita os filtros da listagem (`q`, `canal`, `ativo`) e exporta exactamente o conjunto filtrado. Tipos de célula corrigidos — `sku`/`codigo_barras` como texto (`numFmt '@'`, sem apóstrofo → EAN-13 sem notação científica); preços/stock como número real (`#,##0.00` / `#,##0.###`, somáveis, sem "número guardado como texto"); `preco_custo` ausente fica vazio (não 0). Cabeçalho a negrito/`FFEEEEEE`, linha 1 congelada, `autoFilter`. A coluna `stock_inicial` leva o saldo actual. Verificado por `scripts/verificar-tipos-export.ts` (reabre o buffer e confere `type()` de cada célula).
- **Pesquisa** (`components/produtos/produtos-toolbar.tsx`): input único sobre nome/SKU/código de barras (OR/contains/insensitive), debounce 300ms para o query param `q`, `Enter` dispara + `select()` (leitores de código de barras leem em cadeia sem limpar o campo), `Escape`/`X` limpam. Filtros de canal e estado + botão "Exportar Excel" que herda a query actual. Estado na URL; o `where` é partilhado por `lib/produtos/filtros.ts` entre a listagem e a exportação.
- **Regra de `stock_inicial` na reimportação**: `stock_inicial` é campo de abertura — aplicado só quando o par (SKU, canal) é criado (INSERT + movimento de ledger); em UPDATE é ignorado (aviso `STOCK_INICIAL_IGNORADO` no dry-run com o saldo actual). A decisão INSERT/UPDATE é tomada dentro da transação com `FOR UPDATE` no produto — o dry-run é meramente informativo. Reimportar o ficheiro exportado não altera stock.
- **Validação**: `tsc` limpo, testes `scripts/testar-importacao.ts` e `scripts/verificar-tipos-export.ts` a passar, rotas compilam sem erros no dev server. Falta a verificação visual final no Excel em Windows e o teste de roundtrip autenticado ponta-a-ponta.

### Redesign POS tablet (Tab A8) + KDS kanban — 2026-07-16 (`10d498b`)
- **POS tablet** (`/restaurante/comanda/tablet`): layout `pos-*` responsivo — paisagem 1280×800 com carrinho lateral fixo (grelha 4 colunas), retrato 800×1280 com carrinho em bottom-sheet + barra fixa; pesquisa; bloqueio de esgotados e dica de stock baixo; aba Pedidos da mesa; Imprimir pré-conta e Fechar Conta com fetch fresco ao servidor (predicado igual ao da cobrança); carrinho preservado quando o envio falha por stock.
- **KDS Cozinha** (`/restaurante/kds`): kanban Pendente → Em Preparação → Pronto, um botão por cartão, transições por secção (a cozinha entregar não fecha a parte do bar — validado nas duas ordens com pedido misto).
- **BDS Bar** (`/restaurante/bar`): mantém a grelha filtável original (render verificado idêntico após o refactor).
- **APIs**: `disponivel` em `/api/produtos?canal=` e `/api/fichas-tecnicas?canal=` (desmanche unidades + caixas×fator; fallback PISCINA→RESTAURANTE), filtro `?mesaId=` em `/api/pedidos`.

## ⏳ Pendente de validação

- **Teste no Tab A8 físico**: comportamento do teclado virtual Android com o bottom-sheet do carrinho (campo de nota), e toque real no ambiente da cozinha (kanban KDS). Validado até agora apenas em **browser sobre o dev server** (viewports 1280×800 / 800×1280 e estilos computados) — nunca em dispositivo nem em produção.
