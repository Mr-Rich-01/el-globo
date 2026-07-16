# EL Globo — Estado dos Módulos

> Criado em 2026-07-16 (não existia antes desta data). Regista o estado de
> entregas por módulo; complementa o `CONTEXTO_MANUAL_ELGLOBO.md` (regras de
> negócio) e o `DEPLOY.md` (infraestrutura).

## ✅ Concluído

### Redesign POS tablet (Tab A8) + KDS kanban — 2026-07-16 (`10d498b`)
- **POS tablet** (`/restaurante/comanda/tablet`): layout `pos-*` responsivo — paisagem 1280×800 com carrinho lateral fixo (grelha 4 colunas), retrato 800×1280 com carrinho em bottom-sheet + barra fixa; pesquisa; bloqueio de esgotados e dica de stock baixo; aba Pedidos da mesa; Imprimir pré-conta e Fechar Conta com fetch fresco ao servidor (predicado igual ao da cobrança); carrinho preservado quando o envio falha por stock.
- **KDS Cozinha** (`/restaurante/kds`): kanban Pendente → Em Preparação → Pronto, um botão por cartão, transições por secção (a cozinha entregar não fecha a parte do bar — validado nas duas ordens com pedido misto).
- **BDS Bar** (`/restaurante/bar`): mantém a grelha filtável original (render verificado idêntico após o refactor).
- **APIs**: `disponivel` em `/api/produtos?canal=` e `/api/fichas-tecnicas?canal=` (desmanche unidades + caixas×fator; fallback PISCINA→RESTAURANTE), filtro `?mesaId=` em `/api/pedidos`.

## ⏳ Pendente de validação

- **Teste no Tab A8 físico**: comportamento do teclado virtual Android com o bottom-sheet do carrinho (campo de nota), e toque real no ambiente da cozinha (kanban KDS). Validado até agora apenas em **browser sobre o dev server** (viewports 1280×800 / 800×1280 e estilos computados) — nunca em dispositivo nem em produção.
