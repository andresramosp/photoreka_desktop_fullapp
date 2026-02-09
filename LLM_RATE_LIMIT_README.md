# Rate Limiting para Endpoints LLM

## Descripción

Este middleware protege los endpoints que hacen llamadas a LLM (Large Language Models) contra abuso y uso excesivo, implementando límites por minuto, hora y día, además de otras medidas de seguridad estándar.

## Endpoints Protegidos

Los siguientes endpoints están protegidos con rate limiting:

- `POST /api/analyzer/` - Análisis de fotos con IA
- `POST /api/embeddings/` - Generación de embeddings
- `POST /api/search/semantic/stream` - Búsqueda semántica con streaming
- `POST /api/search/semantic/sync` - Búsqueda semántica sincrónica

## Características

### 1. **Límites Multi-Ventana**

- **Por minuto**: Protección contra ataques burst (10 requests/minuto por defecto)
- **Por hora**: Prevención de abuso moderado (60 requests/hora por defecto)
- **Por día**: Cuota diaria total (200 requests/día por defecto)

### 2. **Tracking Dual**

El sistema rastrea las llamadas por:

- **Usuario autenticado**: Identifica el user ID
- **Dirección IP**: Tracking adicional por IP para usuarios no autenticados o usuarios compartidos

### 3. **Sistema de Cooldown**

Cuando se excede un límite, se activa un período de cooldown (60 segundos por defecto) durante el cual todas las requests son rechazadas automáticamente.

### 4. **Headers Informativos**

Cada respuesta incluye headers HTTP que informan al cliente sobre su uso:

```
X-RateLimit-Limit-Minute: 10
X-RateLimit-Limit-Hour: 60
X-RateLimit-Limit-Day: 200
X-RateLimit-Remaining-Minute: 8
X-RateLimit-Remaining-Hour: 45
X-RateLimit-Remaining-Day: 156
```

### 5. **Whitelist**

IPs y usuarios privilegiados pueden ser añadidos a una whitelist para bypass del rate limiting.

### 6. **Estrategias de Fallo**

- **fail-open**: Si Redis falla, permite las requests (más permisivo, mejor UX)
- **fail-closed**: Si Redis falla, rechaza las requests (más seguro)

### 7. **Logging Configurable**

- **none**: Sin logs
- **warning**: Solo advertencias cuando se acerca al límite
- **all**: Logea todos los intentos

## Configuración

### Variables de Entorno

Agrega estas variables a tu archivo `.env` para personalizar los límites:

```env
# Habilitar/deshabilitar el middleware
LLM_RATE_LIMIT_ENABLED=true

# Límites por ventana de tiempo
LLM_RATE_LIMIT_PER_MINUTE=10
LLM_RATE_LIMIT_PER_HOUR=60
LLM_RATE_LIMIT_PER_DAY=200

# Cooldown en segundos después de exceder límites
LLM_RATE_LIMIT_COOLDOWN=60

# Estrategia de fallo: 'fail-open' o 'fail-closed'
LLM_RATE_LIMIT_FAIL_STRATEGY=fail-open

# Nivel de logging: 'none', 'warning', 'all'
LLM_RATE_LIMIT_LOG_LEVEL=warning

# Whitelist (separadas por comas)
LLM_RATE_LIMIT_WHITELIST_IPS=127.0.0.1,192.168.1.100
LLM_RATE_LIMIT_WHITELIST_USERS=user_id_1,user_id_2
```

### Archivo de Configuración

Los ajustes también pueden modificarse en `/config/llm_rate_limit.ts`:

```typescript
export default {
  limits: {
    perMinute: 10,
    perHour: 60,
    perDay: 200,
  },
  cooldownSeconds: 60,
  enabled: true,
  failStrategy: 'fail-open',
  logLevel: 'warning',
  warningThreshold: 0.8, // Advertir al 80% del límite
  whitelist: {
    ips: [],
    userIds: [],
  },
}
```

## Respuestas de Error

### Cuando se excede el límite

```json
{
  "error": "Rate limit exceeded",
  "message": "Has excedido el límite de solicitudes por minuto. Por favor, espera antes de reintentar.",
  "retryAfter": 60,
  "limits": {
    "minute": {
      "limit": 10,
      "remaining": 0
    },
    "hour": {
      "limit": 60,
      "remaining": 25
    },
    "day": {
      "limit": 200,
      "remaining": 150
    }
  },
  "type": "minute"
}
```

HTTP Status: `429 Too Many Requests`

Headers adicionales:

```
Retry-After: 60
```

### Durante el cooldown

```json
{
  "error": "Rate limit exceeded",
  "message": "Demasiadas solicitudes. Espera 45 segundos antes de reintentar.",
  "retryAfter": 45,
  "type": "cooldown"
}
```

## Manejo del Cliente

### Ejemplo en JavaScript/TypeScript

```typescript
async function callLLMEndpoint(data: any) {
  try {
    const response = await fetch('/api/search/semantic/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })

    // Verificar rate limit headers
    const remaining = {
      minute: response.headers.get('X-RateLimit-Remaining-Minute'),
      hour: response.headers.get('X-RateLimit-Remaining-Hour'),
      day: response.headers.get('X-RateLimit-Remaining-Day'),
    }

    console.log('Remaining requests:', remaining)

    if (response.status === 429) {
      const error = await response.json()
      const retryAfter = error.retryAfter

      console.warn(`Rate limit exceeded. Retry after ${retryAfter} seconds`)

      // Mostrar mensaje al usuario
      showNotification(error.message)

      // Opcional: Reintentar automáticamente después del tiempo indicado
      setTimeout(() => {
        callLLMEndpoint(data)
      }, retryAfter * 1000)

      return null
    }

    return await response.json()
  } catch (error) {
    console.error('Error calling LLM endpoint:', error)
    throw error
  }
}
```

## Monitoreo

### Logs de Advertencia

Cuando un usuario alcanza el 80% de su cuota diaria, se registra una advertencia:

```
[LLM Rate Limit Warning] Usuario 12345 (IP: 192.168.1.1) ha usado 161/200 llamadas diarias
```

### Logs Completos (logLevel: 'all')

```
[LLM Rate Limit] Usuario 12345 - Minute: 3/10, Hour: 25/60, Day: 156/200
```

## Mejores Prácticas

### Para el Frontend

1. **Mostrar límites restantes** al usuario en la UI
2. **Implementar debouncing** en búsquedas para reducir llamadas
3. **Cachear resultados** cuando sea posible
4. **Manejar errores 429** con mensajes amigables
5. **Implementar retry automático** respetando el `retryAfter`

### Para el Backend

1. **Ajustar límites** según los recursos disponibles y el plan de precios
2. **Monitorear métricas** de uso de Redis
3. **Revisar logs** regularmente para detectar patrones de abuso
4. **Actualizar whitelist** para usuarios/servicios privilegiados
5. **Considerar límites diferenciados** por tipo de usuario (free vs premium)

## Extensiones Futuras

### Límites por Plan de Usuario

```typescript
// Ejemplo de cómo podrías implementar límites diferenciados
private getLimitsForUser(user: User) {
  switch (user.plan) {
    case 'premium':
      return { perMinute: 20, perHour: 200, perDay: 1000 }
    case 'pro':
      return { perMinute: 15, perHour: 120, perDay: 500 }
    default:
      return llmRateLimitConfig.limits
  }
}
```

### Endpoint de Status

Crear un endpoint para que los usuarios consulten su uso actual:

```typescript
router.get('/api/rate-limit/status', async ({ request, response, auth }) => {
  const user = auth.user!
  const ip = request.ip()
  const identifier = `${user.id}:${ip}`

  // Consultar contadores actuales en Redis
  // Retornar límites y uso actual
})
```

## Dependencias

- **Redis**: Almacenamiento de contadores y estado
- **@adonisjs/redis**: Cliente de Redis para AdonisJS

## Troubleshooting

### El middleware no funciona

1. Verificar que Redis esté corriendo y accesible
2. Confirmar que `LLM_RATE_LIMIT_ENABLED=true` en `.env`
3. Revisar logs para errores de conexión a Redis

### Los límites no se resetean

1. Verificar que Redis está configurado correctamente
2. Los límites usan TTL automático, si Redis se reinicia se pierden
3. Considerar usar Redis persistente en producción

### Usuarios legítimos son bloqueados

1. Agregar a la whitelist si son usuarios/servicios internos
2. Revisar y ajustar los límites según patrones de uso real
3. Considerar implementar límites diferenciados por plan

## Soporte

Para más información o ajustes, consultar la configuración en:

- `/config/llm_rate_limit.ts` - Configuración principal
- `/app/middleware/llm_rate_limit_middleware.ts` - Implementación del middleware
- `/start/routes.ts` - Aplicación a endpoints
