import * as api from './api'

interface DetectedPlan {
  title: string
  content: string
}

/**
 * Detect if a Claude Code response contains a plan.
 *
 * Plans typically have:
 * - A heading with keywords like "plan", "implementation", "approach", "strategy", "roadmap"
 * - Structured content: numbered steps, phases, or bulleted lists
 * - Multiple sections with headers
 *
 * We look for these patterns and extract the plan content.
 */
export function detectPlan(response: string): DetectedPlan | null {
  if (!response || response.length < 100) return null

  // Plan title patterns - headings that signal a plan
  const planHeadingPatterns = [
    /^(#{1,3})\s+(.*(?:plan|implementation|approach|strategy|roadmap|phases?|steps?|proposal|design|architecture|sprint|milestone).*)/im,
    /^(#{1,3})\s+(.*)/m, // Fallback: any heading if we detect plan structure below
  ]

  // Check for structured plan indicators
  const structureIndicators = [
    /^#{2,3}\s+(?:phase|step|stage|part|section)\s+\d/im,     // ## Phase 1, ## Step 1
    /^\d+\.\s+\*\*[^*]+\*\*/m,                                 // 1. **Bold step title**
    /^#{2,3}\s+\d+[\.\)]/m,                                    // ## 1. or ## 1)
    /^-\s+\[[ x]\]/m,                                          // - [ ] checkbox items
    /(?:^#{2,3}\s+.+\n(?:[\s\S]*?)^-\s+.+){2,}/m,            // Multiple sections with lists
  ]

  // Must have at least some structure
  const hasStructure = structureIndicators.some(pattern => pattern.test(response))

  // Count headings and list items as a heuristic
  const headingCount = (response.match(/^#{1,3}\s+.+/gm) || []).length
  const listItemCount = (response.match(/^(?:\d+\.|[-*])\s+/gm) || []).length
  const checkboxCount = (response.match(/^-\s+\[[ x]\]/gm) || []).length

  // A plan should have either:
  // - Explicit plan heading + some structure
  // - Multiple headings + many list items (looks like organized work)
  const hasExplicitPlanHeading = planHeadingPatterns[0].test(response)
  const hasPlanLikeStructure = (headingCount >= 2 && listItemCount >= 4) || checkboxCount >= 3

  if (!hasExplicitPlanHeading && !hasPlanLikeStructure && !hasStructure) {
    return null
  }

  // Extract plan title from the first relevant heading
  let title = 'Untitled Plan'
  const titleMatch = response.match(planHeadingPatterns[0])
  if (titleMatch) {
    title = titleMatch[2].trim()
  } else {
    // Use the first heading as fallback
    const firstHeading = response.match(/^#{1,3}\s+(.+)/m)
    if (firstHeading) {
      title = firstHeading[1].trim()
    }
  }

  // Clean up title - remove markdown formatting
  title = title.replace(/\*\*/g, '').replace(/`/g, '').trim()

  // Truncate long titles
  if (title.length > 100) {
    title = title.slice(0, 97) + '...'
  }

  return {
    title,
    content: response.trim(),
  }
}

/**
 * Detect plan in response and save it to the server.
 * Returns the created plan if one was detected, null otherwise.
 */
export async function detectAndSavePlan(
  response: string,
  conversationId: string | null
): Promise<api.Plan | null> {
  const detected = detectPlan(response)
  if (!detected) return null

  try {
    const plan = await api.createPlan({
      title: detected.title,
      content: detected.content,
      status: 'draft',
      conversationId,
    })
    console.log('[PlanDetection] Saved plan:', plan.id, detected.title)
    return plan
  } catch (err) {
    console.warn('[PlanDetection] Failed to save plan:', err)
    return null
  }
}
