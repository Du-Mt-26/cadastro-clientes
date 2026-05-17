import { Suspense } from 'react'
import VendasDashboard from '@/components/vendas/vendas-dashboard'

export default function VendasPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
          <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
            <div className="size-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-lg">Carregando dashboard...</span>
          </div>
        </div>
      }
    >
      <VendasDashboard />
    </Suspense>
  )
}
