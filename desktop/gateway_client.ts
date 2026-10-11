import db from '@adonisjs/lucid/services/db'
import CloudAccountService from './services/cloud_account_service.js'

/**
 * Cliente del servicio de la nube del escritorio (modo gateway). Cada llamada va firmada con
 * el token de la cuenta de la nube del usuario.
 */

export class GatewayError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

function baseUrl(): string {
  const url = process.env.PHOTOREKA_GATEWAY
  if (!url) throw new Error('Falta la variable PHOTOREKA_GATEWAY')
  return url.replace(/\/+$/, '')
}

/**
 * Token del usuario indicado o, si no se indica (llamadas sin usuario a mano, como los
 * vectores de una búsqueda), el de la última sesión sincronizada: el escritorio es de un usuario.
 */
async function tokenFor(userId?: number | null): Promise<string> {
  let id = userId ?? null
  if (!id) {
    const row = await db.from('cloud_sessions').orderBy('synced_at', 'desc').select('user_id').first()
    id = row?.user_id ?? null
  }
  const token = id ? await CloudAccountService.cloudToken(id) : null
  if (!token) throw new GatewayError('No hay sesión de la nube: inicia sesión de nuevo', 401)
  return token
}

export async function callGateway<T = any>(path: string, body: unknown, userId?: number | null): Promise<T> {
  const response = await fetch(`${baseUrl()}/gateway${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${await tokenFor(userId)}`,
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) throw new GatewayError(data?.message || `El servicio respondió ${response.status}`, response.status)
  return data as T
}
