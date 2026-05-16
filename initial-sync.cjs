const { PrismaClient } = require('@prisma/client');

const db = new PrismaClient();
const LINVIX_BASE = 'https://rp.erp.linvix.com';
const LINVIX_USER = 'Alice';
const LINVIX_PASSWORD = 'Linvix2026*';
const PAGE_SIZE = 350;
const PAGE_DELAY_MS = 2000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function normalizeCnpj(raw) { return raw ? raw.replace(/\D/g, '') : ''; }
function cleanPhone(raw) { return raw ? raw.trim() : ''; }
function cleanEmail(raw) { return raw ? raw.trim().toLowerCase() : ''; }
function stripHtml(html) { return html ? html.replace(/<[^>]*>/g, '').trim() : ''; }

function buildParams(draw, start) {
  const p = new URLSearchParams();
  p.set('draw', String(draw));
  p.set('start', String(start));
  p.set('length', String(PAGE_SIZE));
  p.set('search[value]', '');
  p.set('search[regex]', 'false');
  p.set('columns[0][data]', 'CODIGO');
  p.set('columns[0][name]', 'CODIGO');
  p.set('columns[0][searchable]', 'false');
  p.set('columns[0][orderable]', 'false');
  p.set('columns[0][search][value]', '');
  p.set('columns[0][search][regex]', 'false');
  p.set('columns[1][data]', 'CODIGO');
  p.set('columns[1][name]', 'CODIGO1');
  p.set('columns[1][searchable]', 'true');
  p.set('columns[1][orderable]', 'true');
  p.set('columns[1][search][value]', '');
  p.set('columns[1][search][regex]', 'false');
  p.set('columns[2][data]', 'NOME');
  p.set('columns[2][name]', 'NOME');
  p.set('columns[2][searchable]', 'true');
  p.set('columns[2][orderable]', 'true');
  p.set('columns[2][search][value]', '');
  p.set('columns[2][search][regex]', 'false');
  p.set('order[0][column]', '2');
  p.set('order[0][dir]', 'asc');
  p.set('filtros_listagem_situacao_todos', 'false');
  p.set('filtros_listagem_listar_somente_ativos', 'true');
  p.set('filtros_listagem_listar_somente_inativos', 'false');
  return p.toString();
}

async function main() {
  console.log('1. Logging in to Linvix...');
  const loginBody = new URLSearchParams();
  loginBody.set('login', LINVIX_USER);
  loginBody.set('senha', LINVIX_PASSWORD);
  loginBody.set('redirect_url', '');
  
  const loginResp = await fetch(LINVIX_BASE + '/ajax/ajax-login.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    body: loginBody.toString(),
    redirect: 'manual',
  });
  
  const cookies = loginResp.headers.getSetCookie?.() || [];
  let phpsessid = '';
  for (const c of cookies) {
    const m = c.match(/PHPSESSID=([^;]+)/);
    if (m) { phpsessid = m[1]; break; }
  }
  if (!phpsessid) throw new Error('Login failed - no PHPSESSID');
  console.log('Login OK');
  
  console.log('2. Fetching clients from Linvix...');
  const allClients = [];
  let draw = 1, start = 0, totalRecords = 0;
  
  const firstPage = await fetch(LINVIX_BASE + '/cadastros/clientes/ajax/ajax-clientes-datatable.php?' + buildParams(draw, start), {
    headers: {
      'Cookie': 'PHPSESSID=' + phpsessid,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
  const firstData = await firstPage.json();
  totalRecords = firstData.recordsTotal;
  allClients.push(...firstData.data);
  console.log('Page 1: ' + firstData.data.length + ' (total: ' + totalRecords + ')');
  
  draw++; start += PAGE_SIZE;
  while (start < totalRecords) {
    await sleep(PAGE_DELAY_MS);
    const resp = await fetch(LINVIX_BASE + '/cadastros/clientes/ajax/ajax-clientes-datatable.php?' + buildParams(draw, start), {
      headers: {
        'Cookie': 'PHPSESSID=' + phpsessid,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    const pageData = await resp.json();
    allClients.push(...pageData.data);
    console.log('Page ' + draw + ': ' + pageData.data.length + ' (acc: ' + allClients.length + '/' + totalRecords + ')');
    draw++; start += PAGE_SIZE;
  }
  
  console.log('Total fetched: ' + allClients.length);
  
  console.log('3. Upserting into M-Tech...');
  let created = 0, updated = 0, skipped = 0, errors = 0;
  
  for (let i = 0; i < allClients.length; i += 50) {
    const batch = allClients.slice(i, i + 50);
    const results = await Promise.allSettled(batch.map(async (row) => {
      if (!row.CODIGO) return 'skipped';
      
      const cnpj = normalizeCnpj(row.CNPJ_CNPF);
      const email = cleanEmail(row.EMAIL);
      const emails = email ? email.split(',').flatMap(e => e.split(';').map(e2 => e2.trim())).filter(Boolean) : [];
      
      const data = {
        razaoSocial: (row.NOME || '').trim(),
        nomeFantasia: (row.FANTASIA || '').trim(),
        cnpj,
        ieRg: stripHtml(row.IE_RG),
        telefone1: cleanPhone(row.TELEFONE),
        telefone2: cleanPhone(row.CELULAR),
        telefone3: cleanPhone(row.FAX),
        email1: emails[0] || '',
        bairro: (row.BAIRRO || '').trim(),
        cidade: (row.CIDADE || '').trim(),
        uf: (row.UF || '').trim(),
        vendedor: (row.VENDEDOR_NOME || '').trim(),
        observacoes: (row.OBSERVACOES || '').trim(),
      };
      
      const existing = await db.cliente.findUnique({ where: { codigo: row.CODIGO } });
      
      if (existing) {
        const updateData = { source: 'linvix' };
        let hasChanges = false;
        for (const [key, newVal] of Object.entries(data)) {
          if (newVal && String(newVal) !== String(existing[key] ?? '')) {
            updateData[key] = newVal;
            hasChanges = true;
          }
        }
        if (hasChanges) {
          await db.cliente.update({ where: { codigo: row.CODIGO }, data: updateData });
          return 'updated';
        }
        return 'skipped';
      } else {
        await db.cliente.create({
          data: {
            codigo: row.CODIGO,
            ...data,
            email2: '', email3: '', pessoaContato: '', endereco: '', numero: '',
            complemento: '', cep: '', situacaoCadastral: '', dataSituacao: '',
            dataAbertura: '', cnaePrincipal: '', naturezaJuridica: '', porte: '',
            regSimples: '', telefone4: '',
            source: 'linvix', tipo: 'REVENDA', carteira: 'SEM_VENDEDOR',
          },
        });
        return 'created';
      }
    }));
    
    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value === 'created') created++;
        else if (r.value === 'updated') updated++;
        else skipped++;
      } else {
        errors++;
        if (errors <= 3) console.error('Error:', r.reason?.message?.substring(0, 200));
      }
    }
    
    if ((i + 50) % 500 === 0 || i + 50 >= allClients.length) {
      console.log('Progress: ' + Math.min(i + 50, allClients.length) + '/' + allClients.length + ' (c:' + created + ' u:' + updated + ' s:' + skipped + ' e:' + errors + ')');
    }
  }
  
  console.log('\nDONE! Created: ' + created + ', Updated: ' + updated + ', Skipped: ' + skipped + ', Errors: ' + errors);
  
  // Log the sync
  await db.linvixSyncLog.create({
    data: {
      status: errors > 0 ? 'partial' : 'success',
      totalClients: allClients.length,
      createdCount: created,
      updatedCount: updated,
      skippedCount: skipped,
      errorCount: errors,
      pagesScraped: draw - 1,
      durationMs: 0,
    },
  });
  
  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
