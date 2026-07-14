# CONTEXTO PARA MANUAL DE USO — EL GLOBO

Documento de contexto extraído diretamente do código-fonte (Next.js App Router + Prisma/PostgreSQL).
Todos os nomes de roles, rotas, botões e mensagens abaixo são **literais do código** — usar exatamente como estão para navegar o sistema e capturar screenshots.

- Moeda exibida: **MT** (Metical, formato `MT 0.00`; no fecho de caixa usa `pt-MZ` / MZN).
- Idioma da UI: Português.
- Sessão: cookie JWT `elglobo_token`, validade **8 horas**. Alterações de role/canal de um utilizador só têm efeito no próximo login.
- Autenticação: `/login` (email + senha). Após login o utilizador é redirecionado automaticamente conforme o role (ver §1).

**Utilizadores do seed** (senha de todos: `elglobo123` — podem ter sido alterados/removidos no go-live pelo script de wipe):

| Email | Role | Canal |
|---|---|---|
| admin@elglobo.com | ADMIN | — (global) |
| gerente@elglobo.com | GERENTE | RESTAURANTE |
| gerente.loja@elglobo.com | GERENTE | BOTTLESTORE |
| mesa@elglobo.com | EMPREGADO_MESA | RESTAURANTE |
| balcao@elglobo.com | OPERADOR_BALCAO | RESTAURANTE |
| bottlestore@elglobo.com | OPERADOR_BOTTLESTORE | BOTTLESTORE |
| cozinha@elglobo.com | COZINHEIRO | RESTAURANTE |
| gestor@elglobo.com | GESTOR_STOCK | — (global) |

---

## 1. Perfis de usuário (roles)

Enum `Role` no Prisma (`prisma/schema.prisma`):

| Role (nome exato) | Descrição funcional | Canal obrigatório? | Página inicial após login (`REDIRECT_BY_ROLE`) |
|---|---|---|---|
| `ADMIN` | Dono do complexo. Acesso total a todos os canais e funcionalidades, incluindo gestão de utilizadores. Único que pode escolher o canal nas operações. | Não (canal = null → global) | `/dashboard` |
| `GERENTE` | Gestor local de um canal (ex.: Gerente do Restaurante, Gerente da Bottlestore). Mesmas permissões do ADMIN **exceto** gerir utilizadores; fica preso ao(s) seu(s) canal(is). | Sim | `/dashboard` |
| `EMPREGADO_MESA` | Garçom/empregado de mesa do restaurante. Opera mesas, comandas e abas da piscina. Não faz venda ao balcão nem gere stock. | Sim | `/restaurante/mesas` |
| `OPERADOR_BALCAO` | Operador do balcão do restaurante (takeaway). Opera mesas e a venda ao balcão; vê KDS/BDS. | Sim | `/restaurante/mesas` |
| `OPERADOR_BOTTLESTORE` | Caixa da loja de bebidas. Opera o POS da Bottlestore e consulta stock (só leitura das ações de gestão). | Sim | `/bottlestore/pos` |
| `COZINHEIRO` | Cozinha/bar. Acesso apenas aos ecrãs de preparação (KDS/BDS). | Sim | `/restaurante/kds` |
| `GESTOR_STOCK` | Gestor de inventário puro. Acesso **exclusivo** à área de Stock (produtos, categorias, fichas técnicas, quebras, stock baixo) em **todos** os canais. Sem acesso a vendas, caixas, mesas, abas ou dashboards financeiros — o middleware redireciona qualquer outra página para `/stock/produtos` e devolve 403 nas APIs fora do inventário. | Não (global) | `/stock/produtos` |

**Regra de canais** (`lib/canais.ts` — `canaisPermitidos`):
- `ADMIN` e `GESTOR_STOCK` → veem os 3 canais (`RESTAURANTE`, `BOTTLESTORE`, `PISCINA`).
- Utilizador com canal `RESTAURANTE` → vê `RESTAURANTE` **e** `PISCINA` (a piscina é servida pelo pessoal do restaurante).
- Utilizador com canal `BOTTLESTORE` → vê apenas `BOTTLESTORE` (totalmente isolado).
- Utilizador sem canal e não-admin → sessão inválida, é forçado a novo login.

**Nota importante:** o formulário de Utilizadores (`/backoffice/utilizadores`) e a API `/api/utilizadores` só oferecem/aceitam 6 roles — `GESTOR_STOCK` **não pode ser criado pela UI**; existe apenas via seed/script (gestor@elglobo.com).

---

## 2. Matriz de permissões

### 2.1 Permissões RBAC (`PERMISSIONS` em `lib/auth.ts`)

| Permissão | ADMIN | GERENTE | GESTOR_STOCK | EMPREGADO_MESA | OPERADOR_BALCAO | OPERADOR_BOTTLESTORE | COZINHEIRO |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `dashboard:view` | ✅ | ✅ | — | — | — | — | — |
| `dashboard:admin` | ✅ | — | — | — | — | — | — |
| `restaurante:view` | ✅ | ✅ | — | ✅ | ✅ | — | — |
| `restaurante:manage` | ✅ | ✅ | — | — | — | — | — |
| `bottlestore:view/manage` | ✅ | ✅ | — | — | — | ✅ | — |
| `piscina:view/manage` | ✅ | ✅ | — | ✅ | — | — | — |
| `stock:view` | ✅ | ✅ | ✅ | — | — | ✅ | — |
| `stock:manage` | ✅ | ✅ | ✅ | — | — | — | — |
| `relatorios:view` | ✅ | ✅ | — | — | — | — | — |
| `relatorios:stock-baixo` | ✅ | ✅ | ✅ | — | — | — | — |
| `caixa:view/manage` | ✅ | ✅ | — | — | — | — | — |
| `utilizadores:view` | ✅ | ✅ | — | — | — | — | — |
| `utilizadores:manage` | ✅ | — | — | — | — | — | — |
| `kds:view` | ✅ | ✅ | — | — | ✅ | — | ✅ |

### 2.2 Proteção de páginas (middleware `src/proxy.ts` + checks nas páginas)

Rotas públicas (sem login): `/login`, `/api/auth/login`, `/menu`, `/uploads`.
Tudo o resto exige sessão; sem token → redirect para `/login`.

| Rota (prefixo) | Quem entra | Comportamento se negado |
|---|---|---|
| `/dashboard`, `/backoffice/*` | ADMIN, GERENTE (`dashboard:view`) | redirect para a página inicial do role |
| `/restaurante/*` | Roles com `restaurante:view` **e** canal RESTAURANTE permitido | redirect |
| `/bottlestore/*` | ADMIN, GERENTE (canal BOTTLESTORE), OPERADOR_BOTTLESTORE | redirect |
| `/piscina/*` | Roles com canal PISCINA permitido (ADMIN, GERENTE/EMPREGADO_MESA do restaurante) | redirect |
| `/stock/*` | ADMIN, GERENTE, OPERADOR_BOTTLESTORE, GESTOR_STOCK (`stock:view`) | redirect |
| `/restaurante/balcao` | (check adicional na página) só ADMIN, GERENTE, OPERADOR_BALCAO | redirect |
| `/backoffice/relatorios` | (check na página) só quem tem `relatorios:view` (ADMIN, GERENTE) | redirect |
| `/backoffice/utilizadores` | UI aberta a quem entra no /backoffice, mas a **API** é só ADMIN (GERENTE vê a página mas as chamadas devolvem 401) | — |
| `/stock/categorias`, `/stock/quebras` | (check na página) só ADMIN, GERENTE, GESTOR_STOCK | redirect para `/stock/produtos` / página inicial |
| `/stock/stock-baixo` | ADMIN, GERENTE, GESTOR_STOCK (`relatorios:view` ou `relatorios:stock-baixo`) | redirect |
| GESTOR_STOCK em qualquer página fora de `/stock` | — | redirect para `/stock/produtos`; APIs fora da lista permitida → `403 {"erro":"Sem permissão"}` |

APIs permitidas ao GESTOR_STOCK: `/api/produtos`, `/api/categorias`, `/api/fichas-tecnicas`, `/api/quebras`, `/api/stock`, `/api/relatorios/stock-baixo`, `/api/auth/logout`.

### 2.3 Restrições por role dentro das APIs (server-side)

| Operação | Roles autorizados |
|---|---|
| Abrir sessão de caixa (`POST /api/caixa`) | qualquer sessão, mas o canal é validado; **listar** sessões: só ADMIN/GERENTE |
| Fechar caixa (`POST /api/caixa/[id]/fechar`) | o próprio dono da sessão, ou ADMIN/GERENTE (dentro dos seus canais) |
| Cancelar pedido (`POST /api/pedidos/[id]/cancelar`) | **só ADMIN, GERENTE** |
| Override de preço na venda direta (`precoUnitario` em `POST /api/vendas`) | só ADMIN, GERENTE |
| Entrada de stock, desmanche, transferência, quebras | ADMIN, GERENTE, GESTOR_STOCK (GERENTE só nos seus canais) |
| Gestão de utilizadores (`/api/utilizadores`) | só ADMIN (não pode desativar/despromover a própria conta) |
| Relatórios BI (`/api/relatorios`) | ADMIN, GERENTE (`relatorios:view`), sempre limitados aos canais permitidos |

### 2.4 Visibilidade por role na UI

- **Sidebar** (`components/Sidebar.tsx`): filtro duplo role + canal (ver §3 para itens exatos).
- **Mapa de Mesas**: botões "➕ Nova Mesa", apagar mesa (🗑) e "❌ Cancelar" (pedidos) só para ADMIN/GERENTE; "🥡 Nova Venda ao Balcão" para ADMIN/GERENTE/OPERADOR_BALCAO.
- **Comanda**: botão "❌ Cancelar" de pedido só ADMIN/GERENTE.
- **Produtos (stock)**: ações Entrada/Saída/Desmanche/Transferência só aparecem para ADMIN/GERENTE/GESTOR_STOCK; OPERADOR_BOTTLESTORE vê a listagem sem essas ações.

---

## 3. Mapa de navegação

### 3.1 Sidebar (labels exatos, com secções)

| Secção | Label do menu | Ícone | Rota | Roles (e canal exigido) |
|---|---|---|---|---|
| Principal | Dashboard | 📊 | `/dashboard` | ADMIN, GERENTE |
| Restaurante | Mesas | 🍽️ | `/restaurante/mesas` | ADMIN, GERENTE, EMPREGADO_MESA, OPERADOR_BALCAO (canal RESTAURANTE) |
| Restaurante | Venda ao Balcão | 🥡 | `/restaurante/balcao` | ADMIN, GERENTE, OPERADOR_BALCAO (canal RESTAURANTE) |
| Restaurante | Cozinha (KDS) | 👨‍🍳 | `/restaurante/kds` | ADMIN, GERENTE, COZINHEIRO, EMPREGADO_MESA, OPERADOR_BALCAO (canal RESTAURANTE) |
| Restaurante | Bar (BDS) | 🍹 | `/restaurante/bar` | idem KDS |
| Bottlestore | POS Loja | 🛒 | `/bottlestore/pos` | ADMIN, GERENTE, OPERADOR_BOTTLESTORE (canal BOTTLESTORE) |
| Piscina | Abas Piscina | 🏊 | `/piscina/abas` | ADMIN, GERENTE, EMPREGADO_MESA (canal PISCINA) |
| Stock | Produtos | 📦 | `/stock/produtos` | ADMIN, GERENTE, OPERADOR_BOTTLESTORE, GESTOR_STOCK |
| Stock | Fichas Técnicas | 📋 | `/stock/fichas-tecnicas` | ADMIN, GERENTE, GESTOR_STOCK (canal RESTAURANTE) |
| Stock | Categorias | 🏷️ | `/stock/categorias` | ADMIN, GERENTE, GESTOR_STOCK |
| Stock | Quebras | 🗑️ | `/stock/quebras` | ADMIN, GERENTE, GESTOR_STOCK |
| Stock | Stock Baixo | ⚠️ | `/stock/stock-baixo` | ADMIN, GESTOR_STOCK (nota: GERENTE não vê este item no menu, mas a página aceita-o) |
| Backoffice | Relatórios | 📈 | `/backoffice/relatorios` | ADMIN, GERENTE |
| Backoffice | Fecho de Caixa | 💰 | `/backoffice/caixa` | ADMIN, GERENTE |
| Backoffice | Utilizadores | 👥 | `/backoffice/utilizadores` | ADMIN |

Rodapé da sidebar: cartão com nome do utilizador + role e botão **"Sair"** (logout).

### 3.2 Todas as páginas (App Router)

**Áreas comuns / públicas**
| URL | Título/propósito | Acesso |
|---|---|---|
| `/` | Redireciona para a página inicial do role | qualquer sessão |
| `/login` | "EL Globo — Sistema de Gestão Integrado"; form Email/Senha, botão "Entrar no Sistema" | público |
| `/menu` | **Cardápio digital público** (QR code nas mesas). Só consulta; preços do canal RESTAURANTE; inclui secção "Cocktails & Bar" (fichas técnicas). Nunca cria pedidos. | público, sem login |
| `/dashboard` | "Dashboard" — KPIs do dia/mês (faturação por canal, mesas, abas abertas, top 5 produtos, alertas de stock) limitados aos canais do gestor | ADMIN, GERENTE |

**RESTAURANTE**
| URL | Propósito | Acesso |
|---|---|---|
| `/restaurante/mesas` | "🍽️ Mapa de Mesas" — grelha de mesas por zona com estados (Livre/Ocupada/Conta/Reservada), stats, secção "🧍 Pedidos Volantes", criação/eliminação de mesas (gestor) | ADMIN, GERENTE, EMPREGADO_MESA, OPERADOR_BALCAO |
| `/restaurante/comanda/[mesaId]` | Comanda da mesa: catálogo (produtos + "🍸 Fichas Técnicas (Bar)"), carrinho com notas por item, tabs "Menu"/"Pedidos", botões "📤 Enviar para Cozinha/Bar", "🖨️ Imprimir Conta" (pré-conta), "💳 Fechar Conta" | idem Mesas |
| `/restaurante/balcao` | "Venda ao Balcão" (takeaway): pedido volante + pagamento imediato; campo nome do cliente; leitor de código de barras global | ADMIN, GERENTE, OPERADOR_BALCAO |
| `/restaurante/kds` | "👨‍🍳 Cozinha — KDS": cartões de pedidos (itens de comida), tempo real via SSE | ADMIN, GERENTE, COZINHEIRO, EMPREGADO_MESA, OPERADOR_BALCAO |
| `/restaurante/bar` | "🍹 Bar — BDS": igual ao KDS mas para bebidas/tabaco | idem |
| `/restaurante/checkout/[mesaId]` | "Fechar Conta" da mesa (CheckoutPanel: divisão → pagamento → recibo) | idem Mesas |
| `/restaurante/checkout/pedido/[pedidoId]` | Fechar pedido volante individual | idem |
| `/restaurante/comanda/tablet` | **Ecrã fullscreen para tablets dos garçons** (sem sidebar): escolher Mesa ou Pedido Volante → lançar itens → enviar à cozinha; alterna canal Restaurante ↔ Piscina; checkout de volantes | qualquer role com canal RESTAURANTE/PISCINA |

**BOTTLESTORE**
| URL | Propósito | Acesso |
|---|---|---|
| `/bottlestore/pos` | "🛒 POS — Bottlestore": venda direta com scanner de código de barras, chips de categoria/subcategoria, carrinho, pagamento (Dinheiro/Cartão/Mobile), teclas rápidas de notas (100/200/500/1000/2000 MT + "Exato"), recibo térmico e gaveta | ADMIN, GERENTE (loja), OPERADOR_BOTTLESTORE |

**PISCINA**
| URL | Propósito | Acesso |
|---|---|---|
| `/piscina/abas` | "🏊 Zona de Piscina — Abas": grelha de abas abertas (pulseira/espreguiçadeira), "+ Nova Aba", detalhe com consumos, "💳 Fechar Conta" (CheckoutPanel) | ADMIN, GERENTE, EMPREGADO_MESA (canal PISCINA) |

⚠️ **Bug conhecido:** o botão "+ Adicionar Consumo" no detalhe da aba navega para `/restaurante/comanda-aba/[id]`, **rota que não existe** (404). Na prática o consumo é lançado via API `POST /api/pedidos` com `abaId` — não há atualmente ecrã dedicado funcional para adicionar consumo a uma aba. Não usar esse botão no manual/screenshots.

**STOCK**
| URL | Propósito | Acesso |
|---|---|---|
| `/stock/produtos` | "Gestão de Produtos": CRUD de produtos, preço/stock por canal, hierarquia Caixa→Unidade (fator de conversão), foto WebP, flag ingrediente; ações por linha: Entrada, Saída (quebra), Desmanche, Transferência | ADMIN, GERENTE, OPERADOR_BOTTLESTORE (só consulta), GESTOR_STOCK |
| `/stock/fichas-tecnicas` | "Fichas Técnicas": receitas (ex. Vodka Tónica = 50ml vodka + 150ml tónica) com preço de venda | ADMIN, GERENTE, GESTOR_STOCK |
| `/stock/categorias` | "Categorias": CRUD com hierarquia pai→subcategorias, tipo (BEBIDA_ALCOOLICA, BEBIDA_NAO_ALCOOLICA, COMIDA, TABACO, SNACK, OUTRO) | ADMIN, GERENTE, GESTOR_STOCK |
| `/stock/quebras` | "Quebras de Stock": registo e histórico de quebras (derrame, partido, validade, oferta…) por canal | ADMIN, GERENTE, GESTOR_STOCK |
| `/stock/stock-baixo` | "⚠️ Stock Baixo": produtos abaixo do mínimo (equivalente caixa+unidade), ordenados do mais crítico | ADMIN, GERENTE, GESTOR_STOCK |

**BACKOFFICE**
| URL | Propósito | Acesso |
|---|---|---|
| `/backoffice/relatorios` | "Relatórios & BI": 3 tabs — Vendas (KPIs, faturação por canal/operador, top produtos, série diária, margem bruta, quebras; filtros data/canal/operador; export CSV), Stock (ledger de movimentações) e Stock Baixo | ADMIN, GERENTE |
| `/backoffice/caixa` | "Gestão de Caixa": histórico de sessões, "Abertura de Caixa" (canal + fundo de maneio), "Fechar Caixa" (contagem física → diferença) | ADMIN, GERENTE |
| `/backoffice/utilizadores` | "Utilizadores": CRUD (nome, email, senha, role, canal, ativo) | ADMIN (API); página visível a quem entra no backoffice |

### 3.3 APIs principais (referência)

`/api/auth/login`, `/api/auth/logout`, `/api/mesas` (+ `/[id]`, `/[id]/abrir`, `/[id]/pedir-conta`), `/api/pedidos` (+ `/[id]/estado`, `/[id]/cancelar`, `/[id]/itens`), `/api/abas` (+ `/[id]/fechar`), `/api/checkout`, `/api/vendas`, `/api/caixa` (+ `/[id]/fechar`), `/api/produtos` (+ `/[id]`, `/imagem`), `/api/categorias`, `/api/fichas-tecnicas`, `/api/quebras`, `/api/stock/entrada|desmanchar|transferir`, `/api/relatorios` (+ `/stock`, `/stock-baixo`), `/api/kds/stream` (SSE), `/api/imprimir`, `/api/utilizadores`.

---

## 4. Fluxos operacionais principais

### 4.1 Abertura e fecho de caixa
**Quem:** ADMIN, GERENTE (a UI está em `/backoffice/caixa`; a API de abertura aceita qualquer sessão do canal).
**Onde:** `/backoffice/caixa`.

Abertura:
1. Botão **"Abertura de Caixa"** → modal "Abrir Novo Caixa".
2. Escolher **Ponto de Venda** (canais do utilizador: "Restaurante / Bar", "Bottlestore", "Piscina") e **Fundo de Maneio (MZN)**.
3. **"Abrir"**. Erro possível: `"Já existe uma sessão aberta para si neste canal"`.

Fecho:
1. Na linha da sessão ABERTA, botão **"Fechar Caixa"** → modal "Fecho de Caixa".
2. Preencher **Contagem Física (MZN)** — instrução na UI: "Conte TODO o dinheiro físico na gaveta (Fundo inicial + Entradas em dinheiro). O sistema calculará a diferença." Observações opcionais.
3. **"Submeter Fecho X/Z"**. O sistema soma todas as vendas PAGAS do próprio operador nesse canal desde a abertura, separa Dinheiro/Cartão/Mobile (pagamentos MISTO repartidos), e calcula `diferença = contagem física − (fundo inicial + total em dinheiro)`.
Erros: `"Sessão já fechada"`, `"Não pode fechar sessão de outro utilizador"`, `"Sem acesso ao canal X"`.

> Nota: a abertura de caixa **não é obrigatória** para vender — o POS funciona sem sessão de caixa; a sessão serve para conferência do turno.

### 4.2 Venda no POS Bottlestore (venda direta)
**Quem:** OPERADOR_BOTTLESTORE, GERENTE (loja), ADMIN. **Onde:** `/bottlestore/pos`.

1. Adicionar produtos: scanner (campo "Scanner ou pesquisa... (Enter para adicionar)" — match exato de código de barras primeiro) ou clique nos cartões; filtro por chips de grupo → subcategoria.
2. Ajustar quantidades no carrinho (−/+), "Limpar" para esvaziar.
3. Escolher método: **💵 Dinheiro / 💳 Cartão / 📱 Mobile**. Em dinheiro, informar valor recebido (teclas rápidas "Exato", 100–2000 MT); o troco é mostrado. O botão **"✅ Finalizar Venda"** fica desativado se valor recebido < total.
4. Sucesso: overlay "Venda Efetuada!" com total, troco, nº da venda, "💰 Gaveta de dinheiro aberta" (se dinheiro) e "🖨 Reimprimir Recibo". Volta ao modo venda após 4 s.
5. Backend (`POST /api/vendas`): desconta stock do canal no ato (com auto-unboxing e anti-race), estado `PAGA`. Não passa pelo KDS.

Erros visíveis: `"Stock insuficiente para {produto} — faltam N unidades"`, `"{produto} não está disponível no canal BOTTLESTORE"`, `"{produto} é um ingrediente de preparação e não pode ser vendido diretamente"`.

### 4.3 Mesa: pedido → KDS/BDS → entrega → fecho de conta (com split bill)
**Quem:** EMPREGADO_MESA, OPERADOR_BALCAO, GERENTE, ADMIN (restaurante); COZINHEIRO nos ecrãs de preparação.

1. **Abrir mesa** — `/restaurante/mesas`: clicar numa mesa **Livre** → passa a OCUPADA e abre a comanda (`/restaurante/comanda/[mesaId]`). Numa mesa ocupada, o clique abre modal com "🧾 Ver / Adicionar Pedidos", "💳 Pedir Conta" (estado → CONTA_PEDIDA) e "✅ Fechar Conta".
2. **Lançar pedido** — na comanda: escolher produtos/fichas (cartões mostram disponibilidade: "N disp.", "Restam N", badge **"Esgotado"** — itens esgotados ficam bloqueados), nota por item ("Nota (ex: sem sal)..."), botão **"📤 Enviar para Cozinha/Bar"**. O stock é descontado **neste momento** (`POST /api/pedidos`).
3. **Preparação** — cada item é encaminhado por categoria: COMIDA/SNACK/OUTRO → **Cozinha (KDS)**; BEBIDA_ALCOOLICA/BEBIDA_NAO_ALCOOLICA/TABACO → **Bar (BDS)**. Nos ecrãs `/restaurante/kds` e `/restaurante/bar` (tempo real via SSE, indicador "Ligado em tempo real"), cada cartão tem: **"🔥 Iniciar"** → **"✅ Pronto!"** → **"📦 Entregar"**. Cartões pendentes há ≥10 min pulsam (urgente). O pedido só fica `PRONTO` quando Cozinha **e** Bar terminam (`PARCIALMENTE_PRONTO` entretanto — a UI mostra "Bar ainda a terminar" / "Cozinha ainda a terminar").
4. **Alerta ao garçom** — quando uma secção marca "Pronto", os ecrãs de mesas/comanda mostram o alerta em tempo real (componente ProntoAlert) e aparece o botão "📦 Entregar".
5. **Pré-conta** — botão **"🖨️ Imprimir Conta"** na comanda: imprime consulta de mesa (não fecha nada). Aviso se falhar: `"Impressora não disponível — emparelhe a impressora USB ou verifique a impressora de rede."`
6. **Fechar conta** — `/restaurante/checkout/[mesaId]` (CheckoutPanel), 4 etapas:
   1. Pergunta obrigatória: **"Os clientes vão dividir a conta?"** → "Não — conta única" / "➗ Sim — dividir".
   2. (Se sim) **"➗ Partes iguais"** (N pessoas, 2–20; a última parte absorve o arredondamento) ou **"🧾 Por itens"** ("Toque no número da pessoa que paga cada item"); resumo "Pessoa N: MT X".
   3. Pagamento: Dinheiro/Cartão/Mobile + valor recebido; botão **"✅ Confirmar MT X"** (bloqueado se dinheiro insuficiente).
   4. Sucesso: "Conta Fechada!", troco em destaque, divisão por pessoa, "Recibo Nº X", "🖨 Reimprimir Recibo".
   Backend (`POST /api/checkout` tipo `MESA`): **não** volta a descontar stock; consolida todos os pedidos por faturar numa Venda, marca-os ENTREGUE e liberta a mesa (estado LIVRE).
   Erros: `"Mesa sem pedidos por faturar"`, `"Sem acesso ao canal RESTAURANTE"`.

### 4.4 Venda ao Balcão (pedido volante pago à cabeça)
**Quem:** OPERADOR_BALCAO, GERENTE, ADMIN. **Onde:** `/restaurante/balcao`.

1. Montar carrinho (catálogo do canal RESTAURANTE, com scanner global e limites de stock como na comanda). Campo opcional de nome → identificador "Balcão — João".
2. Finalizar: o sistema (a) cria o pedido volante (`POST /api/pedidos` — desconta stock e envia itens ao KDS/BDS) e (b) fatura de imediato (`POST /api/checkout` tipo `PEDIDO`).
3. O cartão **continua no KDS/BDS com badge "💰 Pago"** até alguém carregar "📦 Entregar". Nos ecrãs de Mesas, a secção "🧍 Pedidos Volantes" mostra o estado, "PAGO"/"POR PAGAR", e botões "📦 Entregar", "💳 Fechar Conta" (se por pagar) e "❌ Cancelar" (gestor).
4. Se o pagamento falhar após criar o pedido: mensagem `"Pedido criado mas o pagamento falhou — tente cobrar de novo"` — o retry não duplica o pedido; também é recuperável em `/restaurante/checkout/pedido/[pedidoId]`.

**Tablet do garçom** (`/restaurante/comanda/tablet`): mesmo conceito em fullscreen — escolher destino (Mesa ou Pedido Volante com referência livre), lançar itens com notas rápidas ("sem gelo", "bem passado", "sem sal", "para levar"), enviar à cozinha; permite alternar canal Restaurante ↔ Piscina e fechar contas de volantes.

### 4.5 Piscina: abas (contas de cliente)
**Quem:** EMPREGADO_MESA, GERENTE (restaurante), ADMIN. **Onde:** `/piscina/abas`.

1. **"+ Nova Aba"**: Identificador obrigatório (ex. "A-12, Pulseira 05, Esp. 3...") + nome opcional. Erro: `"Já existe uma aba aberta com o identificador \"X\""` (409).
2. Consumos são lançados como pedidos com `abaId` (canal PISCINA — via tablet/API; ver bug do botão "+ Adicionar Consumo" em §3.2). A piscina sem stock próprio consome automaticamente do stock do **Restaurante** (fallback no backend).
3. Detalhe da aba: lista de consumos + "Total a Pagar".
4. **"💳 Fechar Conta"** → mesmo CheckoutPanel do restaurante (divisão obrigatória de perguntar, pagamento, recibo). Backend fecha a aba (estado FECHADA) e cria a Venda no canal PISCINA. Erro: `"Aba sem consumos por faturar"`.

### 4.6 Cancelamento de pedido (estorno)
**Quem:** só ADMIN/GERENTE. **Onde:** comanda da mesa ou secção de volantes do mapa de mesas (botão "❌ Cancelar").

1. Confirmação: `"Cancelar este pedido? O stock será reposto."`
2. Backend repõe todo o stock (produtos + ingredientes de receitas, movimentação `ENTRADA_ESTORNO`), marca pedido/itens CANCELADO, liberta a mesa se nada ficou pendente, remove o cartão do KDS/BDS em tempo real.
Erros: `"Pedido já faturado — não pode ser cancelado"` (409), `"Pedido já cancelado"`, `"Sem permissão para cancelar pedidos"`.

### 4.7 Desmanche de caixas (crate unboxing)
**Conceito:** produtos podem ter hierarquia Caixa→Unidade (ex. "Cerveja 2M Caixa 24x" pai de "Cerveja 2M Garrafa", `fatorConversao` = 24).

- **Automático (auto-unboxing):** em qualquer venda/pedido, se faltarem unidades soltas mas houver caixas do produto-pai no mesmo canal, o sistema desmancha as caixas necessárias sozinho. Por isso a disponibilidade mostrada no POS/comanda = unidades soltas + caixas × fator.
- **Manual:** `/stock/produtos`, ação "Desmanchar" na linha do produto-caixa (ADMIN, GERENTE, GESTOR_STOCK; GERENTE só nos seus canais). API `POST /api/stock/desmanchar`.
  Mensagem de sucesso: `"N caixa(s) desmanchada(s) em M unidades de {produto}"`.
  Erros: `"{produto} não é uma caixa — não tem produto \"unidade\" associado"`, `"Stock insuficiente para {caixa} — faltam N caixas"`, `"Caixa sem stock neste canal"`.
- O desmanche **não é reversível** (o estorno de cancelamento repõe em unidades).
- Movimentações registadas: `SAIDA_DESMANCHE` (caixa) + `ENTRADA_DESMANCHE` (unidades).

### 4.8 Transferência inter-canal
**Quem:** ADMIN (entre quaisquer canais), GERENTE e GESTOR_STOCK (apenas entre os canais permitidos — ex. Restaurante ↔ Piscina). **Onde:** `/stock/produtos`, ação "Transferir" (por linha ou botão geral). API `POST /api/stock/transferir`.

1. Escolher produto, canal origem, canal destino, quantidade (e preço de venda no destino, se a linha de stock ainda não existir lá — senão herda o da origem).
2. Sucesso: `"N transferido(s) de {ORIGEM} para {DESTINO}"`. Movimentações `SAIDA_TRANSFERENCIA` + `ENTRADA_TRANSFERENCIA`.
Erros: `"O canal de origem e o de destino têm de ser diferentes"`, `"Sem acesso ao canal X"`, `"{produto} não tem stock no canal X"`, `"Stock insuficiente para {produto} — faltam N"`.

### 4.9 Gestão de stock, entradas, quebras e alertas
**Quem:** ADMIN, GERENTE (seus canais), GESTOR_STOCK (todos os canais). OPERADOR_BOTTLESTORE só consulta.

- **Produto** (`/stock/produtos`): criar/editar com nome, SKU, código de barras, grupo→subcategoria, unidade de medida (UNIDADE, LITRO, MILILITRO, KG, GRAMA, PORCAO), foto (convertida para WebP ≤400×400), flag **ingrediente** (ingrediente nunca aparece à venda), hierarquia caixa/unidade, e por canal: ativo, preço venda, preço custo, stock atual, stock mínimo. Validações: `"Ative o produto em pelo menos um canal (Restaurante, Bottlestore ou Piscina)."`, `"Escolha o grupo e a subcategoria do produto."`
- **Entrada de stock** (ação "Entrada" / API `POST /api/stock/entrada`): soma quantidade, opcionalmente atualiza preço de custo (custo da última compra). Sucesso: `"Entrada de N × {produto} registada — novo stock: X"`. Erro: `"{produto} não está ativo no canal X — edite o produto e ative-o nesse canal primeiro"`. Ledger: `ENTRADA_COMPRA`.
- **Quebras** (`/stock/quebras` ou ação "Saída" em produtos): produto, canal, quantidade, motivo (obrigatório, máx. 120 carateres), notas. Desconta stock no canal exato (sem auto-unboxing) e **falha se não houver stock suficiente**. Ledger: `SAIDA_QUEBRA`. Erros: `"Sem permissão para registar quebras"`, `"{produto} não tem stock no canal X"`, stock insuficiente.
- **Alertas de stock mínimo:** avaliados pelo **equivalente total** da família caixa/unidade (2 caixas cheias e 0 unidades soltas NÃO disparam alerta). Visíveis em: card do Dashboard, tab "Stock Baixo" dos Relatórios, e página `/stock/stock-baixo` (ordenada do mais crítico; colunas incluem equivalente, mínimo e défice).
- **Ingredientes/receitas:** a venda de um prato/cocktail com ficha técnica desconta também os ingredientes — **sem nunca travar a venda**: o stock do ingrediente pode ficar negativo (decisão de negócio); a movimentação fica anotada com `"ATENÇÃO: stock ficou negativo"` e o défice aparece no inventário para o gestor regularizar.

### 4.10 Impressão térmica
**Cadeia de fallback** (`lib/imprimir-client.ts` — "Nenhuma venda falha por causa da impressora"):
1. **WebUSB** — impressora USB local emparelhada (silencioso). Há um botão de configuração/emparelhamento (componente ImpressoraConfig) nos ecrãs de POS/balcão.
2. **ESC/POS por rede** — servidor envia para a impressora TCP porta 9100 (`/api/imprimir`; requer `ENABLE_THERMAL_PRINT=true`, IP em `THERMAL_PRINTER_IP`). Também abre a gaveta (kick pino 2).
3. **window.print()** — recibo formatado a 80 mm via CSS `@media print`.

- A **gaveta de dinheiro abre automaticamente** em pagamentos em DINHEIRO (UI mostra "💰 Gaveta de dinheiro aberta").
- Recibo inclui: nº da venda, canal, operador, itens, subtotal/desconto/total, método, valor recebido, troco e detalhe da divisão de conta.
- A pré-conta ("🖨️ Imprimir Conta" na comanda) só imprime via WebUSB/rede; se nenhuma disponível: `"Impressora não disponível — emparelhe a impressora USB ou verifique a impressora de rede."`

### 4.11 Leitor de código de barras
- **POS Bottlestore:** o scan entra no campo de pesquisa e o Enter adiciona (match exato de código primeiro).
- **Comanda e Balcão do restaurante:** escuta **global** de teclado (`useBarcodeScanner`) — distingue rajada do scanner de digitação humana; funciona mesmo com o foco noutro campo. Feedback em toast: `"{produto} adicionado"`, `"Código não reconhecido: {código}"`, `"{produto} está esgotado!"`, `"{produto}: stock máximo atingido (N)"`.

---

## 5. Regras de negócio e mensagens visíveis ao usuário

### 5.1 Regras principais
| Regra | Detalhe |
|---|---|
| Stock por canal | Cada produto tem preço e stock independentes por canal (`StockCanal`); a existência de linha ativa define a disponibilidade no canal. |
| Desconto de stock | Pedido de mesa/aba/balcão: no **envio do pedido**. POS Bottlestore: na **finalização da venda**. Fecho de conta (checkout) **nunca** desconta de novo. |
| Anti-dupla faturação | Um pedido ligado a uma venda (`vendaId`) nunca volta a ser cobrado; pedido ENTREGUE mas por pagar mantém a mesa ocupada. |
| Stock nunca negativo em vendas | Decremento condicional anti-race; a exceção são ingredientes de receitas (podem ficar negativos, com alerta). |
| Fallback Piscina→Restaurante | Produto sem stock na Piscina consome do stock do Restaurante. |
| Ingrediente não se vende | Produtos com `isIngrediente` nunca aparecem no POS/comanda/cardápio e a API recusa vendê-los. |
| Preços | Só ADMIN/GERENTE podem alterar preço no ato da venda (override). Produtos com preço 0 não aparecem no catálogo do tablet nem no cardápio público. |
| Divisão de conta | IGUAL (2–50 partes; UI limita a 20; última parte absorve arredondamento) ou POR_ITEM; registada na venda e impressa no recibo. |
| Estados de mesa | LIVRE → OCUPADA → (CONTA_PEDIDA) → LIVRE (após checkout). RESERVADA existe como estado. |
| Estados de pedido | PENDENTE → EM_PREPARACAO → PARCIALMENTE_PRONTO → PRONTO → ENTREGUE; CANCELADO via rota própria de gestor. |
| Métodos de pagamento | DINHEIRO, CARTAO, MOBILE_MONEY nas UIs (o schema também aceita MISTO e CREDITO via API). |
| Utilizadores | Todos exceto ADMIN precisam de canal atribuído; admin não pode desativar/despromover a própria conta. |

### 5.2 Catálogo de mensagens de erro/validação (literais)

**Autenticação/permissões**
- "Credenciais inválidas." / "Credenciais inválidas ou conta desativada."
- "Erro de conexão. Tente novamente."
- "Não autorizado" (401) · "Sem permissão" (403, GESTOR_STOCK fora do inventário)
- "Sem acesso ao canal {CANAL}" · "Sessão sem canal atribuído — inicie sessão novamente"
- "Sem permissão para cancelar pedidos" · "Sem permissão para ver/registar quebras" · "Sem permissão para ver relatórios"

**Stock/vendas**
- "Stock insuficiente para {produto}" / "Stock insuficiente para {produto} — faltam N unidades" (ou "caixas")
- "{produto} não está disponível no canal {CANAL}"
- "{produto} é um ingrediente de preparação e não pode ser vendido diretamente"
- "{produto} está esgotado!" · "{produto}: stock máximo atingido (N)" · "Código não reconhecido: {código}"
- "{produto} não tem stock no canal {CANAL}" · "{produto} não está ativo no canal {CANAL} — edite o produto e ative-o nesse canal primeiro"
- "{produto} não é uma caixa — não tem produto \"unidade\" associado"
- "O canal de origem e o de destino têm de ser diferentes"

**Pedidos/contas**
- "Indique a mesa, a aba ou o identificador do cliente (pedido volante)"
- "Mesa sem pedidos por faturar" · "Aba sem consumos por faturar" · "Pedido já faturado ou cancelado"
- "Este pedido pertence a uma mesa/aba — feche a conta correspondente"
- "Pedido já faturado — não pode ser cancelado" · "Pedido já cancelado" · "O pedido já foi faturado ou cancelado"
- "Pedido criado mas o pagamento falhou — tente cobrar de novo"
- "Cancelar este pedido? O stock será reposto." (confirmação)

**Caixa**
- "Já existe uma sessão aberta para si neste canal" · "Sessão já fechada" · "Não pode fechar sessão de outro utilizador" · "fundoInicial é obrigatório"

**Abas/mesas/utilizadores**
- "Já existe uma aba aberta com o identificador \"{X}\"" · "Aba não encontrada" · "Mesa não encontrada"
- "Utilizadores não-admin precisam de um canal atribuído" · "Email já registado" · "Não pode desativar ou despromover a própria conta"

**Stock (formulário de produto)**
- "Ative o produto em pelo menos um canal (Restaurante, Bottlestore ou Piscina)." · "Escolha o grupo e a subcategoria do produto."

**Impressão**
- "Impressora não disponível — emparelhe a impressora USB ou verifique a impressora de rede." · "Timeout na impressora"

---

## Anexo: enums de referência (nomes exatos)

- `CanalVenda`: RESTAURANTE, BOTTLESTORE, PISCINA
- `EstadoMesa`: LIVRE, OCUPADA, CONTA_PEDIDA, RESERVADA
- `EstadoPedido`: PENDENTE, EM_PREPARACAO, PARCIALMENTE_PRONTO, PRONTO, ENTREGUE, CANCELADO
- `DestinoPreparo`: COZINHA, BAR
- `EstadoAba`: ABERTA, FECHADA, CANCELADA
- `MetodoPagamento`: DINHEIRO, CARTAO, MOBILE_MONEY, MISTO, CREDITO
- `EstadoVenda`: PENDENTE, PAGA, CANCELADA, REEMBOLSADA
- `UnidadeMedida`: UNIDADE, LITRO, MILILITRO, KG, GRAMA, PORCAO
- `TipoCategoria`: BEBIDA_ALCOOLICA, BEBIDA_NAO_ALCOOLICA, COMIDA, TABACO, SNACK, OUTRO
- `EstadoSessaoCaixa`: ABERTA, FECHADA
- `TipoDivisao`: IGUAL, POR_ITEM
- Tipos de `MovimentacaoStock`: ENTRADA_COMPRA, SAIDA_VENDA, SAIDA_QUEBRA, ENTRADA_ESTORNO, SAIDA_DESMANCHE, ENTRADA_DESMANCHE, SAIDA_TRANSFERENCIA, ENTRADA_TRANSFERENCIA
