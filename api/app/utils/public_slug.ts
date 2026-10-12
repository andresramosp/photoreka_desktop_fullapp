import PublicItem from '#models/public_item'

function slugify(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/**
 * Resolve a free slug within one author, appending -2, -3 ... on collision.
 * `ignoreId` lets an item keep its own slug when it is being re-published.
 */
export async function resolvePublicSlug(
  desired: string,
  userId: number,
  ignoreId: number | null
): Promise<string> {
  const base = slugify(desired) || 'portfolio'

  for (let suffix = 1; suffix < 200; suffix++) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`
    const query = PublicItem.query().where('userId', userId).where('slug', candidate)
    if (ignoreId !== null) query.whereNot('id', ignoreId)
    const clash = await query.first()
    if (!clash) return candidate
  }

  return `${base}-${Date.now()}`
}
