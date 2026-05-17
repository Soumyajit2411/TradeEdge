import { createClient } from './supabase'
import { SYSTEM_MESSAGES } from '@/constants/system'

const RAW_BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL?.trim()

export const BACKEND_URL = (RAW_BACKEND_URL && RAW_BACKEND_URL.length > 0
  ? RAW_BACKEND_URL
  : 'http://localhost:5001').replace(/\/$/, '')

export function backendUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${BACKEND_URL}${normalized}`
}

export function friendlyApiError(error: unknown, fallback: string): string {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  const m = msg.toLowerCase()
  if (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('load failed') ||
    m.includes('network request failed')
  ) {
    return SYSTEM_MESSAGES.serviceDown
  }
  return error instanceof Error ? error.message : fallback
}

export async function parseJsonResponse<T = unknown>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.toLowerCase().includes('application/json')) {
    return await res.json() as T
  }
  const text = await res.text()
  return ({ error: text } as unknown) as T
}

export async function fetchJson<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(backendUrl(path), options)
  } catch {
    throw new Error(SYSTEM_MESSAGES.serviceDown)
  }

  const data = await parseJsonResponse<T | { error?: string }>(res)
  if (!res.ok) {
    const message = (data as { error?: string })?.error ?? `HTTP ${res.status}`
    throw new Error(message)
  }
  return data as T
}

/** Fetch wrapper that attaches the current Supabase session token. */
export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }

  try {
    return await fetch(backendUrl(path), { ...options, headers })
  } catch {
    throw new Error(SYSTEM_MESSAGES.serviceDown)
  }
}

export async function authFetchJson<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await authFetch(path, options)
  const data = await parseJsonResponse<T | { error?: string }>(res)
  if (!res.ok) {
    const message = (data as { error?: string })?.error ?? `HTTP ${res.status}`
    throw new Error(message)
  }
  return data as T
}
