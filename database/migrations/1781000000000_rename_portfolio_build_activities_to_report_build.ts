import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_activities'

  async up() {
    // All existing 'portfolio_build' rows were logged by the old
    // /portfolio-review/should-build endpoint (ReportReviewController).
    // They should be 'report_build'.  The actual portfolio builder
    // (PortfolioBuildController) now logs new rows as 'portfolio_build'.
    await this.db.rawQuery(
      `UPDATE ${this.tableName} SET type = 'report_build' WHERE type = 'portfolio_build'`
    )
  }

  async down() {
    await this.db.rawQuery(
      `UPDATE ${this.tableName} SET type = 'portfolio_build' WHERE type = 'report_build'`
    )
  }
}
