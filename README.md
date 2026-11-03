# Cuentos Mágicos

PWA de cuentos infantiles personalizados para la hora de dormir. Un único Worker de Cloudflare sirve la app (carpeta `public/`) y la API (`src/`).

- **Texto**: Gemini 2.5 Flash, sin razonamiento y con salida JSON.
- **Ilustración**: Gemini 3.1 Flash Lite Image (una por cuento, ≈ 0,034 $), elegido en `IMAGE_MODEL`. Con `IMAGE_MODEL="flux"` usa FLUX schnell en fal.ai; sin claves, Pollinations (solo para pruebas).
- **Narrador** (planes de pago): Google Cloud TTS Chirp 3 HD. El MP3 se guarda en R2 y repetir un cuento no cuesta nada.
- **Voces de la familia** (Pro y VIP): Chatterbox Multilingual en fal.ai. El Pro guarda 1 voz y el VIP hasta 6 (papá, mamá, abuelos, tíos...); se elige cuál narra cada cuento.
- **Plan gratis**: 3 cuentos y voz del propio móvil.
- **Pagos**: Stripe Checkout (3 días de prueba solo en el VIP), portal de cliente y webhook.

- **Biblioteca**: «Mis cuentos» guarda cada cuento con su dibujo y sus audios, así que volver a leerlo o escucharlo no gasta nada en IA.

El plan y la cuota se guardan en el servidor (KV), no en el navegador.

### Extras del VIP

- **Biblioteca para siempre**: los demás planes ven los cuentos de los últimos 30 días; la tarea diaria del Worker borra los más antiguos (claves `exp:` en KV). Si alguien deja el VIP, sus cuentos se conservan 30 días más.
- **Sin conexión**: el botón «Guardar sin conexión» guarda el cuento, el dibujo y el audio en la caché `cuentos-offline` del navegador; el service worker los sirve cuando no hay red.
- **Perfiles de hermanos**: nombre, edad, acompañante y juguete de cada peque, guardados solo en el dispositivo (`localStorage`).
- **Enlace para los abuelos**: `/c/{token}` abre una página pública con el cuento y su audio. Deja de funcionar si se desactiva, se borra el cuento o la familia deja el VIP.

## Planes

| | Gratis | Estándar | Pro | VIP Familiar |
|-|-|-|-|-|
| Precio | 0 € | 4,99 €/mes o 39,99 €/año | 12,99 €/mes o 99,99 €/año | 14,99 €/mes o 119,99 €/año |
| Cuentos | 3 | Ilimitados (20 al día) | Ilimitados | Ilimitados |
| Duración | 2 y 3 min | + 5 min | + 10 min | + 10 min |
| Estilos | 1 | 4 | 10 | 10 |
| Narrador natural | Voz del móvil | 1 h al mes | 2 h 30 min al mes | 3 h 20 min al mes en total |
| Voces de la familia | No | No | 1 voz, 20 min al mes | Hasta 6 voces, 2 h al mes |
| Biblioteca (Mis cuentos) | 30 días | 30 días | 30 días | Para siempre y sin conexión |
| Perfiles de hermanos | No | No | No | Hasta 6 (en el dispositivo) |
| Enlace para los abuelos | No | No | No | Sí |
| Prueba gratis | | No | No | 3 días |

El Pro es la opción ancla: cuesta 2 € menos que el VIP para que el VIP parezca la compra lógica. La pantalla de pago se abre siempre con el VIP elegido. Los topes de minutos están en `src/config.js` (`PLAN_LIMITS`).

Pro y VIP no se pueden comprar hasta que pongas `VOICE_PLANS_ENABLED = "1"` en `wrangler.toml`.

## Probar en local (sin gastar en IA)

```bash
npm install
cat > .dev.vars <<'VARS'
MOCK_AI=1
ENVIRONMENT=development
MEDIA_SIGNING_KEY=cualquier-texto
# DEV_PLAN=vip   # descomenta para probar un plan (standard, pro o vip) sin pagar
# VOICE_PLANS_ENABLED=1
VARS
npm run dev        # http://localhost:8787
npm test
```

Con `MOCK_AI=1` el cuento es de prueba, no hay imagen y la voz cae a la del navegador. Las voces de la familia no se pueden probar de verdad en local porque fal.ai tiene que descargar la muestra desde una URL pública. Las voces que el plan ya no cubre se borran a los 30 días (tarea diaria del Worker).

## Poner en marcha

1. **Cloudflare**
   ```bash
   npx wrangler login
   npx wrangler kv namespace create DATA        # pega el id en wrangler.toml
   npx wrangler r2 bucket create cuentos-magicos-media
   ```
   **No** añadas reglas de ciclo de vida en R2: los cuentos del VIP se guardan para siempre. La tarea diaria del Worker borra los cuentos de los demás planes a los 30 días, con su imagen y sus audios.

   Hace falta el plan **Workers Paid (5 $/mes)**: un cuento de 10 minutos con voz de la familia hace unas 60 peticiones a fal.ai y el plan gratis permite 50.

2. **Claves** (se guardan cifradas en Cloudflare, nunca en el código)
   ```bash
   npx wrangler secret put GEMINI_API_KEY        # Google AI Studio
   npx wrangler secret put GOOGLE_TTS_API_KEY    # Google Cloud, con Text-to-Speech activado
   npx wrangler secret put FAL_KEY               # fal.ai
   npx wrangler secret put STRIPE_SECRET_KEY
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   npx wrangler secret put MEDIA_SIGNING_KEY     # texto aleatorio largo
   ```
   Limita la clave de Google TTS a la API de Text-to-Speech y pon una alerta de presupuesto en Google Cloud y en fal.ai.

3. **Stripe**
   - Crea tres productos con dos precios cada uno: «Estándar» (4,99 €/mes y 39,99 €/año), «Pro» (12,99 €/mes y 99,99 €/año) y «VIP Familiar» (14,99 €/mes y 119,99 €/año). Copia los `price_...` en `wrangler.toml`.
   - Activa el portal de cliente (Settings → Billing → Customer portal) con cancelación y cambio de plan.
   - Crea un webhook a `https://TU-DOMINIO/api/stripe-webhook` con los eventos `checkout.session.completed`, `customer.subscription.updated` y `customer.subscription.deleted`. Su secreto es `STRIPE_WEBHOOK_SECRET`.

4. **Publicar**
   ```bash
   npm run deploy
   ```

5. **Legal**: `public/terminos.html` y `public/privacidad.html` son **borradores**. Rellena los campos en amarillo y que los revise un abogado antes de cobrar. Las voces son datos biométricos: la app pide consentimiento expreso al grabar y permite borrarlas.

## Límites y costes

| Variable | Por defecto | Qué controla |
|-|-|-|
| `FREE_DAILY_IP_LIMIT` | 10 | Cuentos gratis por IP y día |
| `PAID_DAILY_LIMIT` | 20 | Cuentos por cuenta de pago y día |

Los minutos de narrador y de voces de la familia de cada plan están en `PLAN_LIMITS` (`src/config.js`). Si alguien baja a un plan con menos voces, las que sobran se borran a los 30 días.

Chatterbox cuesta 0,025 $ por 1.000 caracteres: unos 0,09 $ un cuento de 5 minutos y 0,19 $ uno de 10. Cada audio se guarda, así que volver a escucharlo es gratis. Los márgenes de cada plan están en el documento de costes del proyecto.

## Pendiente

- Recuperar la suscripción en otro dispositivo (hoy va ligada a la cookie del navegador; el portal de Stripe permite gestionarla, pero no mover el plan a otro móvil).
