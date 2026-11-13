import { Entity } from 'prismarine-entity'
import { Vec3 } from 'vec3'

export interface DragonPhase { id: number; name: string | undefined }
export interface EntityState {
  metadata: Record<string, unknown>
  health?: number
  pose?: number
  sharedFlags?: number
  shiftKeyDown?: boolean
  onFire?: boolean
  crouching?: boolean
  sprinting?: boolean
  swimming?: boolean
  invisible?: boolean
  glowing?: boolean
  fallFlying?: boolean
  ticksFrozen?: number
  frozen?: boolean
  fullyFrozen?: boolean
  creeper?: { swellDirection?: number; powered?: boolean; ignited?: boolean }
  blaze?: { charged?: boolean }
  enderman?: { creepy?: boolean; staredAt?: boolean }
  dragonPhase?: DragonPhase
}
export interface EntityPart {
  id: number
  name: string
  partIndex: number
  parent: Entity
  type: string
  width: number
  height: number
  position: Vec3 | null
  initialized: boolean
  confidence: 'uninitialized' | 'approximate'
  historyComplete: boolean
  approximation?: string
}
export interface ExplosionEstimateOptions {
  exposure?: number
  rayClear?: (sample: Vec3, source: Vec3, target: Entity) => boolean | null
  armor?: number
  toughness?: number
  protection?: number
  resistanceAmplifier?: number
  standardExplosion?: boolean
  scalesWithDifficulty?: boolean
  difficulty?: 'peaceful' | 'easy' | 'normal' | 'hard'
  absorption?: number
  raw?: boolean
}
export interface ExplosionEstimate {
  rawDamage: number | null
  damage: number | null
  healthDamage: number | null
  reasons: string[]
}
export interface ServerRecipeEntry {
  recipe: {
    displayId: number
    display: { type: string; data?: unknown }
    group: number
    category: string
    craftingRequirements?: { name?: string; ids?: number[] }[]
    [key: string]: unknown
  }
  flags: { notification?: boolean; highlight?: boolean; [key: string]: boolean | undefined }
  [key: string]: unknown
}
export interface ServerRecipeState {
  displays: Map<number, ServerRecipeEntry>
  properties: Map<string, number[]>
  stonecutterRecipes: unknown[]
  bookSettings: Record<string, unknown> | null
  highlighted: Set<number>
  /** True only after the modern declare_recipes property snapshot. */
  received: boolean
}
export interface AdvancementState {
  id: string
  definition: {
    key: string
    value: { parentId?: string; requirements?: string[][]; displayData?: unknown; [key: string]: unknown }
    x?: number
    y?: number
    [key: string]: unknown
  } | null
  progress: { criterionIdentifier: string; criterionProgress?: unknown; [key: string]: unknown }[] | null
  completed: boolean | null
}
