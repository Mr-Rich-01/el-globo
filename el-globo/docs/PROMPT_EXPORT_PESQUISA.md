# Tarefa: Exportação Excel + pesquisa na sessão Produtos (El Globo)

Lê `CLAUDE.md` antes de começar. As convenções desse ficheiro prevalecem sobre qualquer coisa
escrita aqui.

## Objectivo

Três entregas na sessão Produtos:

1. Exportar todos os produtos para `.xlsx` com o mesmo layout de colunas do template de
   importação existente (ficheiro exportado tem de ser re-importável).
2. Barra de pesquisa por nome, SKU ou código de barras na listagem.
3. Regra de `stock_inicial` na reimportação (detalhe na secção "Regra crítica").

## Colunas (ordem exacta, minúsculas, sem alterações)

```
nome | sku | codigo_barras | grupo | subcategoria | descricao | unidade | canal |
preco_venda | preco_custo | stock_inicial | stock_minimo | ingrediente | ativo
```

Uma linha por par (produto, canal). Produto sem canal associado sai com `canal` vazio — não
omitir a linha.

`ingrediente` e `ativo` são `SIM`/`NÃO`. Booleanos não saem como `TRUE`/`FALSE`.

---

## 1. Route de exportação

`app/api/produtos/export/route.ts`, `GET`, ExcelJS (já é dependência do projecto — **não
adicionar dependências novas**).

Requisitos:

- Autenticação obrigatória; `forCompany` na query Prisma como em todo o lado.
- Aceita os mesmos query params da listagem (`q`, `canal`, `ativo`) e exporta exactamente o
  conjunto filtrado que o utilizador está a ver.
- Ordenação: `grupo`, `subcategoria`, `nome`.
- Cabeçalho a negrito, fundo `FFEEEEEE`, linha 1 congelada, `autoFilter` sobre o cabeçalho.
- `Content-Disposition: attachment`, nome `produtos_YYYY-MM-DD.xlsx`, `Cache-Control: no-store`.

### Tipos de célula — parte mais importante desta route

Isto foi verificado num ficheiro real e é onde a implementação ingénua falha:

- `codigo_barras` e `sku`: **string, com `numFmt = '@'` na coluna.** Nunca prefixar com
  apóstrofo. O apóstrofo passa a fazer parte do valor e volta sujo na reimportação. É o
  `numFmt` que impede o Excel de converter o EAN-13 para notação científica.
- `preco_venda`, `preco_custo`, `stock_inicial`, `stock_minimo`: **número real na célula**, não
  string `"150,00"`. Formato `#,##0.00` para dinheiro e `#,##0.###` para quantidades. Em locale
  pt-MZ o Excel mostra vírgula na mesma e o utilizador consegue somar e filtrar.
- Conversão `Decimal → Number` só na escrita da célula. **Nenhuma aritmética sobre esse valor.**
  `preco_custo` ausente escreve `null`, não `0`.

Depois de implementar, verifica os tipos com um script que reabra o ficheiro e imprima
`type()` de cada célula das colunas numéricas. Se alguma sair como texto, está errado.

---

## 2. Barra de pesquisa

`components/produtos/produtos-toolbar.tsx`, client component.

- Um único input que procura em `nome`, `sku` e `codigoBarras` (`OR`, `contains`,
  `mode: 'insensitive'`).
- Debounce de 300ms a escrever em query param `q` via `router.replace(..., { scroll: false })`.
  Estado na URL, não em `useState` isolado — a exportação e a paginação leem daí.
- `Enter` dispara a pesquisa imediatamente e faz `select()` no input. Os leitores de código de
  barras emitem `Enter` no fim da leitura; sem isto o operador tem de limpar o campo à mão
  entre leituras.
- `Escape` limpa. Botão `X` quando há texto.
- Reset da paginação (`p.delete('page')`) a cada alteração do termo.
- Botão "Exportar Excel" ao lado, `href` = `/api/produtos/export?` + query string actual.
- Altura mínima 44px nos alvos de toque (a sessão é usada em Tab A8).

Extrai o bloco `where` para `lib/produtos/filtros.ts` e importa-o **na página de listagem e na
route de exportação**. Duas cópias divergem em duas semanas.

---

## 3. Regra crítica — `stock_inicial` na reimportação

`stock_inicial` é um campo de **abertura**, não de estado. Só tem significado no instante em que
o par (SKU, canal) passa a existir.

- Upsert resolve para **INSERT** → aplica, criando movimento de ledger `ENTRADA_INICIAL` com
  `sourceType: 'IMPORT_PRODUTOS'` e `sourceId: importId` (chave de idempotência
  `(companyId, sourceType, sourceId, tipo)`).
- Upsert resolve para **UPDATE** → **ignora a coluna**, qualquer que seja o valor. Actualiza
  apenas nome, descrição, grupo, subcategoria, preços e `stock_minimo`.

Quando ignora e o valor difere do saldo actual, empurra aviso para o dry-run:

```
STOCK_INICIAL_IGNORADO — linha N: stock_inicial=X ignorado, {sku}/{canal} já existe
(saldo actual Y). Para corrigir stock usa Ajustes de Inventário.
```

O aviso não é opcional. Sem ele o utilizador vê "9 linhas actualizadas" e assume que o stock
ficou no valor que escreveu.

**Porquê:** o ficheiro exportado traz o saldo actual nessa coluna. Sem esta regra, uma
reimportação para corrigir um preço reescreve stock — ou por update directo ao campo (fora do
ledger, criando divergência silenciosa entre campo e somatório de movimentos) ou criando um
movimento que duplica o saldo a cada importação.

A decisão INSERT vs UPDATE tem de ser tomada **dentro da transação**, com `FOR UPDATE` no
produto. O dry-run corre antes e é meramente informativo: entre o dry-run e o commit, outra
linha do mesmo ficheiro ou outro utilizador pode ter criado o par. Não usar a classificação do
dry-run para decidir se aplica stock.

---

## Regras invioláveis

- Dinheiro e quantidades como decimal string. **Nunca `parseFloat`.** `round2` é a única função
  de arredondamento.
- Stock move-se **sempre** por ledger. Nunca update directo ao campo de saldo.
- `forCompany` / `forContext` em todas as queries Prisma.
- Migrações apenas aditivas.

## Requer aprovação explícita antes de escrever código

Pára e pergunta se a implementação precisar de:

- Migração de schema ou qualquer alteração destrutiva.
- Dependência nova ou subida de versão maior.
- Alteração a lógica de custeio, journal entries ou eventos contabilísticos.
- Alteração a auth/RBAC.

## Fora de âmbito nesta sessão

- **Coluna IVA** — decisão ainda em aberto. Não adicionar ao export. Se for adicionada, entra
  nos dois templates na mesma alteração, nunca só num.
- **Pesquisa sem acentos** (`maracuja` encontrar `Maracujá`) — exige `CREATE EXTENSION unaccent`,
  índice GIN e `queryRaw`. É migração de base de dados: propõe, não executes.

## Critérios de aceitação

1. Exportar → abrir no Excel em Windows → colunas numéricas somáveis, sem triângulo verde de
   "número guardado como texto".
2. Código de barras `6291041500213` legível como está, sem apóstrofo e sem notação científica.
3. Reimportar o ficheiro exportado sem alterações → zero mudanças de stock, avisos
   `STOCK_INICIAL_IGNORADO` no dry-run para as linhas existentes.
4. Alterar um preço no ficheiro e reimportar → só o preço muda, saldo de stock intacto.
5. Pesquisar por código de barras completo → 1 resultado. Leitor de barras funciona sem tocar
   no teclado entre leituras.
6. Filtrar por canal e exportar → ficheiro contém apenas esse canal.

## Ordem de execução

Extracção do `where` partilhado → route de exportação → verificação de tipos de célula →
toolbar de pesquisa → regra de `stock_inicial` no importador → teste de roundtrip.

Commit por etapa. Actualiza `MODULE_STATUS.md` antes do handoff.
