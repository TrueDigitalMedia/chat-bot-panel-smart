import { NextResponse } from 'next/server'

/** Placeholder "App Store" page for mock onboarding. */
export async function GET(): Promise<NextResponse> {
  return new NextResponse(
    `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"/><title>Mock iOS download</title></head>
<body style="font-family:system-ui;padding:2rem;max-width:32rem">
  <h1>Mock — App iOS</h1>
  <p>Esto simula la descarga de la app. No hay integración real con stores ni PanelSmart.</p>
  <p>Vuelve a Telegram; el bot te enviará un código <code>MOCK-…</code> y el registro se completará en modo mock.</p>
</body>
</html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}
