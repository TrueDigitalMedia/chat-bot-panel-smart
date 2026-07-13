import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { flowStates } from '@/lib/db/schema'
import type { WaChoiceMap } from '@/lib/whatsapp/buttons'

export async function setPendingWaChoices(
  leadId: string,
  choices: WaChoiceMap | null,
): Promise<void> {
  await db
    .update(flowStates)
    .set({ pendingWaChoices: choices, updatedAt: new Date() })
    .where(eq(flowStates.leadId, leadId))
}

export async function getPendingWaChoices(
  leadId: string,
): Promise<WaChoiceMap | null> {
  const [row] = await db
    .select({ pendingWaChoices: flowStates.pendingWaChoices })
    .from(flowStates)
    .where(eq(flowStates.leadId, leadId))
    .limit(1)
  return (row?.pendingWaChoices as WaChoiceMap | null) ?? null
}

export async function clearPendingWaChoices(leadId: string): Promise<void> {
  await setPendingWaChoices(leadId, null)
}
