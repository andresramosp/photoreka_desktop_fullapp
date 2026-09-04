import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'canvases'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // The chat docked to this canvas. Nullable: a canvas has none until the user
      // sends their first message there, and `reset` puts it back to null.
      //
      // The binding lives on the canvas rather than on the conversation because the
      // question always runs this way: "this canvas is open, does it have a chat?"
      //
      // SET NULL covers the conversation disappearing under the canvas — the 50-per-user
      // sweep, or a manual delete — leaving a canvas that simply opens a fresh chat. The
      // other direction (deleting the canvas) is not a cascade: CanvasController.destroy
      // deletes the conversation explicitly, because it also has to work when the row is
      // removed through the model rather than through SQL.
      table
        .integer('conversation_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('conversations')
        .onDelete('SET NULL')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('conversation_id')
    })
  }
}
