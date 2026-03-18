import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('username', 50).nullable().unique()
    })

    // Auto-populate username from email for existing users
    this.defer(async (db) => {
      const users = await db.from('users').select('id', 'email')

      for (const user of users) {
        // Extract part before @, sanitize for URL safety
        let base = user.email.split('@')[0]
        base = base.replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase()

        // Ensure minimum length
        if (base.length < 3) {
          base = base + '_user'
        }

        // Trim to max 50 chars
        base = base.substring(0, 50)

        // Handle collisions by appending numeric suffix
        let username = base
        let suffix = 2
        while (true) {
          const existing = await db
            .from('users')
            .where('username', username)
            .whereNot('id', user.id)
            .first()
          if (!existing) break
          username = `${base.substring(0, 46)}${suffix}`
          suffix++
        }

        await db.from('users').where('id', user.id).update({ username })
      }
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('username')
    })
  }
}
