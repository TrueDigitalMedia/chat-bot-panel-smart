/**
 * Outbound JSON we POST to Kantar's /api/ai-lead-responses — one entry per changed/new
 * question, upserted on their side keyed by (lead_id, codigo_pregunta).
 */
export interface PanelSmartResponseItem {
  codigo_pregunta: string
  pregunta: string
  respuesta: string
}

export interface PanelSmartSyncPayload {
  lead_id: string
  responses: PanelSmartResponseItem[]
}
