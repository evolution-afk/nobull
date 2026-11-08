/**
 * Internal client for the legacy daloRADIUS VPS API (var-api).
 * Handles provisioning, usage lookups and OpenVPN config generation.
 */

export interface VpnClientEnvironment {
  VAR_API_URL?: string
  VAR_API_TOKEN?: string
}

export type VpnProtocol = 'tcp' | 'udp'

export interface VpnProvisionRequest {
  external_ref: string
  plan_code: string
  order_id: string
  server_code: string
}

export interface VpnProvisionResult {
  radius_username: string
  password: string
  quota_bytes?: number
  [key: string]: unknown
}

export interface VpnUsageResult {
  [key: string]: unknown
}

const REQUEST_TIMEOUT_MS = 15000

function describeErrorPayload(raw: string): string {
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const detail = parsed.error ?? parsed.message ?? parsed.detail
    if (typeof detail === 'string' && detail) return `: ${detail}`
  } catch {
    // Response body is not JSON; fall through to the raw snippet.
  }
  return `: ${raw.slice(0, 200)}`
}

export class VpnClient {
  private readonly baseUrl: string
  private readonly token: string

  constructor(env: VpnClientEnvironment) {
    const baseUrl = env.VAR_API_URL?.trim()
    const token = env.VAR_API_TOKEN?.trim()
    if (!baseUrl) throw new Error('VAR_API_URL is not configured.')
    if (!token) throw new Error('VAR_API_TOKEN is not configured.')
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.token = token
  }

  private async request<T>(
    path: string,
    init: { method: 'GET' | 'POST'; body?: string },
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
    }
    if (init.body !== undefined) headers['Content-Type'] = 'application/json'

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: init.method,
        headers,
        body: init.body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause)
      throw new Error(`var-api ${init.method} ${path} failed: ${reason}`)
    }

    const raw = await response.text()
    if (!response.ok) {
      throw new Error(
        `var-api ${init.method} ${path} responded with ${response.status}${describeErrorPayload(raw)}`,
      )
    }
    if (!raw.trim()) {
      throw new Error(`var-api ${init.method} ${path} returned an empty response.`)
    }
    try {
      return JSON.parse(raw) as T
    } catch {
      throw new Error(
        `var-api ${init.method} ${path} returned an invalid JSON response.`,
      )
    }
  }

  /**
   * Creates a new RADIUS account for the given order on the upstream VPS.
   */
  async provision(input: VpnProvisionRequest): Promise<VpnProvisionResult> {
    return this.request<VpnProvisionResult>('/v1/provision', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  /**
   * Fetches the current usage (quota, traffic) for a RADIUS username.
   */
  async getUsage(username: string): Promise<VpnUsageResult> {
    if (!username) throw new Error('username is required to fetch usage.')
    return this.request<VpnUsageResult>(
      `/v1/usage?username=${encodeURIComponent(username)}`,
      { method: 'GET' },
    )
  }

  /**
   * Builds a ready-to-use OpenVPN `.ovpn` config with the credentials
   * embedded directly inside the file.
   */
  generateOvpnConfig(
    serverIp: string,
    protocol: VpnProtocol,
    username: string,
    password: string,
  ): string {
    if (!serverIp) throw new Error('serverIp is required to build an OpenVPN config.')
    if (!username || !password) {
      throw new Error('username and password are required to build an OpenVPN config.')
    }
    const port = protocol === 'tcp' ? 443 : 1194
    return [
      'client',
      'dev tun',
      `proto ${protocol}`,
      `remote ${serverIp} ${port}`,
      'resolv-retry infinite',
      'nobind',
      'persist-key',
      'persist-tun',
      'remote-cert-tls server',
      'cipher AES-256-CBC',
      'verb 3',
      '<auth-user-pass>',
      username,
      password,
      '</auth-user-pass>',
      '',
    ].join('\n')
  }
}
