import type { EncryptedDelivery } from './settings'

export interface VaultCredential {
  label: string
  value: string
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function vaultKey(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) {
    throw new Error('VAULT_ENCRYPTION_KEY must contain at least 32 characters.')
  }
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(secret),
  )
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

export async function encryptDelivery(
  secret: string | undefined,
  value: unknown,
): Promise<EncryptedDelivery> {
  if (!secret) throw new Error('VAULT_ENCRYPTION_KEY is not configured.')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await vaultKey(secret),
    new TextEncoder().encode(JSON.stringify(value)),
  )
  return {
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(new Uint8Array(encrypted)),
  }
}

export async function decryptDelivery(
  secret: string | undefined,
  value: EncryptedDelivery,
): Promise<unknown> {
  if (!secret) throw new Error('VAULT_ENCRYPTION_KEY is not configured.')
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(value.iv) },
    await vaultKey(secret),
    fromBase64Url(value.ciphertext),
  )
  return JSON.parse(new TextDecoder().decode(decrypted)) as unknown
}

const credentialLabels: Record<string, string> = {
  username: 'نام کاربری',
  user: 'نام کاربری',
  email: 'ایمیل',
  password: 'رمز عبور',
  pass: 'رمز عبور',
  login: 'ورود',
  account: 'اکانت',
  url: 'لینک ورود',
  link: 'لینک ورود',
  two_fa: 'کد دومرحله‌ای',
  '2fa': 'کد دومرحله‌ای',
  two_fa_secret: 'کلید ورود دومرحله‌ای',
  recovery_code: 'کد بازیابی',
  totp: 'کد یک‌بارمصرف',
  secret: 'کلید امنیتی',
  token: 'توکن',
  instructions: 'راهنما',
}

export function extractVaultCredentials(value: unknown): VaultCredential[] {
  const fields: VaultCredential[] = []
  const add = (label: string, fieldValue: unknown) => {
    if (
      fieldValue === null ||
      fieldValue === undefined ||
      typeof fieldValue === 'object'
    ) {
      return
    }
    const text = String(fieldValue).trim()
    if (text) fields.push({ label, value: text })
  }
  const visit = (item: unknown, key?: string) => {
    if (typeof item === 'string') {
      if (!key) {
        const lines = item.split(/\r?\n/)
        for (const line of lines) {
          const match = line.match(/^\s*([\w -]{2,40})\s*:\s*(.*)$/)
          if (match) {
            const normalized = match[1].toLowerCase().replace(/[\s-]+/g, '_')
            add(credentialLabels[normalized] ?? 'اطلاعات تحویل', match[2])
          } else {
            add('اطلاعات تحویل', line)
          }
        }
        return
      }
      const normalized = key.toLowerCase().replace(/[\s-]+/g, '_')
      add(credentialLabels[normalized] ?? 'اطلاعات تحویل', item)
      return
    }
    if (!item || typeof item !== 'object') {
      if (key) {
        const normalized = key.toLowerCase().replace(/[\s-]+/g, '_')
        add(credentialLabels[normalized] ?? 'اطلاعات تحویل', item)
      }
      return
    }
    if (Array.isArray(item)) {
      item.forEach((entry) => visit(entry, key))
      return
    }
    for (const [childKey, childValue] of Object.entries(
      item as Record<string, unknown>,
    )) {
      visit(childValue, childKey)
    }
  }
  visit(value)
  return fields
}
