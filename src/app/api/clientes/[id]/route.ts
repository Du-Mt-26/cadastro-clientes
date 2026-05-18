import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { mapVendedorToUser } from '@/lib/vendedor-mapping'

/**
 * Client detail/update endpoint
 * 
 * GET /api/clientes/[id] - Get client details
 * PATCH /api/clientes/[id] - Update client
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    const cliente = await db.cliente.findUnique({
      where: { id },
      include: {
        vendedorUser: {
          select: { id: true, name: true, email: true, role: true }
        }
      }
    })

    if (!cliente) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
    }

    return NextResponse.json(cliente)
  } catch (error) {
    console.error('[Clientes] Erro ao buscar cliente:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Auto-update cnpjBase when CNPJ is edited
    if (body.cnpj) {
      const cnpjClean = body.cnpj.replace(/\D/g, '')
      if (cnpjClean.length >= 8) {
        body.cnpjBase = cnpjClean.substring(0, 8)
      }
    }

    // Handle vendedorId update with carteira
    if (body.vendedorId && !body.carteira) {
      body.carteira = 'COM_VENDEDOR'
    }

    const cliente = await db.cliente.update({
      where: { id },
      data: body,
      include: {
        vendedorUser: {
          select: { id: true, name: true, email: true, role: true }
        }
      }
    })

    return NextResponse.json(cliente)
  } catch (error) {
    console.error('[Clientes] Erro ao atualizar cliente:', error)
    return NextResponse.json({ error: 'Erro ao atualizar cliente' }, { status: 500 })
  }
}
