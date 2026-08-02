import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema'

export class CardState extends Schema {
  @type('string') id!: string
  @type('string') scryfallId!: string
  @type('string') name!: string
  @type('string') imageUri!: string
  @type('string') oracleText!: string
  @type('string') zone!: string
  @type('boolean') tapped!: boolean
  @type('number') counters!: number
  @type('number') damage!: number
  @type('string') type!: string
  @type('string') typeLine!: string
  @type(['string']) subtypes!: ArraySchema<string>
  @type('boolean') isBasicLand!: boolean
  @type('number') commanderTax!: number
  @type('boolean') revealed!: boolean

  constructor(data?: Omit<Partial<CardState>, 'subtypes'> & { subtypes?: string[] | ArraySchema<string> }) {
    super()
    this.id = data?.id ?? ''
    this.scryfallId = data?.scryfallId ?? ''
    this.name = data?.name ?? ''
    this.imageUri = data?.imageUri ?? ''
    this.oracleText = data?.oracleText ?? ''
    this.zone = data?.zone ?? 'battlefield'
    this.tapped = data?.tapped ?? false
    this.counters = data?.counters ?? 0
    this.damage = data?.damage ?? 0
    this.type = data?.type ?? 'other'
    this.typeLine = data?.typeLine ?? ''
    this.subtypes = new ArraySchema<string>(...(data?.subtypes ?? []))
    this.isBasicLand = data?.isBasicLand ?? false
    this.commanderTax = data?.commanderTax ?? 0
    this.revealed = data?.revealed ?? false
  }
}

export class TokenState extends Schema {
  @type('string') id!: string
  @type('string') name!: string
  @type('string') imageUri!: string
  @type('number') counters!: number
  @type('boolean') tapped!: boolean

  constructor(data?: Partial<TokenState>) {
    super()
    this.id = data?.id ?? ''
    this.name = data?.name ?? ''
    this.imageUri = data?.imageUri ?? ''
    this.counters = data?.counters ?? 0
    this.tapped = data?.tapped ?? false
  }
}

export class PlayerState extends Schema {
  @type('string') id: string
  @type('string') sessionId: string
  @type('string') playerId: string
  @type('string') name: string
  @type('string') teamId: string
  @type('number') turnOrder: number
  @type('boolean') ready: boolean
  @type('boolean') connected: boolean
  @type('number') lifeTotal: number
  @type('string') deckId: string
  @type('number') landPlaysThisTurn: number
  @type('number') manaW: number
  @type('number') manaU: number
  @type('number') manaB: number
  @type('number') manaR: number
  @type('number') manaG: number
  @type('number') manaC: number
  @type([CardState]) battlefield: ArraySchema<CardState>
  @type([CardState]) graveyard: ArraySchema<CardState>
  @type([CardState]) exile: ArraySchema<CardState>
  @type([CardState]) command: ArraySchema<CardState>
  @type([TokenState]) tokens: ArraySchema<TokenState>
  @type('number') handCount: number
  @type('number') libraryCount: number
  @type('number') positionX: number
  @type('number') positionY: number

  constructor(data?: Partial<PlayerState>) {
    super()
    this.id = data?.id ?? ''
    this.sessionId = data?.sessionId ?? ''
    this.playerId = data?.playerId ?? ''
    this.name = data?.name ?? ''
    this.teamId = data?.teamId ?? ''
    this.turnOrder = data?.turnOrder ?? 0
    this.ready = data?.ready ?? false
    this.connected = data?.connected ?? true
    this.lifeTotal = data?.lifeTotal ?? 40
    this.deckId = data?.deckId ?? ''
    this.landPlaysThisTurn = 0
    this.manaW = 0
    this.manaU = 0
    this.manaB = 0
    this.manaR = 0
    this.manaG = 0
    this.manaC = 0
    this.battlefield = new ArraySchema<CardState>()
    this.graveyard = new ArraySchema<CardState>()
    this.exile = new ArraySchema<CardState>()
    this.command = new ArraySchema<CardState>()
    this.tokens = new ArraySchema<TokenState>()
    this.handCount = 0
    this.libraryCount = 0
    this.positionX = data?.positionX ?? 0
    this.positionY = data?.positionY ?? 0
  }
}

export class GameState extends Schema {
  @type('string') roomId: string
  @type('string') gameMode: string
  @type('string') status: string
  @type('string') hostId: string
  @type('number') turn: number
  @type('string') activePlayerId: string
  @type('boolean') combatActive: boolean
  @type(['string']) attackers: ArraySchema<string>
  @type(['string']) blockers: ArraySchema<string>
  @type({ map: PlayerState }) players: MapSchema<PlayerState>

  constructor(roomId: string, gameMode: string, hostId: string) {
    super()
    this.roomId = roomId
    this.gameMode = gameMode
    this.status = 'waiting'
    this.hostId = hostId
    this.turn = 1
    this.activePlayerId = ''
    this.combatActive = false
    this.attackers = new ArraySchema<string>()
    this.blockers = new ArraySchema<string>()
    this.players = new MapSchema<PlayerState>()
  }
}
