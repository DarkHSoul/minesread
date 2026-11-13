import { EventEmitter } from 'events'
import TypedEmitter from 'typed-emitter'
import { Client, ClientOptions } from 'minecraft-protocol'
import { Vec3 } from 'vec3'
import { Item } from 'prismarine-item'
import { Window } from 'prismarine-windows'
import { Recipe } from 'prismarine-recipe'
import { Block } from 'prismarine-block'
import { Entity } from 'prismarine-entity'
import { ChatMessage } from 'prismarine-chat'
import { world } from 'prismarine-world'
import { Registry } from 'prismarine-registry'
import { IndexedData } from 'minecraft-data'
import { DragonPhase, EntityState, EntityPart, ExplosionEstimateOptions, ExplosionEstimate, ServerRecipeEntry, ServerRecipeState, AdvancementState } from './lib/observation_types'
export { DragonPhase, EntityState, EntityPart, ExplosionEstimateOptions, ExplosionEstimate, ServerRecipeEntry, ServerRecipeState, AdvancementState } from './lib/observation_types'

export function createBot (options: { client: Client } & Partial<BotOptions>): Bot
export function createBot (options: BotOptions): Bot

export interface BotOptions extends ClientOptions {
  logErrors?: boolean
  hideErrors?: boolean
  loadInternalPlugins?: boolean
  plugins?: PluginOptions
  chat?: ChatLevel
  colorsEnabled?: boolean
  viewDistance?: ViewDistance
  mainHand?: MainHands
  difficulty?: number
  chatLengthLimit?: number
  physicsEnabled?: boolean
  /** @default 4 */
  maxCatchupTicks?: number
  client?: Client
  brand?: string
  defaultChatPatterns?: boolean
  respawn?: boolean
}

export type ChatLevel = 'enabled' | 'commandsOnly' | 'disabled'
export type ViewDistance = 'far' | 'normal' | 'short' | 'tiny' | number
export type MainHands = 'left' | 'right'

export interface PluginOptions {
  [plugin: string]: boolean | Plugin
}

export type Plugin = (bot: Bot, options: BotOptions) => void

export interface EntityDamage {
  entityId: number
  entity: Entity | undefined
  sourceTypeId: number
  /** Namespaced damage type from this connection's registry, if known. */
  sourceType: string | undefined
  /** Actual entity IDs (wire ID + 1 encoding removed), or null. */
  sourceCauseId: number | null
  sourceDirectId: number | null
  sourceCause: Entity | undefined
  sourceDirect: Entity | undefined
  sourcePosition: Vec3 | null
}

export interface BotEvents {
  chat: (
    username: string,
    message: string,
    translate: string | null,
    jsonMsg: ChatMessage,
    matches: string[] | null
  ) => Promise<void> | void
  whisper: (
    username: string,
    message: string,
    translate: string | null,
    jsonMsg: ChatMessage,
    matches: string[] | null
  ) => Promise<void> | void
  actionBar: (jsonMsg: ChatMessage) => Promise<void> | void
  error: (err: Error) => Promise<void> | void
  message: (jsonMsg: ChatMessage, position: string) => Promise<void> | void
  messagestr: (message: string, position: string, jsonMsg: ChatMessage) => Promise<void> | void
  unmatchedMessage: (stringMsg: string, jsonMsg: ChatMessage) => Promise<void> | void
  inject_allowed: () => Promise<void> | void
  login: () => Promise<void> | void
  /** When `respawn` option is disabled, you can call this method manually to respawn. */
  spawn: () => Promise<void> | void
  respawn: () => Promise<void> | void
  game: () => Promise<void> | void
  title: (text: string, type: "subtitle" | "title") => Promise<void> | void
  rain: () => Promise<void> | void
  time: () => Promise<void> | void
  kicked: (reason: string, loggedIn: boolean) => Promise<void> | void
  end: (reason: string) => Promise<void> | void
  spawnReset: () => Promise<void> | void
  death: () => Promise<void> | void
  health: () => Promise<void> | void
  breath: () => Promise<void> | void
  abilities: (abilities: Abilities) => Promise<void> | void
  entitySwingArm: (entity: Entity) => Promise<void> | void
  entityHurt: (entity: Entity | undefined, source?: Entity) => Promise<void> | void
  entityDamage: (damage: EntityDamage) => Promise<void> | void
  entityStateUpdate: (entity: Entity, state: EntityState, previous: EntityState | undefined) => Promise<void> | void
  entityPartsUpdate: (entity: Entity, parts: EntityPart[]) => Promise<void> | void
  serverRecipesUpdated: (packet: unknown) => Promise<void> | void
  serverRecipeAdded: (entry: ServerRecipeEntry) => Promise<void> | void
  serverRecipeRemoved: (displayId: number, entry: ServerRecipeEntry) => Promise<void> | void
  serverRecipeNotification: (entry: ServerRecipeEntry) => Promise<void> | void
  recipeBookSettings: (settings: Record<string, unknown>) => Promise<void> | void
  recipePlacementGhost: (packet: { windowId: number; recipeDisplay?: ServerRecipeEntry['recipe']['display']; recipe?: string }) => Promise<void> | void
  advancementsUpdated: (packet: unknown) => Promise<void> | void
  advancementUpdate: (state: AdvancementState, previousCompleted: boolean | null) => Promise<void> | void
  advancementCompleted: (state: AdvancementState) => Promise<void> | void
  advancementRemoved: (id: string, state: AdvancementState) => Promise<void> | void
  advancementsReset: () => Promise<void> | void
  itemCooldown: (group: string, ticks: number) => Promise<void> | void
  itemCooldownEnd: (group: string) => Promise<void> | void
  chunkBiomesUpdate: (columnCorner: Vec3) => Promise<void> | void
  clientTick: () => Promise<void> | void
  entityDead: (entity: Entity) => Promise<void> | void
  entityTaming: (entity: Entity) => Promise<void> | void
  entityTamed: (entity: Entity) => Promise<void> | void
  entityShakingOffWater: (entity: Entity) => Promise<void> | void
  entityEatingGrass: (entity: Entity) => Promise<void> | void
  entityHandSwap: (entity: Entity) => Promise<void> | void
  entityWake: (entity: Entity) => Promise<void> | void
  entityEat: (entity: Entity) => Promise<void> | void
  entityCriticalEffect: (entity: Entity) => Promise<void> | void
  entityMagicCriticalEffect: (entity: Entity) => Promise<void> | void
  entityCrouch: (entity: Entity) => Promise<void> | void
  entityUncrouch: (entity: Entity) => Promise<void> | void
  entityEquip: (entity: Entity) => Promise<void> | void
  entitySleep: (entity: Entity) => Promise<void> | void
  entitySpawn: (entity: Entity) => Promise<void> | void
  entityElytraFlew: (entity: Entity) => Promise<void> | void
  usedFirework: () => Promise<void> | void
  itemDrop: (entity: Entity) => Promise<void> | void
  playerCollect: (collector: Entity, collected: Entity) => Promise<void> | void
  entityAttributes: (entity: Entity) => Promise<void> | void
  entityGone: (entity: Entity) => Promise<void> | void
  entityMoved: (entity: Entity) => Promise<void> | void
  entityDetach: (entity: Entity, vehicle: Entity) => Promise<void> | void
  entityAttach: (entity: Entity, vehicle: Entity) => Promise<void> | void
  entityUpdate: (entity: Entity) => Promise<void> | void
  entityEffect: (entity: Entity, effect: Effect) => Promise<void> | void
  entityEffectEnd: (entity: Entity, effect: Effect) => Promise<void> | void
  playerJoined: (player: Player) => Promise<void> | void
  playerUpdated: (player: Player) => Promise<void> | void
  playerLeft: (entity: Player) => Promise<void> | void
  blockUpdate: (oldBlock: Block | null, newBlock: Block) => Promise<void> | void
  'blockUpdate:(x, y, z)': (oldBlock: Block | null, newBlock: Block | null) => Promise<void> | void
  blockEntityData: (block: Block | null) => Promise<void> | void
  signOpen: (block: Block | null) => Promise<void> | void
  chunkColumnLoad: (entity: Vec3) => Promise<void> | void
  chunkColumnUnload: (entity: Vec3) => Promise<void> | void
  soundEffectHeard: (
    soundName: string,
    position: Vec3,
    volume: number,
    pitch: number
  ) => Promise<void> | void
  hardcodedSoundEffectHeard: (
    soundId: number,
    soundCategory: number,
    position: Vec3,
    volume: number,
    pitch: number
  ) => Promise<void> | void
  noteHeard: (block: Block, instrument: Instrument, pitch: number) => Promise<void> | void
  pistonMove: (block: Block, isPulling: number, direction: number) => Promise<void> | void
  chestLidMove: (block: Block, isOpen: number, block2: Block | null) => Promise<void> | void
  blockBreakProgressObserved: (block: Block, destroyStage: number) => Promise<void> | void
  blockBreakProgressEnd: (block: Block) => Promise<void> | void
  diggingCompleted: (block: Block) => Promise<void> | void
  diggingAborted: (block: Block) => Promise<void> | void
  move: (position: Vec3) => Promise<void> | void
  forcedMove: () => Promise<void> | void
  mount: () => Promise<void> | void
  dismount: (vehicle: Entity) => Promise<void> | void
  windowOpen: (window: Window) => Promise<void> | void
  windowClose: (window: Window) => Promise<void> | void
  sleep: () => Promise<void> | void
  wake: () => Promise<void> | void
  experience: () => Promise<void> | void
  physicsTick: () => Promise<void> | void
  physicTick: () => Promise<void> | void
  scoreboardCreated: (scoreboard: ScoreBoard) => Promise<void> | void
  scoreboardDeleted: (scoreboard: ScoreBoard) => Promise<void> | void
  scoreboardTitleChanged: (scoreboard: ScoreBoard) => Promise<void> | void
  scoreUpdated: (scoreboard: ScoreBoard, item: number) => Promise<void> | void
  scoreRemoved: (scoreboard: ScoreBoard, item: number) => Promise<void> | void
  scoreboardPosition: (position: DisplaySlot, scoreboard: ScoreBoard) => Promise<void> | void
  teamCreated: (team: Team) => Promise<void> | void
  teamRemoved: (team: Team) => Promise<void> | void
  teamUpdated: (team: Team) => Promise<void> | void
  teamMemberAdded: (team: Team) => Promise<void> | void
  teamMemberRemoved: (team: Team) => Promise<void> | void
  bossBarCreated: (bossBar: BossBar) => Promise<void> | void
  bossBarDeleted: (bossBar: BossBar) => Promise<void> | void
  bossBarUpdated: (bossBar: BossBar) => Promise<void> | void
  resourcePack: (url: string, hash?: string, uuid?: string) => Promise<void> | void
  heldItemChanged: (newItem: Item | null) => Promise<void> | void
  particle: (particle: Particle) => Promise<void> | void
}

export interface CommandBlockOptions {
  mode: number,
  trackOutput: boolean,
  conditional: boolean,
  alwaysActive: boolean
}

export interface Bot extends TypedEmitter<BotEvents> {
  username: string
  protocolVersion: string
  majorVersion: string
  version: string
  entity: Entity
  entities: { [id: string]: Entity }
  entityParts: Map<number, EntityPart[]>
  getEntityMetadata(entity: Entity | number): Record<string, unknown> | undefined
  getEntityState(entity: Entity | number): EntityState | undefined
  getDragonPhase(entity: Entity | number): DragonPhase | undefined
  getEntityParts(entity: Entity | number): EntityPart[]
  getAttackStrengthDelay(): number | null
  getAttackStrengthScale(partialTick?: number): number | null
  getItemSwapScale(partialTick?: number): number | null
  getAttackCooldownTicks(): number | null
  getExplosionDamageEstimate(target: Entity, source: Vec3, power: number, options?: ExplosionEstimateOptions): ExplosionEstimate
  serverRecipes: ServerRecipeState
  getServerRecipe(displayId: number): ServerRecipeEntry | null
  getServerRecipes(): ServerRecipeEntry[]
  advancements: Map<string, AdvancementState>
  getAdvancement(id: string): AdvancementState | null
  getAdvancements(): AdvancementState[]
  isAdvancementDone(id: string): boolean | null
  fireworkRocketDuration: number
  spawnPoint: Vec3
  game: GameState
  player: Player
  players: { [username: string]: Player }
  isRaining: boolean
  thunderState: number
  chatPatterns: ChatPattern[]
  settings: GameSettings
  experience: Experience
  health: number
  food: number
  foodSaturation: number
  oxygenLevel: number
  physics: PhysicsOptions
  physicsEnabled: boolean
  abilities: Abilities
  time: Time
  quickBarSlot: number
  inventory: Window<StorageEvents>
  targetDigBlock: Block
  isSleeping: boolean
  scoreboards: { [name: string]: ScoreBoard }
  scoreboard: { [slot in DisplaySlot]: ScoreBoard }
  teams: { [name: string]: Team }
  teamMap: { [name: string]: Team }
  controlState: ControlStateStatus
  creative: creativeMethods
  world: world.WorldSync
  _client: Client
  heldItem: Item | null
  /** Cooldown group or legacy item:<id> key; null for an absent item. */
  getItemCooldownGroup(item: Item | string | number | null): string | null
  /** Remaining client ticks; pass a group identifier or an Item with its components. */
  getItemCooldown(item: Item | string | number | null): number
  usingHeldItem: boolean
  currentWindow: Window | null
  simpleClick: simpleClick
  tablist: Tablist
  registry: Registry

  connect: (options: BotOptions) => void

  supportFeature: IndexedData['supportFeature']

  end: (reason?: string) => void

  blockAt: (point: Vec3, extraInfos?: boolean) => Block | null

  blockInSight: (maxSteps: number, vectorLength: number) => Block | null

  blockAtCursor: (maxDistance?: number, matcher?: Function) => Block | null
  blockAtEntityCursor: (entity?: Entity, maxDistance?: number, matcher?: Function) => Block | null

  canSeeBlock: (block: Block) => boolean

  findBlock: (options: FindBlockOptions) => Block | null

  findBlocks: (options: FindBlockOptions) => Vec3[]

  canDigBlock: (block: Block) => boolean

  recipesFor: (
    itemType: number,
    metadata: number | null,
    minResultCount: number | null,
    craftingTable: Block | boolean | null
  ) => Recipe[]

  recipesAll: (
    itemType: number,
    metadata: number | null,
    craftingTable: Block | boolean | null
  ) => Recipe[]

  quit: (reason?: string) => void

  tabComplete: (
    str: string,
    assumeCommand?: boolean,
    sendBlockInSight?: boolean,
    timeout?: number
  ) => Promise<string[]>

  chat: (message: string) => void

  whisper: (username: string, message: string) => void

  chatAddPattern: (pattern: RegExp, chatType: string, description?: string) => number

  setSettings: (options: Partial<GameSettings>) => void

  loadPlugin: (plugin: Plugin) => void

  loadPlugins: (plugins: Plugin[]) => void

  hasPlugin: (plugin: Plugin) => boolean

  sleep: (bedBlock: Block) => Promise<void>

  isABed: (bedBlock: Block) => boolean

  wake: () => Promise<void>

  elytraFly: () => Promise<void>

  setControlState: (control: ControlState, state: boolean) => void

  getControlState: (control: ControlState) => boolean

  clearControlStates: () => void

  getExplosionDamages: (targetEntity: Entity, position: Vec3, radius: number, rawDamages?: boolean) => number | null

  lookAt: (point: Vec3, force?: boolean) => Promise<void>

  look: (
    yaw: number,
    pitch: number,
    force?: boolean
  ) => Promise<void>

  updateSign: (block: Block, text: string, back?: boolean) => void

  equip: (
    item: Item | number,
    destination: EquipmentDestination | null
  ) => Promise<void>

  unequip: (
    destination: EquipmentDestination | null
  ) => Promise<void>

  tossStack: (item: Item) => Promise<void>

  toss: (
    itemType: number,
    metadata: number | null,
    count: number | null
  ) => Promise<void>

  dig: ((block: Block, forceLook?: boolean | 'ignore') => Promise<void>) & ((block: Block, forceLook: boolean | 'ignore', digFace: 'auto' | Vec3 | 'raycast') => Promise<void>)

  stopDigging: () => void

  digTime: (block: Block) => number

  placeBlock: (referenceBlock: Block, faceVector: Vec3) => Promise<void>

  placeEntity: (referenceBlock: Block, faceVector: Vec3) => Promise<Entity>

  activateBlock: (block: Block, direction?: Vec3, cursorPos?: Vec3) => Promise<void>

  activateEntity: (entity: Entity) => Promise<void>

  activateEntityAt: (entity: Entity, position: Vec3) => Promise<void>

  consume: () => Promise<void>

  fish: () => Promise<void>

  activateItem: (offhand?: boolean) => void

  deactivateItem: () => void

  useOn: (targetEntity: Entity) => void

  attack: (entity: Entity | EntityPart, swing?: boolean) => void

  swingArm: (hand: 'left' | 'right' | undefined, showHand?: boolean) => void

  mount: (entity: Entity) => void

  dismount: () => void

  moveVehicle: (left: number, forward: number) => void

  setQuickBarSlot: (slot: number) => void

  craft: (
    recipe: Recipe,
    count?: number,
    craftingTable?: Block
  ) => Promise<void>

  /** Request placement from the server recipe book; does not guarantee placement or craft the output. */
  requestRecipePlacement: (displayId: number, makeAll?: boolean) => void

  writeBook: (
    slot: number,
    pages: string[]
  ) => Promise<void>

  openContainer: (chest: Block | Entity, direction?: Vec3, cursorPos?: Vec3) => Promise<Chest | Dispenser>

  openChest: (chest: Block | Entity, direction?: number, cursorPos?: Vec3) => Promise<Chest>

  openFurnace: (furnace: Block) => Promise<Furnace>

  openDispenser: (dispenser: Block) => Promise<Dispenser>

  openEnchantmentTable: (enchantmentTable: Block) => Promise<EnchantmentTable>

  openAnvil: (anvil: Block) => Promise<Anvil>

  openVillager: (
    villager: Entity
  ) => Promise<Villager>

  trade: (
    villagerInstance: Villager,
    tradeIndex: string | number,
    times?: number
  ) => Promise<void>



  setCommandBlock: (pos: Vec3, command: string, options: CommandBlockOptions) => void

  clickWindow: (
    slot: number,
    mouseButton: number,
    mode: number
  ) => Promise<void>

  putSelectedItemRange: (
    start: number,
    end: number,
    window: Window,
    slot: any
  ) => Promise<void>

  putAway: (slot: number) => Promise<void>

  closeWindow: (window: Window) => Promise<void>

  transfer: (options: TransferOptions) => Promise<void>

  openBlock: (block: Block, direction?: Vec3, cursorPos?: Vec3) => Promise<Window>

  openEntity: (block: Entity, Class: new () => EventEmitter) => Promise<Window>

  moveSlotItem: (
    sourceSlot: number,
    destSlot: number
  ) => Promise<void>

  updateHeldItem: () => void

  getEquipmentDestSlot: (destination: string) => number

  waitForChunksToLoad: () => Promise<void>

  entityAtCursor: (maxDistance?: number) => Entity | null
  /** Uses reconstructed, explicitly approximate dragon hitboxes. */
  entityPartAtCursor: (maxDistance?: number) => EntityPart | null
  nearestEntity: (filter?: (entity: Entity) => boolean) => Entity | null

  waitForTicks: (ticks: number) => Promise<void>

  addChatPattern: (name: string, pattern: RegExp, options?: chatPatternOptions) => number

  addChatPatternSet: (name: string, patterns: RegExp[], options?: chatPatternOptions) => number

  removeChatPattern: (name: string | number) => void

  awaitMessage: (...args: string[] | RegExp[]) => Promise<string>

  acceptResourcePack: () => void

  denyResourcePack: () => void

  respawn: () => void
}

export interface simpleClick {
  leftMouse: (slot: number) => Promise<void>
  rightMouse: (slot: number) => Promise<void>
}

export interface Tablist {
  header: ChatMessage
  footer: ChatMessage
}

export interface chatPatternOptions {
  repeat: boolean
  parse: boolean
}

export interface GameState {
  levelType: LevelType
  gameMode: GameMode
  hardcore: boolean
  dimension: Dimension
  difficulty: Difficulty
  maxPlayers: number
  serverBrand: string
}

export type LevelType =
  | 'default'
  | 'flat'
  | 'largeBiomes'
  | 'amplified'
  | 'customized'
  | 'buffet'
  | 'default_1_1'
export type GameMode = 'survival' | 'creative' | 'adventure' | 'spectator'
export type Dimension = 'the_nether' | 'overworld' | 'the_end'
export type Difficulty = 'peaceful' | 'easy' | 'normal' | 'hard'

export interface Player {
  uuid: string
  username: string
  displayName: ChatMessage
  gamemode: number
  ping: number
  entity: Entity
  skinData: SkinData | undefined
  profileKeys?: {
    publicKey: Buffer
    signature: Buffer
  }
}

export interface SkinData {
  url: string
  model: string | null
  capeUrl?: string
}

export interface ChatPattern {
  pattern: RegExp
  type: string
  description: string
}

export interface SkinParts {
  showCape: boolean
  showJacket: boolean
  showLeftSleeve: boolean
  showRightSleeve: boolean
  showLeftPants: boolean
  showRightPants: boolean
  showHat: boolean
}

export interface GameSettings {
  chat: ChatLevel
  colorsEnabled: boolean
  viewDistance: ViewDistance
  difficulty: number
  skinParts: SkinParts
  mainHand: MainHands
}

export interface Experience {
  level: number
  points: number
  progress: number
}

export interface Abilities {
  invulnerable: boolean
  flying: boolean
  mayFly: boolean
  instantBuild: boolean
  flyingSpeed: number
  walkingSpeed: number
}

export interface PhysicsOptions {
  maxGroundSpeed: number
  terminalVelocity: number
  walkingAcceleration: number
  gravity: number
  groundFriction: number
  playerApothem: number
  playerHeight: number
  jumpSpeed: number
  yawSpeed: number
  pitchSpeed: number
  sprintSpeed: number
  maxGroundSpeedSoulSand: number
  maxGroundSpeedWater: number
}

export interface Time {
  doDaylightCycle: boolean
  bigTime: BigInt
  time: number
  timeOfDay: number
  day: number
  isDay: boolean
  moonPhase: number
  bigAge: BigInt
  age: number
}

export interface ControlStateStatus {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
  jump: boolean
  sprint: boolean
  sneak: boolean
}

export type ControlState =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'jump'
  | 'sprint'
  | 'sneak'

export interface Effect {
  id: number
  amplifier: number
  duration: number
}

export interface Instrument {
  id: number
  name: 'harp' | 'doubleBass' | 'snareDrum' | 'sticks' | 'bassDrum'
}

export interface FindBlockOptions {
  point?: Vec3
  matching: number | number[] | ((block: Block) => boolean)
  maxDistance?: number
  count?: number
  useExtraInfo?: boolean | ((block: Block) => boolean)
}

export type EquipmentDestination = 'hand' | 'head' | 'torso' | 'legs' | 'feet' | 'off-hand'

export interface TransferOptions {
  window: Window
  itemType: number
  metadata: number | null
  count?: number,
  sourceStart: number
  sourceEnd: number
  destStart: number
  destEnd: number
  /** Additional source-stack predicate, for example merchant component requirements. */
  itemMatcher?: (item: Item) => boolean
}

export interface creativeMethods {
  setInventorySlot: (
    slot: number,
    item: Item | null
  ) => Promise<void>

  clearSlot: (slot: number) => Promise<void>

  clearInventory: () => Promise<void>

  flyTo: (destination: Vec3) => Promise<void>

  startFlying: () => void

  stopFlying: () => void
}

export class Location {
  floored: Vec3
  blockPoint: Vec3
  chunkCorner: Vec3
  blockIndex: number
  biomeBlockIndex: number
  chunkYIndex: number

  constructor (absoluteVector: Vec3);
}

export class Painting {
  id: number
  position: Vec3
  name: string
  direction: Vec3

  constructor (id: number, position: Vec3, name: string, direction: Vec3);
}

interface StorageEvents {
  open: () => void
  close: () => void
  updateSlot: (slot: number, oldItem: Item | null, newItem: Item | null) => void
}

interface FurnaceEvents extends StorageEvents {
  update: () => void
}

interface ConditionalStorageEvents extends StorageEvents {
  ready: () => void
}

export class Chest extends Window<StorageEvents> {
  constructor ();

  close (): Promise<void>;

  deposit (
    itemType: number,
    metadata: number | null,
    count: number | null
  ): Promise<void>;

  withdraw (
    itemType: number,
    metadata: number | null,
    count: number | null
  ): Promise<void>;
}

export class Furnace extends Window<FurnaceEvents> {
  fuel: number
  progress: number

  constructor ();

  close (): Promise<void>;

  takeInput (): Promise<Item>;

  takeFuel (): Promise<Item>;

  takeOutput (): Promise<Item>;

  putInput (
    itemType: number,
    metadata: number | null,
    count: number
  ): Promise<void>;

  putFuel (
    itemType: number,
    metadata: number | null,
    count: number
  ): Promise<void>;

  inputItem (): Item;

  fuelItem (): Item;

  outputItem (): Item;
}

export class Dispenser extends Window<StorageEvents> {
  constructor ();

  close (): Promise<void>;

  deposit (
    itemType: number,
    metadata: number | null,
    count: number | null
  ): Promise<void>;

  withdraw (
    itemType: number,
    metadata: number | null,
    count: number | null
  ): Promise<void>;
}

export class EnchantmentTable extends Window<ConditionalStorageEvents> {
  enchantments: Enchantment[]

  constructor ();

  close (): Promise<void>;

  targetItem (): Item;

  enchant (
    choice: string | number
  ): Promise<Item>;

  takeTargetItem (): Promise<Item>;

  putTargetItem (item: Item): Promise<Item>;

  putLapis (item: Item): Promise<Item>;
}

export class Anvil {
  combine (itemOne: Item, itemTwo: Item, name?: string): Promise<void>
  rename (item: Item, name?: string): Promise<void>
}

export interface Enchantment {
  level: number
  expected: { enchant: number, level: number }
}

interface VillagerEvents extends ConditionalStorageEvents {
  tradesUpdated: (trades: VillagerTrade[]) => void
}

export class Villager extends Window<VillagerEvents> {
  trades: VillagerTrade[]
  selectedTrade: VillagerTrade | null
  villagerLevel?: number
  experience?: number
  isRegularVillager?: boolean
  canRestock?: boolean

  constructor ();

  close (): Promise<void>;
  trade (index: string | number, count?: number): Promise<void>;
}

export interface VillagerTrade {
  inputs: Item[]
  outputs: Item[]
  inputItem1: Item
  outputItem: Item
  inputItem2: Item | null
  hasItem2: boolean
  tradeDisabled: boolean
  nbTradeUses: number
  maximumNbTradeUses: number
  xp?: number
  specialPrice?: number
  priceMultiplier?: number
  demand?: number
  realPrice?: number
}

export class ScoreBoard {
  name: string
  title: ChatMessage
  itemsMap: { [name: string]: ScoreBoardItem }
  items: ScoreBoardItem[]

  constructor (packet: object);

  setTitle (title: string | object): void;

  add(name: string, value: number, display?: string | object): ScoreBoardItem;

  remove (name: string): ScoreBoardItem;
}

export interface ScoreBoardItem {
  name: string
  displayName: ChatMessage
  value: number
}

export class Team {
  team: string
  name: ChatMessage
  friendlyFire: number
  nameTagVisibility: string
  collisionRule: string
  color: string
  prefix: ChatMessage
  suffix: ChatMessage
  memberMap: { [name: string]: '' }
  members: string[]

  constructor(team: string, name: string, friendlyFire: boolean, nameTagVisibility: string, collisionRule: string, formatting: number, prefix: string, suffix: string);

  parseMessage (value: string): ChatMessage;

  add (name: string, value: number): void;

  remove (name: string): void;

  update (name: string, friendlyFire: boolean, nameTagVisibility: string, collisionRule: string, formatting: number, prefix: string, suffix: string): void;

  displayName (member: string): ChatMessage;
}

export type DisplaySlot =
  | 'list'
  | 'sidebar'
  | 'belowName'
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18

export class BossBar {
  entityUUID: string
  title: ChatMessage
  health: number
  dividers: number
  color: 'pink' | 'blue' | 'red' | 'green' | 'yellow' | 'purple' | 'white'
  shouldDarkenSky: boolean
  isDragonBar: boolean
  createFog: boolean
  shouldCreateFog: boolean

  constructor (
    uuid: string,
    title: string,
    health: number,
    dividers: number,
    color: number,
    flags: number
  );
}

export class Particle {
  id: number
  position: Vec3
  offset: Vec3
  count: number
  movementSpeed: number
  longDistanceRender: boolean
  static fromNetwork(packet: Object): Particle

  constructor(
    id: number,
    position: Vec3,
    offset: Vec3,
    count?: number,
    movementSpeed?: number,
    longDistanceRender?: boolean
  );
}

export let testedVersions: string[]
export let latestSupportedVersion: string
export let oldestSupportedVersion: string

export function supportFeature (feature: string, version: string): boolean
