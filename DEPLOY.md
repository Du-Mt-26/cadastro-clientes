# 🚀 Deploy: Vercel + Turso

## Passo a passo para colocar o sistema no ar

### 1. Criar conta no Turso (banco de dados)

```bash
# Instalar CLI do Turso
curl -sSfL https://get.tur.so/install.sh | bash

# Login (abre o navegador)
turso auth login

# Criar o banco de dados
turso db create mtech-clientes

# Anotar a URL do banco
turso db show mtech-clientes --url
# → libsql://mtech-clientes-seu-usuario.turso.co

# Criar token de autenticação
turso db tokens create mtech-clientes
# → eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...
```

### 2. Importar dados para o Turso

```bash
# Configurar variáveis de ambiente
export TURSO_DATABASE_URL="libsql://mtech-clientes-seu-usuario.turso.co"
export TURSO_AUTH_TOKEN="seu-token-aqui"

# Fazer push do schema para o Turso
bun run db:push

# Importar os dados XLSX para o banco
bun run prisma/seed.ts
```

### 3. Criar conta na Vercel

1. Acesse https://vercel.com
2. Clique "Sign Up" → "Continue with GitHub"
3. Autorize o Vercel a acessar seu GitHub

### 4. Subir o código para o GitHub

```bash
# Inicializar git (se ainda não tiver)
git init
git add .
git commit -m "Sistema Mtech Clientes - pronto para deploy"

# Criar repositório no GitHub e push
# (via GitHub Desktop ou linha de comando)
```

### 5. Deploy na Vercel

1. No painel da Vercel, clique **"Add New..."** → **"Project"**
2. Selecione o repositório GitHub
3. Em **"Environment Variables"**, adicionar:
   - `TURSO_DATABASE_URL` = `libsql://mtech-clientes-seu-usuario.turso.co`
   - `TURSO_AUTH_TOKEN` = `seu-token-aqui`
4. Clique **"Deploy"**
5. Pronto! Acesse `https://seu-app.vercel.app`

### 6. Atualizações futuras

Toda vez que você fizer `git push` para o GitHub, a Vercel faz o deploy automaticamente.

---

## Variáveis de Ambiente

| Variável | Onde | Valor |
|----------|------|-------|
| `DATABASE_URL` | Desenvolvimento local | `file:./db/custom.db` |
| `TURSO_DATABASE_URL` | Vercel (produção) | `libsql://mtech-clientes-xxx.turso.co` |
| `TURSO_AUTH_TOKEN` | Vercel (produção) | Token gerado pelo Turso |

## Custo

| Serviço | Plano | Custo |
|---------|-------|-------|
| **Vercel** | Hobby (grátis) | R$ 0 |
| **Turso** | Starter (grátis) | R$ 0 |
| **GitHub** | Free | R$ 0 |
| **Total** | | **R$ 0/mês** |

## Limites do plano grátis

- **Vercel**: 100GB bandwidth/mês, 1000 builds/mês
- **Turso**: 9GB armazenamento, 1 bilhão de rows lidas/mês
- Para uso interno com ~2000 clientes: sobra!
