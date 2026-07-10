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

O seed (utilizadores, categorias, produtos demo) corre manualmente uma única vez:

```bash
docker exec -it elglobo-app node node_modules/prisma/build/index.js db seed 2>/dev/null \
  || echo "Seed requer tsx — em alternativa criar o ADMIN via SQL ou correr o seed localmente apontando ao VPS"
```

> Nota: o seed usa `tsx` (devDependency) que não existe na imagem de produção.
> Alternativa recomendada: a partir da máquina de dev, com um túnel SSH para
> a porta do Postgres do VPS, correr `npm run db:seed` com o DATABASE_URL do túnel.

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
