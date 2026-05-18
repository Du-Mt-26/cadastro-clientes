/**
 * Mapeamento de vendedores do Linvix para usuários do sistema
 *
 * O Linvix envia VENDEDOR_NOME como texto, mas o sistema
 * precisa de vendedorId (link para a tabela User).
 *
 * Regras de mapeamento:
 * - Vendedores que existem no sistema → mapeiam para o ID do usuário correspondente
 * - M-TECH DISTRIBUIDORA → FORNECEDOR (empresa, não é vendedor)
 * - RAFAEL DE SOUZA → DEBORA (não existe no sistema como vendedor)
 * - WILLIAN LUIZ PEREIRA → DEBORA (não existe no sistema como vendedor)
 * - (vazio) → SEM_VENDEDOR — clientes sem vendedor no Linvix ficam sem vendedor
 * - Vendedores não mapeados → SEM_VENDEDOR — ficam sem vendedor até serem mapeados
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
  'RAFAEL DE SOUZA': 'cmoxe1srn0004wxwfyzyde247',        // Não existe → DEBORA
  'WILLIAN LUIZ PEREIRA': 'cmoxe1srn0004wxwfyzyde247',   // Não existe → DEBORA
  // M-TECH DISTRIBUIDORA → tratamento especial (FORNECEDOR, não vendedor)
  'M-TECH DISTRIBUIDORA': 'MTECH_FORNECEDOR',
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

  // Se não tem nome de vendedor, fica SEM vendedor
  if (!linvixVendedorNome || linvixVendedorNome.trim() === '') {
    return { userId: null, carteira: 'SEM_VENDEDOR' }
  }

  const nomeUpper = linvixVendedorNome.trim().toUpperCase()

  // 1. Tentar match exato no mapa fixo
  if (VENDEDOR_NAME_TO_ID[nomeUpper]) {
    const mappedId = VENDEDOR_NAME_TO_ID[nomeUpper]
    // M-TECH DISTRIBUIDORA é tratado como fornecedor
    if (mappedId === 'MTECH_FORNECEDOR') {
      return { userId: DEBORA_ID, carteira: 'FORNECEDOR' }
    }
    return { userId: mappedId, carteira: 'COM_VENDEDOR' }
  }

  // 2. Tentar match parcial no mapa fixo (ex: "ALICE" contido em outro nome)
  for (const [key, id] of Object.entries(VENDEDOR_NAME_TO_ID)) {
    if (nomeUpper.includes(key) || key.includes(nomeUpper)) {
      if (id === 'MTECH_FORNECEDOR') {
        return { userId: DEBORA_ID, carteira: 'FORNECEDOR' }
      }
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

  // 4. Vendedor não mapeado → fica SEM_VENDEDOR
  console.warn(`[VendedorMapping] Vendedor não mapeado: "${linvixVendedorNome}" → ficando SEM_VENDEDOR`)
  return { userId: null, carteira: 'SEM_VENDEDOR' }
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
  return ['RAFAEL DE SOUZA', 'WILLIAN LUIZ PEREIRA']
}

/**
 * Retorna o ID da DEBORA
 */
export function getDeboraId(): string {
  return 'cmoxe1srn0004wxwfyzyde247'
}
