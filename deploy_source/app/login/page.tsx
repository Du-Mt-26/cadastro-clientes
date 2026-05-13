'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Building2, Eye, EyeOff, Shield, KeyRound, ArrowLeft, Mail, Lock, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [requires2FA, setRequires2FA] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        email: email.toLowerCase().trim(),
        password,
        twoFactorCode: requires2FA ? twoFactorCode : undefined,
        redirect: false,
      })

      if (result?.error) {
        if (result.error === '2FA_REQUIRED') {
          setRequires2FA(true)
          setError('Insira o código do autenticador para continuar.')
          setLoading(false)
          return
        }
        setError(result.error === 'CredentialsSignin' ? 'Email ou senha incorretos' : result.error)
        setLoading(false)
        return
      }

      router.push('/')
      router.refresh()
    } catch {
      setError('Erro ao fazer login. Tente novamente.')
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setForgotLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.toLowerCase().trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Erro ao solicitar reset')
        setForgotLoading(false)
        return
      }

      setForgotSent(true)
    } catch {
      setError('Erro ao solicitar reset de senha')
    } finally {
      setForgotLoading(false)
    }
  }

  // ── FORGOT PASSWORD VIEW ──
  if (showForgot) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-950 dark:to-slate-900 p-4">
        <div className="w-full max-w-md">
          {/* Branding */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-lg mb-4">
              <Building2 className="size-8" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">M-Tech Distribuidora</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Cadastro de Clientes</p>
          </div>

          {/* Card */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center gap-2 mb-6">
              <KeyRound className="size-5 text-teal-600 dark:text-teal-400" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Recuperar Senha</h2>
            </div>

            {forgotSent ? (
              <div className="text-center">
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-sm mb-4">
                  Solicitação registrada! Contate o administrador do sistema para receber sua nova senha.
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  Administradores: Renato ou Artur
                </p>
                <button
                  onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail('') }}
                  className="text-sm text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 font-medium flex items-center gap-1 mx-auto"
                >
                  <ArrowLeft className="size-4" /> Voltar ao login
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
                {error && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
                    {error}
                  </div>
                )}
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Informe seu email cadastrado. O administrador será notificado para redefinir sua senha.
                </p>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Email</label>
                  <input
                    type="email"
                    placeholder="seu@email.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                    autoFocus
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {forgotLoading ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                  {forgotLoading ? 'Enviando...' : 'Solicitar Nova Senha'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForgot(false); setError(''); setForgotEmail('') }}
                  className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1"
                >
                  <ArrowLeft className="size-3" /> Voltar ao login
                </button>
              </form>
            )}
          </div>

          <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-6">
            M-Tech Distribuidora de Informática Ltda
          </p>
        </div>
      </div>
    )
  }

  // ── LOGIN VIEW ──
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-950 dark:to-slate-900 p-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-lg mb-4">
            <Building2 className="size-8" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">M-Tech Distribuidora de Informática Ltda</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Cadastro de Clientes</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center gap-2 mb-6">
            {requires2FA ? (
              <>
                <Shield className="size-5 text-teal-600 dark:text-teal-400" />
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Autenticação em Dois Fatores</h2>
              </>
            ) : (
              <>
                <Lock className="size-5 text-teal-600 dark:text-teal-400" />
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Acesso ao Sistema</h2>
              </>
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <div className={`p-3 rounded-lg text-sm border ${
                error.includes('código')
                  ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                  : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
              }`}>
                {error}
              </div>
            )}

            {!requires2FA ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 dark:text-slate-500" />
                    <input
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                      className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Senha</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 dark:text-slate-500" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => { setShowForgot(true); setError('') }}
                    className="text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 font-medium"
                  >
                    Esqueci minha senha
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Código do Autenticador</label>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Abra o app Google Authenticator e insira o código de 6 dígitos.</p>
                  <input
                    type="text"
                    placeholder="000000"
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    autoFocus
                    className="w-full px-3 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-2xl text-center tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => { setRequires2FA(false); setTwoFactorCode(''); setError('') }}
                  className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1"
                >
                  <ArrowLeft className="size-3" /> Voltar ao login
                </button>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : requires2FA ? (
                <Shield className="size-4" />
              ) : (
                <Lock className="size-4" />
              )}
              {loading ? 'Entrando...' : requires2FA ? 'Verificar e Entrar' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-6">
          M-Tech Distribuidora de Informática Ltda
        </p>
      </div>
    </div>
  )
}
