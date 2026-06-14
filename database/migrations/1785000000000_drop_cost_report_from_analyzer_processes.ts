import { BaseSchema } from '@adonisjs/lucid/schema'

export default class DropCostReportFromAnalyzerProcesses extends BaseSchema {
  protected tableName = 'analyzer_processes'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('cost_report')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.jsonb('cost_report').nullable()
    })
  }
}
