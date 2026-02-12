/**
 * Module-level tracker for auto-failed experiences.
 *
 * When a later node is marked as "done" and earlier pending nodes are
 * automatically set to failed, this map records the relationship so that
 * only those specific nodes are reverted if the trigger node is later
 * changed back to pending.
 *
 * Key:   the experience ID that was marked "done" (the trigger)
 * Value: the list of experience IDs that were auto-failed as a result
 *
 * This state lives in memory only and does not survive page refresh.
 */

const autoFailMap = new Map<string, string[]>()

export function trackAutoFails(triggerExpId: string, failedExpIds: string[]) {
  if (failedExpIds.length > 0) {
    autoFailMap.set(triggerExpId, failedExpIds)
  }
}

export function getAutoFails(triggerExpId: string): string[] {
  return autoFailMap.get(triggerExpId) ?? []
}

export function clearAutoFails(triggerExpId: string) {
  autoFailMap.delete(triggerExpId)
}
