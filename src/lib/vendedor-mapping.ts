/**
 * Mapeamento de vendedores do Linvix para usuários do sistema
 *
 * O Linvix envia VENDEDOR_NOME como texto, mas o sistema
 * precisa de vendedorId (link para a tabela User).
 *
 * Regras de mapeamento:
 * - Vendedores que existem no sistema → mapeiam para o ID do usuário correspondente
 * - M-TECH DISTRIBUIDORA → DEBORA (empresa, não é vendedor)
 * - RAFAEL DE SOUZA → DEBORA (não existe no sistema)
 * - WILLIAN LUIZ PEREIRA → DEBORA (não existe no sistema)
 * - (vazio) → DEBORA — clientes sem vendedor no Linvix vão para Débora
 * - Vendedores não mapeados → DEBORA — fallback para Débora
 */

// Mapeamento fixo de nomes do Linvix → ID do usuário no sistema
const VENDEDOR_NAME_TO_ID: Record<string, string> = {
  'DEBORA PHILIPI MATOS': 'cmoxe1srn0004wxwfyzyde247',
  'MARIANE GARCIA DA LUZ': 'cmoxqd4v60003wxvn2j72tuww',
  'ALICE': 'cmoxqd1i20000wxvnwo8sfxp1',           // ALICE - Supervisora
  'KAROLINE MARTTA MEIRELES': 'cmoys80970087jo04gzlo7xv3',
  'PRISCILA NEUSA FERREIRA': 'cmoxe1rbc0002wxwfji4gbc56',
  'MALU FERREIRA JARDIM': 'cmoxqd3bk0001wxvnm8u5logs',
  'MARIA EDUARDA': 'cmoxqd44i0002wxvnzgqx3s7e',
  // Vendedores que NÃO existem no sistema → atribuir à DEBORA
  'M-TECH DISTRIBUIDORA': 'cmoxe1srn0004wxwfyzyde247',  // Empresa → DEBORA
  'RAFAEL DE SOUZA': 'cmoxe1srn0004wxwfyzyde247',        // Não existe → DEBORA
  'WILLIAN LUIZ PEREIRA': 'cmoxe1srn0004wxwfyzyde247',   // Não existe → DEBORA
}

interface SystemUser {
  id: string
  name: string
  role: string
}

/**
 * Mapeia o nome do vendedor do Linvix para o ID do usuário no sistema.
 *
 * @param linvixVendedorNome - Nome do vendedor enviado pelo Linvix
 * @param systemUsers - Lista de usuários do sistema (opcional, para match dinâmico)
 * @returns Objeto com userId (ID do vendedor no sistema ou null) e carteira
 */
export function mapVendedorToUser(
  linvixVendedorNome: string | null | undefined,
  systemUsers?: SystemUser[]
): { userId: string | null; carteira: string } {
  const DEBORA_ID = 'cmoxe1srn0004wxwfyzyde247'

  // Se não tem nome de vendedor, vai para Débora
  if (!linvixVendedorNome || linvixVendedorNome.trim() === '') {
    return { userId: DEBORA_ID, carteira: 'COM_VENDEDOR' }
  }

  const nomeUpper = linvixVendedorNome.trim().toUpperCase()

  // 1. Tentar match exato no mapa fixo
  if (VENDEDOR_NAME_TO_ID[nomeUpper]) {
    return { userId: VENDEDOR_NAME_TO_ID[nomeUpper], carteira: 'COM_VENDEDOR' }
  }

  // 2. Tentar match parcial no mapa fixo (ex: "ALICE" contido em outro nome)
  for (const [key, id] of Object.entries(VENDEDOR_NAME_TO_ID)) {
    if (nomeUpper.includes(key) || key.includes(nomeUpper)) {
      return { userId: id, carteira: 'COM_VENDEDOR' }
    }
  }

  // 3. Se systemUsers foi fornecido, tentar match dinâmico
  if (systemUsers && systemUsers.length > 0) {
    // Match exato
    const exactMatch = systemUsers.find(u => u.name?.toUpperCase() === nomeUpper)
    if (exactMatch) {
      return { userId: exactMatch.id, carteira: 'COM_VENDEDOR' }
    }

    // Match parcial (nome do Linvix contido no nome do sistema ou vice-versa)
    const partialMatch = systemUsers.find(u => {
      const systemName = u.name?.toUpperCase() || ''
      return systemName.includes(nomeUpper) || nomeUpper.includes(systemName)
    })
    if (partialMatch) {
      return { userId: partialMatch.id, carteira: 'COM_VENDEDOR' }
    }
  }

  // 4. Vendedor não mapeado → vai para Débora (fallback)
  console.warn(`[VendedorMapping] Vendedor não mapeado: "${linvixVendedorNome}" → atribuindo à DEBORA`)
  return { userId: DEBORA_ID, carteira: 'COM_VENDEDOR' }
}

/**
 * Retorna o mapa completo de vendedores para uso em diagnóstico
 */
export function getVendedorMap() {
  return { ...VENDEDOR_NAME_TO_ID }
}

/**
 * Retorna os nomes de vendedores que devem ser atribuídos à DEBORA
 * (útil para o backfill saber quais clientes atualizar)
 */
export function getDeboraVendedorNames(): string[] {
  return ['M-TECH DISTRIBUIDORA', 'RAFAEL DE SOUZA', 'WILLIAN LUIZ PEREIRA']
}

/**
 * Retorna o ID da DEBORA
 */
export function getDeboraId(): string {
  return 'cmoxe1srn0004wxwfyzyde247'
}
