# Deploy — EL Globo no VPS Hostinger

Stack: Docker Compose + Traefik (`traefik-eolu`, rede externa `proxy`) + Cloudflare Proxied.
Domínio: **https://elglobo.rssystems.tech**

## Pré-requisitos no VPS (já existentes)

- Traefik a correr com entrypoint `websecure` e certresolver `letsencrypt`
- Rede Docker externa `proxy` criada (`docker network ls | grep proxy`)
- DNS `elglobo.rssystems.tech` → IP do VPS no Cloudflare (nuvem laranja)

## Passos

```bash
# 1. Clonar o repositório
cd /opt
git clone https://github.com/Mr-Rich-01/el-globo.git elglobo
cd elglobo

# 2. Criar o .env de produção (NUNCA commitar)
cp .env.example .env
nano .env   # definir DB_PASSWORD e JWT_SECRET fortes
# gerar JWT_SECRET: openssl rand -hex 32

# 3. Build + arranque
docker compose up -d --build

# 4. Acompanhar o primeiro arranque (migrações + Ready)
docker logs -f elglobo-app
```

O entrypoint aplica `prisma migrate deploy` automaticamente a cada arranque
(idempotente — nunca faz reset aos dados). O primeiro arranque cria a base
`elglobodb` e aplica todas as migrações.

## Seed inicial (apenas primeira instalação)

O seed (utilizadores, categorias, produtos demo, mesas) corre manualmente uma
única vez. Como usa `tsx` (devDependency que não existe na imagem de produção),
corre num container one-off `node:20-alpine` ligado à rede interna do compose:

```bash
cd /opt/elglobo
set -a; . ./.env; set +a   # carrega DB_PASSWORD para a shell

docker run --rm --network elglobo_elglobo_internal \
  -v "$PWD/el-globo:/app" -v /app/node_modules -w /app \
  -e DATABASE_URL="postgresql://elglobo:${DB_PASSWORD}@elglobo-db:5432/elglobodb" \
  node:20-alpine sh -c "apk add --no-cache openssl && npm ci && npx prisma generate && npx prisma db seed"
```

> O nome da rede é `<projeto>_<rede>` = `elglobo_elglobo_internal` — confirmar
> com `docker network ls | grep elglobo` se o comando falhar com "network not found".
> O `-v /app/node_modules` (volume anónimo) evita que o `npm ci` escreva
> `node_modules` dentro do clone git no host.

O seed é idempotente (usa `upsert`) — correr duas vezes não duplica dados.
No fim imprime as credenciais criadas (todas com a senha `elglobo123`):
`admin@elglobo.com`, `gerente@elglobo.com`, `gerente.loja@elglobo.com`,
`mesa@elglobo.com`, `bottlestore@elglobo.com`, `cozinha@elglobo.com`.

## Atualizações (novos deploys)

```bash
cd /opt/elglobo
git pull
docker compose up -d --build
```

As fotos dos produtos ficam no volume `elglobo_uploads` e os dados no volume
`elglobo_postgres_data` — sobrevivem a qualquer rebuild/redeploy.

## Verificação pós-deploy

```bash
docker ps --filter name=elglobo          # ambos os containers Up (db: healthy)
docker logs elglobo-app | tail -20       # "All migrations..." + "Ready"
curl -sI https://elglobo.rssystems.tech/menu | head -1   # HTTP/2 200
```

## Backup da base de dados

```bash
docker exec elglobo-db pg_dump -U elglobo elglobodb | gzip > backup_$(date +%F).sql.gz
```

## Resolução de problemas

### "Credenciais inválidas ou conta desativada" no primeiro login

Esta mensagem significa que o email não existe na base de dados — as migrações
correm automaticamente no arranque, mas o **seed não**. Correr o seed (secção
acima) e verificar que os utilizadores existem:

```bash
docker exec -it elglobo-db psql -U elglobo -d elglobodb \
  -c 'SELECT email, role, ativo FROM users;'
```

Para ver o erro do backend em tempo real enquanto se tenta o login:

```bash
docker logs -f --tail 50 elglobo-app
```

### Layout do repositório (não "corrigir" os caminhos!)

A app Next.js vive na subpasta `el-globo/` — o `package.json` está em
`el-globo/package.json`, **não** na raiz. Os `COPY el-globo/...` do
`docker/Dockerfile` estão corretos para o contexto de build (a raiz do repo)
e não devem ser normalizados para `COPY package.json ./`. Reescrever esses
caminhos produz exatamente este erro:

```
failed to compute cache key: "/package.json": not found
```

Nunca editar `Dockerfile`/`docker-compose.yml` diretamente na VPS: alterar
localmente → commit → push → `git pull` na VPS.

### Recuperar uma VPS com ficheiros alterados à mão

Descarta as edições locais e repõe o estado exato do GitHub:

```bash
cd /opt/elglobo        # ou a pasta onde foi feito o clone
git fetch origin
git reset --hard origin/main
docker compose build --no-cache elglobo-app
docker compose up -d
```

### Docker Manager da Hostinger

O painel copia apenas o `docker-compose.yml` + `.env` para uma pasta própria —
a partir daí o `build.context: .` (que resolve **relativamente ao compose file**,
não ao diretório atual) fica vazio e o build falha. O build tem de correr a
partir da raiz do clone git (onde estão `docker/` e `el-globo/`). Para usar o
painel, apontar o Docker Manager para o `docker-compose.yml` dentro do clone.
