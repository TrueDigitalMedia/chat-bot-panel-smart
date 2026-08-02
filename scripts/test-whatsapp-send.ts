/**
 * One-off: sends a plain WhatsApp text via Meta's Graph API directly, bypassing
 * the whole bot flow — isolates "is outbound sending broken" (bad token/phone id)
 * from "is inbound routing broken" (webhook subscription/signature).
 *
 * Usage: npx tsx scripts/test-whatsapp-send.ts +50255551234
 */
for (const file of ['.env', '.env.local']) {
  try {
    process.loadEnvFile(file)
  } catch {
    // optional
  }
}

async function main(): Promise<void> {
  const to = process.argv[2]
  if (!to) {
    console.error('Usage: npx tsx scripts/test-whatsapp-send.ts +<number>')
    process.exit(1)
  }

  const version = process.env.WHATSAPP_GRAPH_VERSION ?? 'v21.0'
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) {
    console.error('Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN in env')
    process.exit(1)
  }

  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to.replace(/^\+/, ''),
      type: 'text',
      text: { body: '✅ Prueba de conexión desde PanelSmart bot' },
    }),
  })

  const data = await res.json()
  console.log('Status:', res.status)
  console.log('Response:', JSON.stringify(data, null, 2))

  if (!res.ok) {
    console.error('\n❌ Falló el envío — revisa el error de arriba (token expirado, número no válido, etc.)')
    process.exit(1)
  }
  console.log('\n✅ Mensaje enviado — revisa tu WhatsApp')
}

main()
