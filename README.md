# Cuentos Mágicos

PWA de cuentos infantiles personalizados para la hora de dormir. Un único Worker de Cloudflare sirve la app (carpeta `public/`) y la API (`src/`).

- **Texto**: Gemini 2.5 Flash, sin razonamiento y con salida JSON.
- **Ilustración**: FLUX schnell en fal.ai (una por cuento). Sin `FAL_KEY` usa Pollinations, solo para pruebas.
- **Narrador** (planes de pago): Google Cloud TTS Chirp 3 HD. El MP3 se guarda en R2 y repetir un cuento no cuesta nada.
- **Voces de la familia** (VIP): Chatterbox Multilingual en fal.ai. Cada cuenta guarda hasta 6 voces (papá, mamá, abuelos, tíos...) y elige cuál narra cada cuento.
- **Plan gratis**: 3 cuentos y voz del propio móvil.
- **Pagos**: Stripe Checkout con 3 días de prueba, portal de cliente y webhook.

El plan y la cuota se guardan en el servidor (KV), no en el navegador.

## Planes

| | Gratis | Estándar | VIP Familiar |
|-|-|-|-|
| Cuentos | 3 | Ilimitados (20 al día) | Ilimitados (20 al día) |
| Duración | 2 y 3 min | + 5 min | + 10 min |
| Estilos | 1 | 4 | 10 |
| Voz | La del móvil | Narrador natural | Narrador + voces de la familia (unos 60 min al mes) |
| Precio | 0 € | 4,99 €/mes o 39,99 €/año | 14,99 €/mes o 119,99 €/año |

El VIP no se puede comprar hasta que pongas `VIP_ENABLED = "1"` en `wrangler.toml`.

## Probar en local (sin gastar en IA)

```bash
npm install
cat > .dev.vars <<'VARS'
MOCK_AI=1
ENVIRONMENT=development
MEDIA_SIGNING_KEY=cualquier-texto
# DEV_PLAN=vip   # descomenta para probar como VIP sin pagar
VARS
npm run dev        # http://localhost:8787
npm test
```

Con `MOCK_AI=1` el cuento es de prueba, no hay imagen y la voz cae a la del navegador. Las voces de la familia no se pueden probar de verdad en local porque fal.ai tiene que descargar la muestra desde una URL pública.

## Poner en marcha

1. **Cloudflare**
   ```bash
   npx wrangler login
   npx wrangler kv namespace create DATA        # pega el id en wrangler.toml
   npx wrangler r2 bucket create cuentos-magicos-media
   ```
   En el panel de R2 añade una regla de ciclo de vida que borre `img/` y `audio/` a los 90 días (los cuentos caducan a los 90 días). **No** la apliques a `voicesrc/`.

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
   - Crea el producto «Estándar» con dos precios (4,99 €/mes y 39,99 €/año) y, si vas a vender VIP, el producto «VIP Familiar» (14,99 €/mes y 119,99 €/año). Copia los `price_...` en `wrangler.toml`.
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
| `AUDIO_MONTHLY_CHAR_CAP` | 150.000 | Caracteres de narrador al mes (unas 20 h) |
| `CLONED_MONTHLY_CHAR_CAP` | 45.000 | Caracteres con voces de la familia al mes (unos 60 min, ~1,15 $) |

Chatterbox cuesta 0,025 $ por 1.000 caracteres: unos 0,09 $ un cuento de 5 minutos y 0,19 $ uno de 10. Cada audio se guarda, así que volver a escucharlo es gratis.

## Pendiente

- Avatar del peque en las ilustraciones.
- Recuperar la suscripción en otro dispositivo (hoy va ligada a la cookie del navegador; el portal de Stripe permite gestionarla, pero no mover el plan a otro móvil).
