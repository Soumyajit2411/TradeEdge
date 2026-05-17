import { authFetchJson, fetchJson } from './api'

interface CredentialsStatusResponse {
  has_credentials?: boolean
}

interface HealthResponse {
  ok?: boolean
}

export async function getCredentialsStatus(): Promise<boolean> {
  const data = await authFetchJson<CredentialsStatusResponse>('/api/users/credentials/status')
  return Boolean(data?.has_credentials)
}

export async function checkBackendHealth(): Promise<boolean> {
  const data = await fetchJson<HealthResponse>('/health', { cache: 'no-store' })
  return Boolean(data?.ok)
}
