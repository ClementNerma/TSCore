/**
 * @file Core library for pattern-matching and base matchable types
 */

/**
 * Get the key types of an union type
 * @template T Union type
 * @example KeyOfUnion<{ Some: number } | { None: void }> <=> "Some" | "None"
 */
export type KeyOfUnion<T extends object> = T extends any ? keyof T : never

/**
 * Get the value types of an union type
 * @template T Union type
 * @example ValOfUnion<{ Some: number } | { None: void }> <=> number | void
 */
export type ValOfUnion<T extends object> = T extends any ? T[keyof T] : never

/**
 * Get the value type of an union type's specific key
 * @example ValOfKeyOfUnion<{ Some: number } | { None: void }, "Some"> <=> number
 * @example ValOfKeyOfUnion<{ Some: number } | { None: void }, "None"> <=> void
 */
export type ValOfKeyOfUnion<T extends object, K> = T extends any
  ? K extends keyof T
    ? T[K]
    : never
  : never

/**
 * Get all void states of a matchable
 * @example VoidStates<{ Some: number } | { None: void }> <=> "None"
 */
export type VoidStates<T extends object> = T extends any
  ? T[keyof T] extends void | undefined
    ? keyof T
    : never
  : never

/**
 * Matchable type
 * @template T State type
 */
export abstract class AbstractMatchable<T extends object> {
  /** State getter */
  protected readonly __getState: () => T

  /**
   * Instantiate the matchable
   * @param getState State getter
   */
  protected constructor(getState: () => T) {
    this.__getState = getState
  }

  /**
   * Get the state
   * @private
   */
  _getState(): T {
    const state = this.__getState()
    return { [Object.keys(state)[0] as string]: Object.values(state)[0] } as T
  }

  /**
   * Get the state's name
   * @private
   */
  _getStateName(): KeyOfUnion<T> {
    return Object.keys(this.__getState())[0] as any
  }

  /**
   * Get the state's value
   * @private
   */
  _getStateValue(): ValOfUnion<T> {
    return Object.values(this.__getState())[0] as any
  }

  /**
   * Match this matchable with patterns
   * @param patterns
   */
  match<U>(patterns: MatchPatterns<T, U>): U {
    return matchState(this.__getState(), patterns)
  }
}

/**
 * Match patterns
 * @template T State type
 * @template U Type returned by the patterns
 */
export type MatchPatterns<T extends object, U> =
  | MatchPatternsCovering<T, U>
  | MatchPatternsWithFallback<T, U>

/**
 * Covering match patterns (one callback per possible state)
 * @template T State type
 * @template U Type returned by the patterns
 */
export type MatchPatternsCovering<T extends object, U> = {
  [K in KeyOfUnion<T>]: (value: ValOfKeyOfUnion<T, K>) => U
}

/**
 * Match patterns with callback (optional callback for possible states, one fallback callback for unhandled states)
 * @template T State type
 * @template U Type returned by the patterns
 */
export type MatchPatternsWithFallback<T extends object, U> = {
  [K in KeyOfUnion<T>]?: (value: ValOfKeyOfUnion<T, K>) => U
} & {
  _: (value: ValOfUnion<T>, stateName: KeyOfUnion<T>) => U
}

/**
 * Matchable state
 * @template N State name
 * @template V State value (default: 'void')
 */
export type State<N extends string, V = void> = { readonly [K in N]: V }

/**
 * Simple matchable type
 * @template T State type
 */
export class Matchable<T extends object> extends AbstractMatchable<T> {
  /** Matchable's state */
  protected _state: T

  /**
   * Instantiate the matchable
   * @param state Initial state
   */
  constructor(state: T) {
    super(() => this._state)
    this._state = state
  }
}

/**
 * Mapped matchable that generates its state using underlying data
 * @template T State type
 * @template H Underlying state (from which the state is generated)
 */
export abstract class MappedMatchable<
  T extends object,
  H extends object
> extends AbstractMatchable<T> {
  /** Underlying state */
  protected _under: H

  /**
   * Instantiate the matchable
   * @param state Initial state
   * @param getState State getter
   */
  protected constructor(state: H, getState: () => T) {
    super(getState)
    this._under = state
  }

  /**
   * Pattern-match the underlying state with patterns
   * @param patterns
   */
  protected _matchUnder<U>(patterns: MatchPatterns<H, U>): U {
    return matchState(this._under, patterns)
  }
}

/**
 * Matchable with empty states
 * @example MatchableString<"StateA" | "StateB">
 */
export class Enum<S extends string> extends Matchable<State<S>> {
  /**
   * Instantiate a matchable using a full state or just the state's name
   * @param stateOrName The state's name
   */
  constructor(stateOrName: State<S> | S) {
    super(typeof stateOrName === "string" ? state(stateOrName as any) : stateOrName)
  }

  /**
   * Check if a state or enum variant's name is a variant of this enum class
   * @param stateOrName
   */
  isVariant(stateOrName: State<S> | S): boolean {
    return typeof stateOrName === "string"
      ? this._getStateName() === stateOrName
      : this._getStateName() === Object.keys(state)[0]
  }

  /**
   * Replace this value with another state or enum variant's name
   * @param stateOrName
   */
  replace(stateOrName: State<S> | S) {
    this._state = typeof stateOrName === "string" ? state(stateOrName as any) : stateOrName
  }

  /**
   * Cast this value to a broader enumeratino type
   */
  into<U extends string>(): Enum<S | U> {
    return new Enum<S | U>(this._getStateName())
  }

  /**
   * Create an enumeration variant from its state or name
   * @param stateOrName
   */
  static make<S extends string>(stateOrName: State<S> | S): Enum<S> {
    return new Enum(stateOrName)
  }
}

/**
 * Check if match patterns have a fallback
 * @param patterns
 */
export function havePatternsFallback<T extends object, U>(
  patterns: MatchPatterns<T, U>
): patterns is MatchPatternsWithFallback<T, U> {
  return patterns.hasOwnProperty("_")
}

/**
 * Get the name of a matchable's state
 * @param matchable
 */
export function getStateName<T extends object>(matchable: AbstractMatchable<T>): KeyOfUnion<T> {
  return matchable._getStateName()
}

/**
 * Check if a matchable has a given state
 * @param matchable
 * @param states Multiple states can be provided for multiple checking
 */
export function hasState<T extends object>(
  matchable: AbstractMatchable<T>,
  ...states: Array<KeyOfUnion<T>>
): boolean {
  return states.includes(getStateName(matchable))
}

/**
 * Create a 'void' state object
 * @param name State's name
 */
export function state<T extends object, K extends VoidStates<T>>(name: K): T

/**
 * Create a state object
 * @param name State's name
 * @param value State's value
 */
export function state<T extends object, K extends KeyOfUnion<T>>(
  name: K,
  value: ValOfKeyOfUnion<T, K>
): T
export function state<T extends object, K extends KeyOfUnion<T>>(
  name: K,
  value?: ValOfKeyOfUnion<T, K>
): T {
  return { [name]: value } as T
}

/**
 * Create a matchable string instance, used for Enum<> types
 * The double template is a trick to avoid having to use the `.into()` method
 * @param name
 */
export function enumStr<K extends string, U extends string>(name: K): Enum<K | U> {
  return new Enum<K | U>(name)
}

/**
 * Pattern-match a matchable object
 * @param matchable
 * @param patterns
 */
export function match<T extends object, U>(
  matchable: AbstractMatchable<T>,
  patterns: MatchPatterns<T, U>
): U {
  return matchable.match(patterns)
}

/**
 * Pattern-match a matchable's state
 * @param state
 * @param patterns
 */
export function matchState<T extends object, U>(state: T, patterns: MatchPatterns<T, U>): U {
  let stateName: keyof T = null as any

  for (const key in state) stateName = key

  if (havePatternsFallback(patterns)) {
    if (patterns.hasOwnProperty(stateName)) {
      return (patterns[stateName as keyof typeof patterns] as (value: unknown) => U)(
        state[stateName]
      )
    } else {
      return patterns._(state[stateName] as ValOfUnion<T>, stateName as KeyOfUnion<T>)
    }
  }

  return patterns[stateName as keyof typeof patterns](
    (state[stateName] as unknown) as ValOfKeyOfUnion<T, KeyOfUnion<T>>
  )
}

/**
 * Pattern-match a string
 * @param str
 * @param patterns
 */
export function matchString<S extends string, U>(
  str: S,
  patterns: MatchPatterns<{ [key in S]: void }, U>
): U {
  return matchState({ [str]: undefined } as { [key in S]: void }, patterns)
}
