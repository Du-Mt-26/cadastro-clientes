'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/hooks/use-toast'
import {
  ShieldCheck,
  ShieldX,
  Loader2,
  Copy,
  Check,
  QrCode,
} from 'lucide-react'

interface TwoFactorSetupModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type SetupStep = 'idle' | 'setup' | 'verify' | 'disable'

export function TwoFactorSetupModal({ open, onOpenChange }: TwoFactorSetupModalProps) {
  const { data: session, update: updateSession } = useSession()

  const user = session?.user as typeof session.user & {
    id: string
    role: string
    twoFactorEnabled: boolean
  }

  const twoFactorEnabled = user?.twoFactorEnabled ?? false

  const [step, setStep] = useState<SetupStep>('idle')
  const [loading, setLoading] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [copied, setCopied] = useState(false)

  const resetState = () => {
    setStep('idle')
    setQrCode(null)
    setSecret(null)
    setVerifyCode('')
    setDisableCode('')
    setCopied(false)
    setLoading(false)
  }

  const handleClose = (open: boolean) => {
    if (!open) {
      resetState()
    }
    onOpenChange(open)
  }

  // ─── Step 1: Setup ───────────────────────────────
  const handleSetup = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/2fa/setup', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao configurar 2FA')

      setQrCode(data.qrCode)
      setSecret(data.secret)
      setStep('setup')
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  // ─── Step 2: Verify & enable ─────────────────────
  const handleVerify = async () => {
    if (!verifyCode) {
      toast({ title: 'Erro', description: 'Insira o código de verificação', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verifyCode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Código inválido')

      toast({ title: 'Sucesso', description: '2FA ativado com sucesso!' })
      await updateSession()
      resetState()
      handleClose(false)
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  // ─── Disable 2FA ─────────────────────────────────
  const handleDisable = async () => {
    if (!disableCode) {
      toast({ title: 'Erro', description: 'Insira o código 2FA atual para desativar', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: disableCode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao desativar 2FA')

      toast({ title: 'Sucesso', description: '2FA desativado' })
      await updateSession()
      resetState()
      handleClose(false)
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  // ─── Copy secret to clipboard ────────────────────
  const handleCopySecret = async () => {
    if (!secret) return
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
      toast({ title: 'Copiado', description: 'Chave secreta copiada' })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível copiar', variant: 'destructive' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" />
            Autenticação de Dois Fatores
          </DialogTitle>
          <DialogDescription>
            {twoFactorEnabled
              ? '2FA está ativado na sua conta. Você pode desativar informando o código atual.'
              : 'Adicione uma camada extra de segurança à sua conta.'}
          </DialogDescription>
        </DialogHeader>

        {/* ─── Idle: Choose action ──────────────── */}
        {step === 'idle' && (
          <div className="space-y-4">
            {twoFactorEnabled ? (
              <>
                <div className="flex items-center gap-3 rounded-lg border bg-green-50 dark:bg-green-950/30 p-4">
                  <ShieldCheck className="size-8 text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-800 dark:text-green-300">
                      2FA ativado
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-400">
                      Sua conta está protegida com autenticação de dois fatores.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setStep('disable')}
                >
                  <ShieldX className="size-4 mr-2" />
                  Desativar 2FA
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 rounded-lg border bg-amber-50 dark:bg-amber-950/30 p-4">
                  <ShieldX className="size-8 text-amber-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      2FA desativado
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Recomendamos ativar para maior segurança.
                    </p>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={handleSetup}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="size-4 mr-2 animate-spin" />
                  ) : (
                    <QrCode className="size-4 mr-2" />
                  )}
                  Configurar 2FA
                </Button>
              </>
            )}
          </div>
        )}

        {/* ─── Setup: Show QR code ──────────────── */}
        {step === 'setup' && qrCode && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-4">
              <p className="text-sm text-center text-muted-foreground">
                Escaneie o QR code abaixo com seu aplicativo autenticador
                (Google Authenticator, Authy, etc.)
              </p>

              <div className="rounded-lg border bg-white p-3">
                <img
                  src={qrCode}
                  alt="QR Code para configuração 2FA"
                  className="size-48"
                />
              </div>

              {secret && (
                <div className="w-full space-y-2">
                  <p className="text-xs text-muted-foreground text-center">
                    Ou digite manualmente a chave secreta:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-muted px-3 py-2 text-xs font-mono break-all select-all">
                      {secret}
                    </code>
                    <Button
                      size="icon"
                      variant="outline"
                      className="shrink-0 size-8"
                      onClick={handleCopySecret}
                    >
                      {copied ? (
                        <Check className="size-3.5 text-green-600" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">
                Digite o código de verificação:
              </p>
              <Input
                placeholder="000000"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleVerify()
                }}
                className="text-center text-lg tracking-[0.5em] font-mono"
                maxLength={6}
                autoComplete="one-time-code"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={resetState}
                  disabled={loading}
                >
                  Voltar
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleVerify}
                  disabled={loading || verifyCode.length !== 6}
                >
                  {loading ? (
                    <Loader2 className="size-4 mr-2 animate-spin" />
                  ) : (
                    <ShieldCheck className="size-4 mr-2" />
                  )}
                  Verificar
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Disable: Confirm with code ────────── */}
        {step === 'disable' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border bg-red-50 dark:bg-red-950/30 p-4">
              <ShieldX className="size-6 text-red-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-300">
                  Desativar 2FA
                </p>
                <p className="text-xs text-red-700 dark:text-red-400">
                  Isso reduzirá a segurança da sua conta. Insira o código atual para confirmar.
                </p>
              </div>
            </div>

            <Input
              placeholder="000000"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleDisable()
              }}
              className="text-center text-lg tracking-[0.5em] font-mono"
              maxLength={6}
              autoComplete="one-time-code"
            />

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={resetState}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleDisable}
                disabled={loading || disableCode.length !== 6}
              >
                {loading ? (
                  <Loader2 className="size-4 mr-2 animate-spin" />
                ) : (
                  <ShieldX className="size-4 mr-2" />
                )}
                Desativar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
