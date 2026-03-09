import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'

interface CanvasPhotoData {
  id: number
  config: {
    x: number
    y: number
    width: number
    height: number
    opacity: number
    zIndex: number
  }
}

interface CanvasData {
  photos: CanvasPhotoData[]
  discardedPhotos: CanvasPhotoData[]
  currentZIndex: number
}

export default class Canvas extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare name: string

  @column({
    prepare: (value: CanvasData) => JSON.stringify(value),
    consume: (value: string | CanvasData) =>
      typeof value === 'string' ? JSON.parse(value) : value,
  })
  declare data: CanvasData

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
