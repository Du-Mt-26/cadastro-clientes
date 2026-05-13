#!/usr/bin/env python3
"""
Gera o relatório PDF: Avaliação de Arquitetura — Mtech Cadastro de Clientes
"""

import os
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    KeepTogether, PageBreak, HRFlowable, ListFlowable, ListItem,
)
from reportlab.platypus.flowables import Flowable
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ── Palette ──
PAGE_BG       = colors.HexColor('#f0f1f1')
CARD_BG       = colors.HexColor('#e8eaeb')
TABLE_STRIPE  = colors.HexColor('#ebedee')
HEADER_FILL   = colors.HexColor('#3b4a52')
COVER_BLOCK   = colors.HexColor('#43606e')
BORDER        = colors.HexColor('#b9c9d1')
ICON          = colors.HexColor('#427690')
ACCENT        = colors.HexColor('#ca2a45')
ACCENT_2      = colors.HexColor('#7c45a2')
TEXT_PRIMARY   = colors.HexColor('#1b1d1e')
TEXT_MUTED     = colors.HexColor('#848b8e')
SEM_SUCCESS   = colors.HexColor('#4f9165')
SEM_WARNING   = colors.HexColor('#a58443')
SEM_ERROR     = colors.HexColor('#b05047')
SEM_INFO      = colors.HexColor('#56799c')

# ── Fonts ──
FONT_DIR = '/usr/share/fonts/truetype'
pdfmetrics.registerFont(TTFont('DejaVuSans', os.path.join(FONT_DIR, 'dejavu/DejaVuSans.ttf')))
pdfmetrics.registerFont(TTFont('DejaVuSansBold', os.path.join(FONT_DIR, 'dejavu/DejaVuSans-Bold.ttf')))
pdfmetrics.registerFont(TTFont('DejaVuMono', os.path.join(FONT_DIR, 'dejavu/DejaVuSansMono.ttf')))

FONT = 'DejaVuSans'
FONT_BOLD = 'DejaVuSansBold'
FONT_MONO = 'DejaVuMono'

# ── Page setup ──
PAGE_W, PAGE_H = A4
MARGIN = 20*mm
OUTPUT = '/home/z/my-project/download/avaliacao-arquitetura-mtech.pdf'

doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    leftMargin=MARGIN,
    rightMargin=MARGIN,
    topMargin=MARGIN,
    bottomMargin=MARGIN,
    title='Avaliação de Arquitetura — Mtech Cadastro de Clientes',
    author='Z.ai',
    subject='Análise arquitetural do sistema cadastro-clientes para evolução a CRM',
)

CONTENT_W = PAGE_W - 2 * MARGIN

# ── Styles ──
styles = getSampleStyleSheet()

sH1 = ParagraphStyle('H1', parent=styles['Heading1'], fontName=FONT_BOLD, fontSize=20,
    leading=26, spaceAfter=12, textColor=HEADER_FILL, borderPadding=4)
sH2 = ParagraphStyle('H2', parent=styles['Heading2'], fontName=FONT_BOLD, fontSize=14,
    leading=18, spaceAfter=8, spaceBefore=16, textColor=COVER_BLOCK)
sH3 = ParagraphStyle('H3', parent=styles['Heading3'], fontName=FONT_BOLD, fontSize=11,
    leading=14, spaceAfter=6, spaceBefore=10, textColor=ICON)
sBody = ParagraphStyle('Body', parent=styles['Normal'], fontName=FONT, fontSize=9.5,
    leading=14, spaceAfter=6, alignment=TA_JUSTIFY, textColor=TEXT_PRIMARY)
sBodySmall = ParagraphStyle('BodySmall', parent=sBody, fontSize=8.5, leading=12)
sCode = ParagraphStyle('Code', parent=sBody, fontName=FONT_MONO, fontSize=8,
    leading=11, backColor=CARD_BG, borderPadding=4, spaceAfter=6, spaceBefore=2)
sBullet = ParagraphStyle('Bullet', parent=sBody, leftIndent=16, bulletIndent=6,
    spaceAfter=3, spaceBefore=1)
sCaption = ParagraphStyle('Caption', parent=sBody, fontName=FONT, fontSize=8,
    leading=10, textColor=TEXT_MUTED, alignment=TA_CENTER, spaceAfter=10, spaceBefore=4)
sCoverTitle = ParagraphStyle('CoverTitle', fontName=FONT_BOLD, fontSize=28,
    leading=34, alignment=TA_CENTER, textColor=colors.white, spaceAfter=8)
sCoverSub = ParagraphStyle('CoverSub', fontName=FONT, fontSize=13,
    leading=18, alignment=TA_CENTER, textColor=colors.HexColor('#d0e0e8'))
sCoverMeta = ParagraphStyle('CoverMeta', fontName=FONT, fontSize=10,
    leading=14, alignment=TA_CENTER, textColor=colors.HexColor('#a0b8c4'))
sSeverityCritical = ParagraphStyle('SevCritical', parent=sBody, fontName=FONT_BOLD,
    fontSize=9, textColor=SEM_ERROR)
sSeverityWarning = ParagraphStyle('SevWarning', parent=sBody, fontName=FONT_BOLD,
    fontSize=9, textColor=SEM_WARNING)
sSeverityInfo = ParagraphStyle('SevInfo', parent=sBody, fontName=FONT_BOLD,
    fontSize=9, textColor=SEM_INFO)
sSeverityGood = ParagraphStyle('SevGood', parent=sBody, fontName=FONT_BOLD,
    fontSize=9, textColor=SEM_SUCCESS)


class CoverBlock(Flowable):
    """Custom cover page flowable - fits within frame."""
    def __init__(self, w, h):
        Flowable.__init__(self)
        self.width = w
        self.height = min(h, 700)  # Ensure fits within frame

    def wrap(self, availWidth, availHeight):
        self.width = min(self.width, availWidth)
        self.height = min(self.height, availHeight - 10)
        return (self.width, self.height)

    def draw(self):
        c = self.canv
        W, H = self.width, self.height
        # Dark background
        c.setFillColor(HEADER_FILL)
        c.rect(0, 0, W, H, fill=True, stroke=False)
        # Accent bar
        c.setFillColor(ACCENT)
        c.rect(0, H * 0.42, W, 4*mm, fill=True, stroke=False)
        # Decorative circles
        c.setFillColor(colors.HexColor('#4a5e68'))
        c.circle(W * 0.85, H * 0.78, 60, fill=True, stroke=False)
        c.setFillColor(colors.HexColor('#3f535c'))
        c.circle(W * 0.1, H * 0.15, 40, fill=True, stroke=False)
        # Title
        c.setFillColor(colors.white)
        c.setFont(FONT_BOLD, 26)
        c.drawCentredString(W / 2, H * 0.65, 'Avaliação de Arquitetura')
        c.setFont(FONT_BOLD, 20)
        c.drawCentredString(W / 2, H * 0.58, 'Mtech Cadastro de Clientes')
        # Subtitle
        c.setFillColor(colors.HexColor('#a0c0d0'))
        c.setFont(FONT, 11)
        c.drawCentredString(W / 2, H * 0.48, 'Análise para evolução do sistema de apoio a vendedores')
        c.drawCentredString(W / 2, H * 0.45, 'a uma plataforma CRM (estilo Pipedrive)')
        # Meta
        c.setFillColor(colors.HexColor('#7a9aaa'))
        c.setFont(FONT, 9)
        c.drawCentredString(W / 2, H * 0.25, 'Repositório: Du-Mt-26/cadastro-clientes')
        c.drawCentredString(W / 2, H * 0.22, 'Deploy: mtech-clientes.vercel.app')
        c.drawCentredString(W / 2, H * 0.19, 'Framework: Next.js 16 + Prisma + PostgreSQL (Neon)')
        c.drawCentredString(W / 2, H * 0.12, 'Data: 13 de Maio de 2026')
        c.drawCentredString(W / 2, H * 0.09, 'Elaborado por: Z.ai')


def make_table(headers, rows, col_widths=None):
    """Create a styled table."""
    data = [headers] + rows
    if col_widths is None:
        n = len(headers)
        col_widths = [CONTENT_W / n] * n
    t = Table(data, colWidths=col_widths, repeatRows=1)
    style = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), FONT_BOLD),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('FONTNAME', (0, 1), (-1, -1), FONT),
        ('FONTSIZE', (0, 1), (-1, -1), 8.5),
        ('LEADING', (0, 0), (-1, -1), 12),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, TABLE_STRIPE]),
    ])
    t.setStyle(style)
    return t


def sev(text, level):
    """Return severity-tagged paragraph."""
    style_map = {
        'critical': sSeverityCritical,
        'warning': sSeverityWarning,
        'info': sSeverityInfo,
        'good': sSeverityGood,
    }
    label_map = {'critical': '[CRÍTICO]', 'warning': '[ALERTA]', 'info': '[INFO]', 'good': '[OK]'}
    s = style_map.get(level, sBody)
    label = label_map.get(level, '')
    return Paragraph(f'{label} {text}', s)


story = []

# ── COVER ──
story.append(CoverBlock(CONTENT_W, 690))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════
# 1. SUMÁRIO EXECUTIVO
# ═══════════════════════════════════════════════════════════════
story.append(Paragraph('1. Sumário Executivo', sH1))
story.append(Paragraph(
    'Este documento apresenta uma avaliação abrangente da arquitetura do sistema "Cadastro de Clientes" '
    'da Mtech Geral, atualmente hospedado em mtech-clientes.vercel.app. O sistema foi desenvolvido como '
    'ferramenta de apoio aos vendedores de uma distribuidora de informática, com funcionalidades de gestão '
    'de carteiras de clientes, integração com Google Sheets, autenticação com 2FA e controle de acesso '
    'baseado em papéis (RBAC). A análise foi conduzida com o objetivo de identificar gargalos, riscos '
    'técnicos e oportunidades de melhoria que viabilizem a evolução do sistema para uma plataforma CRM '
    'completa, similar a soluções como Pipedrive ou HubSpot.', sBody))
story.append(Spacer(1, 6))
story.append(Paragraph(
    'A arquitetura atual segue o padrão monolítico do Next.js com API Routes, Prisma ORM e PostgreSQL '
    'via Neon. Embora funcional para o escopo atual, o sistema apresenta problemas estruturais '
    'significativos que comprometem a escalabilidade, a manutenibilidade e a experiência de '
    'desenvolvimento. O componente principal (page.tsx) possui 1.335 linhas de código com 30+ estados '
    'React gerenciados manualmente, a camada de dados carrega todos os clientes em memória antes de '
    'filtrar, e não existe separação clara de responsabilidades entre camadas.', sBody))
story.append(Spacer(1, 6))

# Summary table
story.append(Paragraph('<b>Visão Geral de Saúde da Arquitetura</b>', sH3))
story.append(make_table(
    [Paragraph('<b>Dimensão</b>', ParagraphStyle('', parent=sBody, textColor=colors.white, fontName=FONT_BOLD, fontSize=9)),
     Paragraph('<b>Nota</b>', ParagraphStyle('', parent=sBody, textColor=colors.white, fontName=FONT_BOLD, fontSize=9, alignment=TA_CENTER)),
     Paragraph('<b>Avaliação</b>', ParagraphStyle('', parent=sBody, textColor=colors.white, fontName=FONT_BOLD, fontSize=9))],
    [
        ['Estrutura do Código', '3/10', 'Componente monolítico de 1.335 linhas; sem separação de camadas'],
        ['Camada de Dados', '2/10', 'Carregamento completo em memória; cache ineficaz em serverless'],
        ['Segurança', '6/10', 'RBAC funcional, 2FA, mas sem CSRF, rate limiting ou validação de entrada'],
        ['Escalabilidade', '3/10', 'Filtros e paginação no lado do servidor mas após carregar tudo'],
        ['Testabilidade', '1/10', 'Zero testes; lógica de negócio acoplada à UI e rotas API'],
        ['DX (Developer Experience)', '4/10', 'TypeScript com erros ignorados; sem linting efetivo'],
        ['Infraestrutura', '7/10', 'Vercel + Neon é adequado; schema com indexes corretos'],
        ['UI/UX', '7/10', 'shadcn/ui profissional; dark mode; responsivo; bom para o escopo atual'],
    ],
    col_widths=[CONTENT_W * 0.22, CONTENT_W * 0.10, CONTENT_W * 0.68]
))
story.append(Spacer(1, 12))

# ═══════════════════════════════════════════════════════════════
# 2. STACK TECNOLÓGICO
# ═══════════════════════════════════════════════════════════════
story.append(Paragraph('2. Stack Tecnológico Atual', sH1))
story.append(Paragraph(
    'O sistema utiliza um stack moderno baseado em Next.js, o que é uma escolha sólida para aplicações '
    'web fullstack. No entanto, diversas decisões de implementação comprometem os benefícios que esse '
    'stack poderia oferecer. A tabela abaixo detalha cada tecnologia utilizada, sua versão e uma '
    'avaliação sobre a adequação da escolha e do uso que está sendo feito.', sBody))

story.append(make_table(
    [Paragraph('<b>Tecnologia</b>', ParagraphStyle('', parent=sBody, textColor=colors.white, fontName=FONT_BOLD, fontSize=9)),
     Paragraph('<b>Versão</b>', ParagraphStyle('', parent=sBody, textColor=colors.white, fontName=FONT_BOLD, fontSize=9, alignment=TA_CENTER)),
     Paragraph('<b>Papel</b>', ParagraphStyle('', parent=sBody, textColor=colors.white, fontName=FONT_BOLD, fontSize=9)),
     Paragraph('<b>Avaliação</b>', ParagraphStyle('', parent=sBody, textColor=colors.white, fontName=FONT_BOLD, fontSize=9))],
    [
        ['Next.js', '16.1.1', 'Framework fullstack (App Router)', 'Adequado, mas uso subótimo: página inteira é client-side'],
        ['React', '19.x', 'UI library', 'Adequado, mas sem uso de Server Components no page.tsx'],
        ['Prisma', '6.11.1', 'ORM (PostgreSQL/Neon)', 'Bom, mas queries deveriam filtrar no DB, não em memória'],
        ['NextAuth.js', '4.x', 'Autenticação', 'Funcional mas v4 está em modo legado; v5 disponível'],
        ['Tailwind CSS', '4.x', 'Estilização', 'Excelente escolha, bem utilizado com shadcn/ui'],
        ['shadcn/ui', '-', 'Component library', 'Excelente, 40+ componentes instalados'],
        ['Neon (PostgreSQL)', '-', 'Banco de dados serverless', 'Adequado para Vercel; indexes bem definidos'],
        ['xlsx', '0.18.5', 'Import/Export Excel', 'Funcional mas pesado; considerar alternativas streaming'],
        ['googleapis', '171.x', 'Google Sheets API', 'Instalado mas não utilizado; sync usa CSV público'],
        ['z-ai-web-dev-sdk', '0.0.17', 'SDK de IA', 'Instalado mas sem uso aparente no código'],
        ['framer-motion', '12.x', 'Animações', 'Instalado mas uso mínimo no sistema'],
        ['zod', '4.x', 'Validação de schemas', 'Instalado mas NÃO utilizado nas API routes'],
    ],
    col_widths=[CONTENT_W * 0.18, CONTENT_W * 0.10, CONTENT_W * 0.28, CONTENT_W * 0.44]
))
story.append(Spacer(1, 8))

story.append(sev('O arquivo package.json lista dependências não utilizadas (googleapis, z-ai-web-dev-sdk, framer-motion) que aumentam o bundle size e a superfície de ataque.', 'warning'))
story.append(sev('Zod está instalado mas nenhuma API route utiliza validação de schema. Dados são aceitos diretamente do request.body sem validação.', 'critical'))
story.append(sev('NextAuth v4 está em modo de manutenção. A migração para v5 (Auth.js) deve ser planejada.', 'info'))

# ═══════════════════════════════════════════════════════════════
# 3. ANÁLISE DO CÓDIGO-FONTE
# ═══════════════════════════════════════════════════════════════
story.append(Paragraph('3. Análise Detalhada do Código-Fonte', sH1))

# 3.1 Frontend
story.append(Paragraph('3.1. Frontend: O Monólito de 1.335 Linhas', sH2))
story.append(Paragraph(
    'O arquivo src/app/page.tsx é o componente principal da aplicação e contém 1.335 linhas de código. '
    'Este único arquivo concentra toda a lógica de apresentação, gerenciamento de estado, manipulação de '
    'dados, filtros, paginação, exportação, modais de detalhes e formulários. O componente gerencia mais '
    'de 30 estados React com useState, incluindo estados para filtros, paginação, ordenação, modais, '
    'formulários, auditoria e sincronização com Google Sheets.', sBody))

story.append(Paragraph('<b>Problemas identificados:</b>', sH3))
story.append(Paragraph('1. <b>Violação do Princípio da Responsabilidade Única (SRP)</b>: O componente Home é '
    'simultaneamente a view de listagem, o controller de filtros, o gerenciador de modais, o handler de '
    'exportação, o formulário de novo cliente e o visualizador de detalhes. Qualquer mudança em qualquer '
    'funcionalidade requer edição no mesmo arquivo gigante, aumentando exponencialmente o risco de '
    'regressões e conflitos em merges.', sBullet))
story.append(Paragraph('2. <b>Estado não gerenciado</b>: Com 30+ useState, o componente sofre de "prop drilling" '
    'severo. Estados como saving, exporting, consulting, loading são gerenciados individualmente em vez '
    'de utilizarem um reducer (useReducer) ou uma biblioteca de gerenciamento de estado como Zustand ou '
    'Jotai. A lógica de filtros interdependentes (cidade depende de UF, paginação reseta ao filtrar) está '
    'espalhada por múltiplos useEffects com dependências complexas.', sBullet))
story.append(Paragraph('3. <b>Filtragem client-side de "dias sem venda"</b>: O filtro de dias sem venda é aplicado '
    'no cliente após receber todos os dados do servidor. Isso significa que se houver 10.000 clientes, '
    'todos são transmitidos pela rede para então serem filtrados no browser. A paginação funciona apenas '
    'para os dados já filtrados no servidor, criando inconsistência na contagem total.', sBullet))
story.append(Paragraph('4. <b>Fetch manual sem SWR/React Query</b>: As chamadas à API são feitas com fetch nativo '
    'dentro de useEffect, sem cache, deduplicação, revalidação automática ou tratamento de corrida (race '
    'conditions). Se o usuário trocar de página rapidamente, respostas de requests antigos podem '
    'sobrescrever dados mais recentes.', sBullet))
story.append(Paragraph('5. <b>Componente "use client" puro</b>: page.tsx é inteiramente client-side, desperdiçando '
    'o maior benefício do Next.js App Router: Server Components. A página poderia renderizar dados '
    'iniciais no servidor, enviando HTML pronto ao cliente, com interatividade hidratada seletivamente.', sBullet))
story.append(Spacer(1, 6))

# 3.2 Backend
story.append(Paragraph('3.2. Backend: API Routes com Lógica de Negócio Acoplada', sH2))
story.append(Paragraph(
    'As API routes do Next.js (localizadas em src/app/api/) funcionam como o backend do sistema. No '
    'total, são 15 rotas totalizando 1.820 linhas de código. Embora a separação em rotas distintas seja '
    'razoável, cada rota contém toda a lógica de autenticação, autorização, validação, acesso a dados e '
    'resposta HTTP inline, sem nenhuma camada de service ou repository.', sBody))

story.append(Paragraph('<b>Distribuição de linhas por rota:</b>', sH3))
story.append(make_table(
    [Paragraph('<b>Rota API</b>', ParagraphStyle('', parent=sBody, textColor=colors.white, fontName=FONT_BOLD, fontSize=9)),
     Paragraph('<b>Linhas</b>', ParagraphStyle('', parent=sBody, textColor=colors.white, fontName=FONT_BOLD, fontSize=9, alignment=TA_CENTER)),
     Paragraph('<b>Métodos</b>', ParagraphStyle('', parent=sBody, textColor=colors.white, fontName=FONT_BOLD, fontSize=9)),
     Paragraph('<b>Observações</b>', ParagraphStyle('', parent=sBody, textColor=colors.white, fontName=FONT_BOLD, fontSize=9))],
    [
        ['/api/clientes', '420', 'GET, POST, PATCH', 'Rota principal; GET carrega tudo em memória'],
        ['/api/vendedores', '217', 'GET, POST, PATCH', 'CRUD de vendedores; duplica lógica de /api/users'],
        ['/api/users', '228', 'GET, POST, PATCH, DELETE', 'CRUD de usuários; admin-only'],
        ['/api/clientes/bolsao', '175', 'POST, PATCH', 'Lógica de carteira; N+1 queries em loop'],
        ['/api/clientes/export', '158', 'GET', 'Export XLSX; carrega tudo antes de filtrar'],
        ['/api/clientes/receita', '123', 'GET', 'Consulta ReceitaWS; sem rate limiting próprio'],
        ['/api/sync', '95', 'GET, POST, DELETE', 'Config Google Sheets'],
        ['/api/vendedores/assign', '86', 'PATCH', 'Atribuição cliente→vendedor'],
        ['/api/auth/*', '179', '5 rotas', '2FA setup/verify/disable + forgot-password'],
        ['/api/sync/pull', '39', 'POST', 'Pull do Google Sheets via CSV'],
        ['/api/sync/push', '27', 'POST', 'Stub: não implementado, retorna erro'],
        ['/api/clientes/audit', '22', 'GET', 'Busca logs; sem autenticação'],
    ],
    col_widths=[CONTENT_W * 0.22, CONTENT_W * 0.10, CONTENT_W * 0.20, CONTENT_W * 0.48]
))
story.append(Spacer(1, 6))

story.append(sev('A rota GET /api/clientes carrega TODOS os registros do banco em memória (via getRecords()), filtra em JavaScript e depois pagina. Com 10K+ clientes, isso causará timeouts em serverless functions (limite de 10s no plano Hobby).', 'critical'))
story.append(sev('A rota /api/clientes/audit NÃO verifica autenticação. Qualquer pessoa pode consultar o histórico de alterações de qualquer cliente.', 'critical'))
story.append(sev('A rota /api/clientes/bolsao faz N+1 queries em loop (uma query UPDATE por cliente), quando poderia usar updateMany com uma cláusula WHERE adequada.', 'warning'))
story.append(sev('/api/vendedores e /api/users possuem lógica duplicada de CRUD de usuários. Isso viola DRY e cria inconsistência.', 'warning'))

# 3.3 Data Layer
story.append(Paragraph('3.3. Camada de Dados: Cache Ineficaz em Ambiente Serverless', sH2))
story.append(Paragraph(
    'O módulo clientes-cache.ts implementa um cache in-memory com TTL de 60 segundos. Embora a intenção '
    'seja legítima (reduzir chamadas ao banco), a implementação é fundamentalmente incompatível com o '
    'ambiente serverless da Vercel. Em serverless, cada request pode ser atendida por uma instância '
    'diferente da função, o que significa que o cache in-memory é recriado do zero a cada cold start. '
    'O cache só é efetivo durante a vida útil de uma mesma instância, que pode ser de segundos.', sBody))

story.append(Paragraph('<b>Fluxo problemático atual (GET /api/clientes):</b>', sH3))
story.append(Paragraph('1. getRecords() verifica se há cache em memória (variável global)', sBullet))
story.append(Paragraph('2. Se não houver, executa db.cliente.findMany() SEM filtros, carregando TODOS os registros', sBullet))
story.append(Paragraph('3. Converte todos os registros para ClienteRecord via dbToRecord()', sBullet))
story.append(Paragraph('4. Filtra os registros em JavaScript (por UF, cidade, situação, vendedor, carteira)', sBullet))
story.append(Paragraph('5. Ordena os registros em JavaScript', sBullet))
story.append(Paragraph('6. Calcula estatísticas iterando sobre todos os registros em JavaScript', sBullet))
story.append(Paragraph('7. Pagina os resultados em JavaScript', sBullet))
story.append(Spacer(1, 4))
story.append(Paragraph(
    'Esse fluxo é o oposto do que uma aplicação escalável deveria fazer. O banco de dados PostgreSQL '
    'via Neon suporta nativamente WHERE, ORDER BY, GROUP BY, COUNT, LIMIT e OFFSET com alta eficiência. '
    'Todo o processamento que é feito em JavaScript deveria ser delegado ao banco de dados, que é '
    'otimizado para essas operações. Com 5.000+ clientes, a rota GET pode facilmente exceder o tempo '
    'limite de serverless functions, especialmente em cold starts.', sBody))

# 3.4 Prisma Schema
story.append(Paragraph('3.4. Schema Prisma: Modelo Adequado mas com Problemas', sH2))
story.append(Paragraph(
    'O schema Prisma define 4 modelos: Cliente, User, SyncConfig e AuditLog. A estrutura é razoável '
    'para o escopo atual, mas há problemas de design que dificultarão a evolução para CRM.', sBody))

story.append(sev('O modelo Cliente possui 31 campos, quase todos strings com default vazio. Isso viola a normalização: dados como endereço deveriam ser uma entidade separada; telefones e emails deveriam ser listas, não campos numerados (telefone1..4, email1..3).', 'warning'))
story.append(sev('O campo "vendedoresQueAbordaram" armazena IDs separados por vírgula em um campo Text. Isso impossibilita queries eficientes e viola a 1a Forma Normal. Deveria ser uma tabela de relacionamento N:N.', 'warning'))
story.append(sev('O campo "source" (xlsx|sheets|manual) é mutuamente exclusivo, mas não há constraint. Um cliente pode ser importado e depois editado manualmente — qual é o source correto? Isso deveria ser um log, não um campo único.', 'info'))
story.append(sev('A coluna "vendedor" (string) e "vendedorId" (FK) são redundantes. O nome do vendedor é duplicado no cliente, criando risco de inconsistência. O nome deveria ser resolvido via JOIN.', 'warning'))
story.append(sev('Não há modelo para Contatos, Interações, Oportunidades ou Propostas — entidades essenciais para evoluir a CRM. Adicionar essas entidades ao schema existente será complexo devido ao acoplamento atual.', 'critical'))

# ═══════════════════════════════════════════════════════════════
# 4. SEGURANÇA
# ═══════════════════════════════════════════════════════════════
story.append(Paragraph('4. Análise de Segurança', sH1))
story.append(Paragraph(
    'O sistema implementa uma base razoável de segurança com autenticação via NextAuth, criptografia '
    'bcrypt para senhas, suporte a 2FA via TOTP e middleware de proteção de rotas. No entanto, existem '
    'lacunas significativas que precisam ser endereçadas antes de qualquer expansão do escopo.', sBody))

story.append(make_table(
    [Paragraph('<b>Aspecto</b>', ParagraphStyle('', parent=sBody, textColor=colors.white, fontName=FONT_BOLD, fontSize=9)),
     Paragraph('<b>Estado</b>', ParagraphStyle('', parent=sBody, textColor=colors.white, fontName=FONT_BOLD, fontSize=9)),
     Paragraph('<b>Risco</b>', ParagraphStyle('', parent=sBody, textColor=colors.white, fontName=FONT_BOLD, fontSize=9)),
     Paragraph('<b>Detalhe</b>', ParagraphStyle('', parent=sBody, textColor=colors.white, fontName=FONT_BOLD, fontSize=9))],
    [
        ['Autenticação', 'Implementado', 'Baixo', 'NextAuth Credentials + JWT; bcrypt com salt 12'],
        ['2FA (TOTP)', 'Implementado', 'Baixo', 'Google Authenticator compatível; setup/verify/disable'],
        ['Autorização (RBAC)', 'Parcial', 'Médio', '4 roles definidas mas verificação inconsistente nas rotas'],
        ['Proteção CSRF', 'Ausente', 'Alto', 'Nenhum token CSRF em formulários; API aceita qualquer origin'],
        ['Rate Limiting', 'Ausente', 'Alto', 'Sem limitação em endpoints de auth, consulta Receita ou export'],
        ['Validação de entrada', 'Ausente', 'Crítico', 'Zod instalado mas NÃO utilizado; body aceito sem validação'],
        ['Sanitização XSS', 'Parcial', 'Médio', 'React protege por padrão, mas observacoes é renderizado em textarea'],
        ['Headers de segurança', 'Ausente', 'Médio', 'Sem CSP, X-Frame-Options, HSTS ou X-Content-Type-Options'],
        ['Audit logging', 'Parcial', 'Médio', 'Log de edições mas rota de audit SEM autenticação'],
        ['Sessão', 'Implementado', 'Baixo', 'JWT com maxAge de 8h; refresh automático via SessionProvider'],
    ],
    col_widths=[CONTENT_W * 0.18, CONTENT_W * 0.14, CONTENT_W * 0.10, CONTENT_W * 0.58]
))
story.append(Spacer(1, 8))

story.append(sev('A ausência de validação de entrada (Zod está instalado mas não é usado) significa que qualquer campo pode receber dados malformados, inclusive injeção de dados em campos que não deveriam ser aceitos no PATCH.', 'critical'))
story.append(sev('Sem rate limiting, um atacante pode realizar brute-force nas senhas ou sobrecarregar o endpoint de consulta à Receita Federal (que já tem rate limit próprio de 3 req/min).', 'critical'))
story.append(sev('O next.config.ts tem ignoreBuildErrors: true, o que permite que erros TypeScript passem despercebidos no build, incluindo erros de tipo que poderiam indicar bugs de segurança.', 'warning'))

# ═══════════════════════════════════════════════════════════════
# 5. ESCALABILIDADE
# ═══════════════════════════════════════════════════════════════
story.append(Paragraph('5. Escalabilidade e Performance', sH1))
story.append(Paragraph(
    'O sistema atual funcionará de forma aceitável com poucas centenas de clientes e poucos usuários '
    'concorrentes. No entanto, o modelo de carregamento completo em memória cria um gargalo que se '
    'agrava linearmente com o volume de dados. A análise abaixo detalha os principais pontos de '
    'atenção e suas implicações práticas.', sBody))

story.append(Paragraph('5.1. Gargalo Principal: Carregamento Full-Table', sH2))
story.append(Paragraph(
    'A função getRecords() em clientes-cache.ts executa db.cliente.findMany() sem nenhum filtro, '
    'carregando todos os registros do banco. Com o schema atual, cada registro Cliente possui 31 '
    'campos de string. Estimando uma média de 200 bytes por registro, uma base de 10.000 clientes '
    'geraria aproximadamente 2 MB de dados transferidos do banco por request. Com 50.000 clientes, '
    'isso sobe para 10 MB — insustentável para uma serverless function com timeout de 10 segundos.', sBody))

story.append(Paragraph(
    'A solução é straightforward: mover filtros, paginação, ordenação e agregações para queries '
    'Prisma com WHERE, ORDER BY, LIMIT/OFFSET e GROUP BY. O PostgreSQL é extremamente eficiente '
    'nessas operações, especialmente com os indexes já definidos no schema. Essa mudança sozinha '
    'reduziria o tempo de resposta de O(n) para O(log n) na maioria das queries.', sBody))

story.append(Paragraph('5.2. Cache In-Memory em Serverless', sH2))
story.append(Paragraph(
    'O cache implementado (TTL de 60s, variável global) é ineficaz no ambiente Vercel serverless. '
    'Cold starts recriam a instância, invalidando o cache. Warm starts podem compartilhar o cache '
    'dentro da mesma função, mas a Vercel não garante persistência de instâncias. A solução ideal '
    'para serverless é cache distribuído (Redis via Upstash ou Vercel KV) ou, preferencialmente, '
    'queries de banco eficientes que tornem o cache desnecessário para a maioria das operações.', sBody))

story.append(Paragraph('5.3. N+1 Queries no Bolsão', sH2))
story.append(Paragraph(
    'A rota POST /api/clientes/bolsao faz um loop sobre todos os clientes elegíveis e executa uma '
    'query UPDATE individual para cada um. Com milhares de clientes, isso gera centenas de round-trips '
    'ao banco. O Prisma suporta updateMany com cláusulas WHERE compostas, que executaria a mesma '
    'operação em uma única query. Da mesma forma, a verificação de "carteira friia" faz um loop '
    'sobre clientes do bolsão com lógica de verificação em JavaScript que deveria ser uma query SQL.', sBody))

# ═══════════════════════════════════════════════════════════════
# 6. ROADMAP PARA CRM
# ═══════════════════════════════════════════════════════════════
story.append(Paragraph('6. Roadmap de Evolução para CRM', sH1))
story.append(Paragraph(
    'A transformação do sistema atual em uma plataforma CRM completa requer mudanças arquiteturais '
    'fundamentais. O roadmap abaixo propõe 4 fases, priorizando primeiramente a estabilização da '
    'base técnica (refatoração e correção de problemas críticos) e depois a adição incremental de '
    'funcionalidades de CRM. Cada fase é projetada para entregar valor independente, sem bloquear '
    'as fases subsequentes.', sBody))

# Phase 1
story.append(Paragraph('Fase 1 — Fundação (2-3 semanas)', sH2))
story.append(Paragraph(
    'Esta fase foca na correção de problemas críticos e na criação de uma base arquitetural sólida. '
    'Sem essa fundação, qualquer funcionalidade nova será construída sobre areia, acumulando dívida '
    'técnica que tornará mudanças futuras cada vez mais caras e arriscadas.', sBody))

story.append(make_table(
    [Paragraph('<b>Tarefa</b>', ParagraphStyle('', parent=sBody, textColor=colors.white, fontName=FONT_BOLD, fontSize=9)),
     Paragraph('<b>Prioridade</b>', ParagraphStyle('', parent=sBody, textColor=colors.white, fontName=FONT_BOLD, fontSize=9)),
     Paragraph('<b>Impacto</b>', ParagraphStyle('', parent=sBody, textColor=colors.white, fontName=FONT_BOLD, fontSize=9))],
    [
        ['Mover filtros/paginação/agregação para queries Prisma', 'Crítica', 'Performance 10x-100x; viabiliza crescimento'],
        ['Adicionar validação Zod em todas as API routes', 'Crítica', 'Elimina risco de injeção e dados corrompidos'],
        ['Autenticar rota /api/clientes/audit', 'Crítica', 'Correção de vulnerabilidade de exposição de dados'],
        ['Adicionar rate limiting (Upstash/Vercel KV)', 'Alta', 'Proteção contra brute-force e abuso de API'],
        ['Adicionar CSRF tokens e headers de segurança', 'Alta', 'Proteção contra ataques cross-site'],
        ['Remover dependências não utilizadas', 'Média', 'Redução do bundle size e superfície de ataque'],
        ['Ativar type checking (remover ignoreBuildErrors)', 'Média', 'Detecção precoce de bugs'],
    ],
    col_widths=[CONTENT_W * 0.50, CONTENT_W * 0.15, CONTENT_W * 0.35]
))
story.append(Spacer(1, 8))

# Phase 2
story.append(Paragraph('Fase 2 — Refatoração Frontend (2-3 semanas)', sH2))
story.append(Paragraph(
    'Com a base de dados e segurança estabilizadas, a segunda fase foca na reorganização do frontend. '
    'O objetivo é transformar o componente monolítico de 1.335 linhas em uma arquitetura modular e '
    'manutenível, preparando o terreno para a adição de funcionalidades de CRM sem que o código se '
    'torne ingovernável.', sBody))

story.append(make_table(
    [Paragraph('<b>Tarefa</b>', ParagraphStyle('', parent=sBody, textColor=colors.white, fontName=FONT_BOLD, fontSize=9)),
     Paragraph('<b>Prioridade</b>', ParagraphStyle('', parent=sBody, textColor=colors.white, fontName=FONT_BOLD, fontSize=9)),
     Paragraph('<b>Impacto</b>', ParagraphStyle('', parent=sBody, textColor=colors.white, fontName=FONT_BOLD, fontSize=9))],
    [
        ['Dividir page.tsx em 8-10 componentes menores', 'Crítica', 'Manutenibilidade;多人开发 sem conflitos'],
        ['Adicionar SWR ou TanStack Query para data fetching', 'Alta', 'Cache, deduplicação, revalidação automática'],
        ['Migrar filtros para URL params server-side', 'Alta', 'URLs compartilháveis; SSR com dados filtrados'],
        ['Adicionar useReducer ou Zustand para estado complexo', 'Média', 'Estado previsível; elimina useEffect cascata'],
        ['Converter componentes de lista para Server Components', 'Média', 'Menos JavaScript no cliente; melhor SEO'],
        ['Criar camada de services (clientes.service.ts, etc.)', 'Média', 'Separação de concerns; reutilização de lógica'],
    ],
    col_widths=[CONTENT_W * 0.50, CONTENT_W * 0.15, CONTENT_W * 0.35]
))
story.append(Spacer(1, 8))

# Phase 3
story.append(Paragraph('Fase 3 — Entidades CRM (3-4 semanas)', sH2))
story.append(Paragraph(
    'Com a arquitetura refatorada, a terceira fase adiciona as entidades centrais de um CRM: contatos, '
    'interações, oportunidades e pipeline de vendas. Essas entidades permitem que os vendedores registrem '
    'atividades, acompanhem negociações e gestores tenham visibilidade do funil de vendas.', sBody))

story.append(Paragraph('<b>Novos modelos Prisma propostos:</b>', sH3))
story.append(Paragraph('Contato — pessoas dentro de um cliente (substitui pessoaContato string)', sBullet))
story.append(Paragraph('Interacao — registro de contato (ligação, email, visita, reunião)', sBullet))
story.append(Paragraph('Oportunidade — negociação em andamento com valor, etapa e probabilidade', sBullet))
story.append(Paragraph('Pipeline — definição de etapas do funil de vendas (configurável)', sBullet))
story.append(Paragraph('Atividade — tarefas/agendamentos vinculados a oportunidades ou clientes', sBullet))
story.append(Paragraph('Nota — observações estruturadas (substitui o campo observacoes string)', sBullet))
story.append(Spacer(1, 6))

story.append(Paragraph(
    'A adição desses modelos exigirá também a normalização do modelo Cliente: os campos telefone1-4 e '
    'email1-3 devem ser migrados para uma tabela de Contato com tipo (telefone_celular, telefone_fixo, '
    'email, etc.), e o campo vendedoresQueAbordaram deve virar uma tabela N:N entre Cliente e User. '
    'Essa migração é delicada e deve ser feita com migrações incrementais do Prisma, mantendo '
    'compatibilidade com a UI existente durante a transição.', sBody))

# Phase 4
story.append(Paragraph('Fase 4 — Features Avançadas (4-6 semanas)', sH2))
story.append(Paragraph(
    'A quarta fase adiciona funcionalidades que diferenciam um CRM básico de uma ferramenta '
    'realmente útil para a equipe comercial. Cada feature pode ser desenvolvida e entregue '
    'independentemente, permitindo que a equipe priorize o que traz mais valor imediato.', sBody))

story.append(make_table(
    [Paragraph('<b>Feature</b>', ParagraphStyle('', parent=sBody, textColor=colors.white, fontName=FONT_BOLD, fontSize=9)),
     Paragraph('<b>Descrição</b>', ParagraphStyle('', parent=sBody, textColor=colors.white, fontName=FONT_BOLD, fontSize=9)),
     Paragraph('<b>Dependência</b>', ParagraphStyle('', parent=sBody, textColor=colors.white, fontName=FONT_BOLD, fontSize=9))],
    [
        ['Pipeline Kanban', 'Visualização drag-and-drop do funil de vendas por etapa', 'Modelo Oportunidade + Pipeline'],
        ['Dashboard de Métricas', 'Conversão por etapa, tempo médio de fechamento, ticket médio', 'Dados de Oportunidade acumulados'],
        ['Automações', 'Regras: "se sem interação há 7 dias, notificar gestor"', 'Modelo Interacao + sistema de eventos'],
        ['Integração Email', 'Sincronizar emails do vendedor com o CRM', 'Modelo Interacao + OAuth Gmail'],
        ['WhatsApp Business API', 'Registro de conversas WhatsApp como interações', 'Modelo Interacao + Meta API'],
        ['Relatórios Avançados', 'Relatórios de performance por vendedor, região, período', 'Dados acumulados de todas as entidades'],
        ['Importação/Exportação', 'Import via CSV/XLSX com mapeamento de colunas', 'Refatoração da importação atual'],
        ['Notificações', 'Push e email para lembretes, atribuições e alertas', 'Sistema de atividades + serviço de email'],
    ],
    col_widths=[CONTENT_W * 0.20, CONTENT_W * 0.48, CONTENT_W * 0.32]
))
story.append(Spacer(1, 8))

# ═══════════════════════════════════════════════════════════════
# 7. ARQUITETURA PROPOSTA
# ═══════════════════════════════════════════════════════════════
story.append(Paragraph('7. Arquitetura Alvo Proposta', sH1))
story.append(Paragraph(
    'A arquitetura proposta mantém o stack atual (Next.js + Prisma + Neon + Vercel) mas reorganiza '
    'as camadas de forma clara e escalável. O princípio central é a separação de responsabilidades: '
    'cada camada tem um propósito bem definido e não vaza abstrações para as camadas adjacentes.', sBody))

story.append(Paragraph('7.1. Estrutura de Diretórios Proposta', sH2))
story.append(Paragraph(
    'A nova estrutura organiza o código em módulos de domínio (feature-based), onde cada funcionalidade '
    'agrupa seus próprios componentes, hooks, serviços e tipos. Isso contrasta com a organização atual '
    'que separa por tipo técnico (components/, lib/, api/) mas mistura domínios dentro de cada pasta.', sBody))

proposed_dirs = [
    'src/',
    '  app/',
    '    (auth)/          # Route group: login, 2FA',
    '    (dashboard)/     # Route group: páginas autenticadas',
    '      clientes/      # Página de listagem de clientes',
    '      pipeline/      # Kanban de oportunidades',
    '      relatorios/    # Dashboard de métricas',
    '    api/',
    '      clientes/      # API routes de clientes',
    '      interacoes/    # API routes de interações',
    '      oportunidades/ # API routes de oportunidades',
    '  modules/',
    '    clientes/',
    '      components/    # ClientList, ClientDetail, ClientForm...',
    '      hooks/         # useClientes, useClienteFilters...',
    '      services/      # clientes.service.ts (lógica de negócio)',
    '      types/         # Tipos específicos do domínio',
    '    pipeline/',
    '      components/    # KanbanBoard, DealCard, StageColumn...',
    '      hooks/         # usePipeline, useDeal...',
    '      services/      # pipeline.service.ts',
    '  lib/',
    '    db/             # Prisma client + helpers',
    '    auth/           # NextAuth config + middleware + guards',
    '    validators/     # Schemas Zod compartilhados',
    '    utils/          # Helpers genéricos',
]

for line in proposed_dirs:
    if line.strip():
        story.append(Paragraph(line, sCode))

story.append(Spacer(1, 8))

story.append(Paragraph('7.2. Padrões Arquiteturais Recomendados', sH2))

story.append(Paragraph('<b>Service Layer Pattern</b>: Toda lógica de negócio (filtros complexos, cálculos de bolsão, '
    'sincronização com sheets) deve ser extraída das API routes para services (ex: ClientesService, '
    'PipelineService). As rotas API ficam responsáveis apenas por: receber request, chamar o service '
    'apropriado e retornar a resposta. Isso permite testar a lógica de negócio isoladamente, reutilizá-la '
    'em diferentes contexts (API, server actions, cron jobs) e manter as rotas enxutas.', sBody))

story.append(Paragraph('<b>Repository Pattern (opcional)</b>: Se a complexidade das queries Prisma crescer, um '
    'repository pode abstrair o acesso a dados, permitindo trocar a implementação (ex: de Prisma para '
    'queries SQL brutas com $queryRaw para agregações complexas) sem alterar a camada de service. '
    'Para o escopo atual, services que usam Prisma diretamente são suficientes.', sBody))

story.append(Paragraph('<b>Server Actions + Server Components</b>: O Next.js 16 suporta Server Actions, que '
    'permitem que o cliente invoque funções server-side diretamente sem criar API routes. Para operações '
    'simples (salvar edição, criar cliente), Server Actions eliminam a necessidade de rotas API '
    'dedicadas. Para operações que precisam de URLs públicas (webhooks, exports), mantêm-se API routes.', sBody))

story.append(Paragraph('<b>Optimistic UI com SWR/TanStack Query</b>: Para operações de escrita (PATCH, POST), '
    'utilizar atualização otimista: atualizar o cache local imediatamente e revalidar em background. '
    'Isso dá a sensação de resposta instantânea ao usuário, essencial em um CRM onde vendedores '
    'precisam registrar interações rapidamente entre ligações.', sBody))

# ═══════════════════════════════════════════════════════════════
# 8. CONCLUSÃO
# ═══════════════════════════════════════════════════════════════
story.append(Paragraph('8. Considerações Finais', sH1))
story.append(Paragraph(
    'O sistema Mtech Cadastro de Clientes demonstra um bom domínio do stack Next.js/Prisma/shadcn e '
    'entrega valor real para a equipe comercial. A interface é profissional, com dark mode, filtros '
    'ricos, edição inline, exportação e integração com Google Sheets. A funcionalidade de carteiras '
    '(Revendas, Corporativo, Bolsão, Fria) é um diferencial importante que reflete o processo '
    'comercial real da distribuidora.', sBody))

story.append(Paragraph(
    'No entanto, a arquitetura atual tem limitações estruturais que precisam ser endereçadas antes '
    'de qualquer expansão significativa. Os três problemas mais urgentes são: (1) o carregamento '
    'full-table em memória que não escala; (2) a ausência de validação de entrada que cria '
    'vulnerabilidades; e (3) o componente monolítico de 1.335 linhas que torna qualquer mudança '
    'arriscada e lenta. Esses problemas não impedem o funcionamento atual, mas se tornarão '
    'bloqueadores à medida que o volume de dados e a complexidade funcional aumentem.', sBody))

story.append(Paragraph(
    'A evolução para CRM é viável com o stack atual, desde que feita de forma incremental. O roadmap '
    'proposto em 4 fases permite que a equipe entregue valor a cada etapa, priorizando primeiro a '
    'estabilização da base técnica e depois a adição de funcionalidades. A chave do sucesso é não '
    'tentar construir o CRM completo de uma vez, mas sim refatorar gradualmente, mantendo o sistema '
    'sempre funcional e em produção.', sBody))

story.append(Spacer(1, 12))
story.append(HRFlowable(width='100%', thickness=1, color=BORDER))
story.append(Spacer(1, 6))
story.append(Paragraph(
    'Este documento foi elaborado com base na análise completa do código-fonte do repositório '
    'Du-Mt-26/cadastro-clientes, incluindo 15 rotas API, 4 modelos Prisma, 12 módulos de biblioteca, '
    'e a configuração de deploy na Vercel.', sCaption))

# ── Build ──
doc.build(story)
print(f'PDF gerado com sucesso: {OUTPUT}')

# Quick size check
import os
size_mb = os.path.getsize(OUTPUT) / (1024 * 1024)
print(f'Tamanho: {size_mb:.2f} MB')
