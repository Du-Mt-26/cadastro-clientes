'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

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

  const inputStyle = {
    width: '100%',
    padding: '0.625rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    fontSize: '0.875rem',
    outline: 'none',
  }

  const primaryBtnStyle = (disabled: boolean) => ({
    width: '100%' as const,
    padding: '0.625rem',
    borderRadius: '8px',
    border: 'none',
    background: disabled ? '#99f6e4' : '#0d9488',
    color: '#fff',
    fontWeight: '600' as const,
    fontSize: '0.875rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
  })

  // ── FORGOT PASSWORD VIEW ──
  if (showForgot) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)', padding: '1rem' }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '16px', background: 'linear-gradient(135deg, #14b8a6, #0d9488)', color: '#fff', fontSize: '28px', marginBottom: '1rem' }}>M</div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#0f172a' }}>Mtech Geral</h1>
            <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.25rem' }}>Cadastro de Clientes</p>
          </div>

          <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '1.5rem' }}>
            <h2 style={{ textAlign: 'center', fontSize: '1.125rem', fontWeight: '600', marginBottom: '1.5rem' }}>🔑 Recuperar Senha</h2>

            {forgotSent ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ padding: '1rem', borderRadius: '8px', background: '#f0fdf4', color: '#166534', fontSize: '0.875rem', marginBottom: '1rem' }}>
                  ✅ Solicitação registrada! Contate o administrador do sistema para receber sua nova senha.
                </div>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '1rem' }}>
                  Administradores: Renato ou Artur
                </p>
                <button
                  onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail('') }}
                  style={{ background: 'none', border: 'none', color: '#0d9488', fontSize: '0.875rem', cursor: 'pointer', fontWeight: '500' }}
                >
                  ← Voltar ao login
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {error && (
                  <div style={{ padding: '0.75rem', borderRadius: '8px', fontSize: '0.875rem', background: '#fef2f2', color: '#991b1b' }}>
                    ⚠️ {error}
                  </div>
                )}
                <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  Informe seu email cadastrado. O administrador será notificado para redefinir sua senha.
                </p>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.375rem' }}>Email</label>
                  <input
                    type="email"
                    placeholder="seu@email.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                    autoFocus
                    style={inputStyle}
                  />
                </div>
                <button type="submit" disabled={forgotLoading} style={primaryBtnStyle(forgotLoading)}>
                  {forgotLoading ? '⏳ Enviando...' : '📧 Solicitar Nova Senha'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForgot(false); setError(''); setForgotEmail('') }}
                  style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '0.75rem', cursor: 'pointer', textAlign: 'left' }}
                >
                  ← Voltar ao login
                </button>
              </form>
            )}
          </div>

          <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8', marginTop: '1.5rem' }}>
            Mtech Geral — Sistema de Cadastro de Clientes
          </p>
        </div>
      </div>
    )
  }

  // ── LOGIN VIEW ──
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '16px', background: 'linear-gradient(135deg, #14b8a6, #0d9488)', color: '#fff', fontSize: '28px', marginBottom: '1rem' }}>M</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#0f172a' }}>Mtech Geral</h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.25rem' }}>Cadastro de Clientes</p>
        </div>

        <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '1.5rem' }}>
          <h2 style={{ textAlign: 'center', fontSize: '1.125rem', fontWeight: '600', marginBottom: '1.5rem' }}>
            {requires2FA ? '🔐 Autenticação em Dois Fatores' : '🔒 Entrar no Sistema'}
          </h2>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {error && (
              <div style={{ padding: '0.75rem', borderRadius: '8px', fontSize: '0.875rem', background: error.includes('código') ? '#fef3c7' : '#fef2f2', color: error.includes('código') ? '#92400e' : '#991b1b' }}>
                ⚠️ {error}
              </div>
            )}

            {!requires2FA ? (
              <>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.375rem' }}>Email</label>
                  <input
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.375rem' }}>Senha</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      style={inputStyle}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.75rem' }}
                    >
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => { setShowForgot(true); setError('') }}
                    style={{ background: 'none', border: 'none', color: '#0d9488', fontSize: '0.8rem', cursor: 'pointer', fontWeight: '500' }}
                  >
                    Esqueci minha senha
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.375rem' }}>Código do Autenticador</label>
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>Abra o app Google Authenticator e insira o código de 6 dígitos.</p>
                  <input
                    type="text"
                    placeholder="000000"
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    autoFocus
                    style={{ width: '100%', padding: '0.625rem 0.75rem', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '1.5rem', textAlign: 'center', letterSpacing: '0.5em', fontFamily: 'monospace', outline: 'none' }}
                  />
                </div>
                <button type="button" onClick={() => { setRequires2FA(false); setTwoFactorCode(''); setError('') }} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '0.75rem', cursor: 'pointer', textAlign: 'left' }}>
                  ← Voltar ao login
                </button>
              </>
            )}

            <button type="submit" disabled={loading} style={primaryBtnStyle(loading)}>
              {loading ? '⏳ Entrando...' : requires2FA ? '🔐 Verificar e Entrar' : '🔒 Entrar'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8', marginTop: '1.5rem' }}>
          Mtech Geral — Sistema de Cadastro de Clientes
        </p>
      </div>
    </div>
  )
}
