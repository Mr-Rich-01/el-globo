# ============================================================
# EL GLOBO — Imagem de produção
# Next.js 16 (output standalone) + Prisma 7 + PostgreSQL 16
# Contexto de build: RAIZ do repositório (ver docker-compose.yml)
#   docker build -f docker/Dockerfile .
# ============================================================

# ============================
# Stage 1: deps — instala TODAS as dependências
# (o `next build` precisa das devDependencies: typescript, tailwind, etc.)
# ============================
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY el-globo/package.json el-globo/package-lock.json ./
RUN npm ci && npm cache clean --force

# ============================
# Stage 2: builder — gera o Prisma Client e o build standalone
# ============================
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY el-globo/ .

ENV NEXT_TELEMETRY_DISABLED=1
# Placeholder: o prisma.config.ts exige DATABASE_URL definido; nenhuma
# ligação é aberta durante generate/build (páginas com DB são dinâmicas)
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
# Margem de RAM para o build no VPS partilhado (8GB) sem sufocar os outros projetos
ENV NODE_OPTIONS="--max-old-space-size=2048"

RUN npx prisma generate
RUN npm run build

# Árvore do Prisma CLI para o `migrate deploy` no runner: fecho transitivo
# de dependências calculado dos package.json reais (o bundle do CLI 7 requer
# estaticamente @prisma/config, @prisma/dev e @prisma/studio-core — uma lista
# manual quebraria a cada upgrade do Prisma)
RUN node -e ' \
  const fs=require("fs"),path=require("path"),cp=require("child_process"); \
  const seen=new Set(),q=["prisma","dotenv"]; \
  while(q.length){ \
    const n=q.shift(); if(seen.has(n))continue; seen.add(n); \
    let pj; try{pj=JSON.parse(fs.readFileSync(path.join("node_modules",n,"package.json")))}catch(e){continue} \
    for(const d of Object.keys(pj.dependencies||{}))q.push(d); \
    for(const d of Object.keys(pj.optionalDependencies||{})) \
      if(fs.existsSync(path.join("node_modules",d)))q.push(d); \
  } \
  for(const n of seen){ \
    const dest=path.join("/prisma-cli",n); \
    fs.mkdirSync(path.dirname(dest),{recursive:true}); \
    cp.execSync("cp -r node_modules/"+n+" "+dest); \
  } \
  console.log("Prisma CLI: "+seen.size+" pacotes copiados"); \
' && \
    # Query compilers de bases que não usamos (carregados dinamicamente; poupa ~20MB)
    rm -f /prisma-cli/prisma/build/query_compiler_*.mysql.js \
          /prisma-cli/prisma/build/query_compiler_*.sqlite.js \
          /prisma-cli/prisma/build/query_compiler_*.sqlserver.js \
          /prisma-cli/prisma/build/query_compiler_*.cockroachdb.js && \
    # Artefactos que nunca são carregados em runtime: types, source maps, fontes TS
    rm -rf /prisma-cli/effect/src && \
    find /prisma-cli -type f \( -name "*.d.ts" -o -name "*.d.mts" -o -name "*.d.cts" \
         -o -name "*.map" -o -name "*.ts.map" \) -delete

# ============================
# Stage 3: runner — imagem final mínima (standalone ~150MB)
# ============================
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Limite de heap para respeitar a RAM partilhada do VPS de 8GB
ENV NODE_OPTIONS="--max-old-space-size=768"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Output standalone do Next.js (server.js + node_modules traçados)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma CLI + schema/migrações para `migrate deploy` no arranque (sem rede).
# O @prisma/client já vem traçado no standalone; o /prisma-cli tem só o CLI
# e as suas dependências reais (ver stage builder) — nunca o @prisma inteiro
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /prisma-cli ./node_modules

# Diretório de uploads pré-criado com owner correto — o volume nomeado
# herda estas permissões no primeiro mount
RUN mkdir -p public/uploads/produtos && chown -R nextjs:nodejs public/uploads

# Entrypoint: migrações + arranque (sed remove CRLF caso o repo venha do Windows)
COPY docker/entrypoint.sh ./entrypoint.sh
RUN sed -i 's/\r$//' ./entrypoint.sh && chmod +x ./entrypoint.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./entrypoint.sh"]
