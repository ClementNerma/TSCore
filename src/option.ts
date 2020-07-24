import { panic } from './env'
import { AbstractMatchable, KeyOfUnion, State, ValOfKeyOfUnion, state } from './match'
import { O } from './objects'
import { Err, Ok, Result } from './result'
import { forceType } from './typecasting'

export type OptMatch<T> = State<"Some", T> | State<"None">

abstract class OptionClass<T> extends AbstractMatchable<OptMatch<T>> {
    /**
     * Create a new optional value
     */
    constructor() {
        super(() => (this.isSome() ? state("Some", this.inner) : state("None")))
    }

    /**
     * Is this option concrete?
     */
    abstract isSome(): this is SomeValue<T>

    /**
     * Is this option 'None'?
     */
    abstract isNone(): this is NoneValue<T>

    /**
     * Run a callback if this option is concrete
     * @param callback
     */
    abstract some(callback: (data: T) => void): this

    /**
     * Run a callback if this option is a 'None' value
     * @param callback
     */
    abstract none(callback: () => void): this

    /**
     * Convert this value to a native one ('undefined' if this option is a 'None' value)
     */
    abstract toNative(): T | undefined

    /**
     * Expect this option to be concrete
     * Panics if it isn't
     * @param message Panic message
     */
    abstract expect(message: string): T

    /**
     * Expect this option to be 'None'
     * Panics if it isn't
     * @param message Panic message
     */
    abstract expectNone(message: string): void

    /**
     * Unwrap this option's concrete value
     * Panics if the option is not concrete
     */
    abstract unwrap(): T

    /**
     * Unwrap this option's concrete value
     * @param fallback Fallback value in case this option is 'None'
     */
    abstract unwrapOr(fallback: T): T

    /**
     * Unwrap this option' concrete value
     * @param fallback Fallback function in case this option is 'None'
     */
    abstract unwrapOrElse(fallback: () => T): T

    /**
     * Map this option's concrete value
     * @param mapper Mapping function
     */
    abstract map<U>(mapper: (value: T) => U): Option<U>

    /**
     * Map this option's concrete value
     * @param mapper Mapping function
     * @param fallback Fallback function in case this option is 'None'
     */
    abstract mapOr<U>(mapper: (value: T) => U, fallback: U): U

    /**
     * Map this option's concrete value
     * @param mapper Mapping function
     * @param fallback Fallback function in case this option is 'None'
     */
    abstract mapOrElse<U>(mapper: (value: T) => U, fallback: () => U): U

    /**
     * Expect this option and another to be concrete
     * @param other Another option
     */
    abstract and<U>(other: Option<U>): Option<U>

    /**
     * Run a callback in case this option is a success
     * @param mapper A callback returning a new option from this one's concrete value
     */
    abstract andThen<U>(mapper: (value: T) => Option<U>): Option<U>

    /**
     * Create a 'Some' or 'None' value depending on this option's concreteness
     * @param predicate Predicate
     */
    abstract filter(predicate: (value: T) => boolean): Option<T>

    /**
     * Expect one of this option and another to be concrete
     * @param other Another option
     */
    abstract or(other: Option<T>): Option<T>

    /**
     * Expect one of this option and another to be concrete
     * @param other Function generating an option
     */
    abstract orElse(other: () => Option<T>): Option<T>

    /**
     * Expect exactly one of this option and another to be concrete
     * @param other Another option
     */
    abstract xor(other: Option<T>): Option<T>

    /**
     * Turn the option into a result
     * @param fallbackError The error result to use if the option is not concrete
     */
    abstract okOr<U>(fallbackError: U): Result<T, U>

    /**
     * Turn the option into a result
     * @param fallbackError The error callback to use if the option is not concrete
     */
    abstract okOrElse<U>(fallbackError: () => U): Result<T, U>

    /**
     * Turn the option into a boolean value
     * @param cond The condition function
     * @param fallback The boolean value to return if the option is a 'None'
     */
    abstract condition(cond: (value: T) => boolean, fallback?: boolean): boolean

    /**
     * Clone this option
     */
    abstract clone(): Option<T>

    /**
     * Convert this value to a nullable one
     */
    abstract toNullable(): T | null

    /**
     * Cast this option's inner value to a parent type
     * If the provided type is not a parent of the inner value's one, the option will be returned but typechecking will fail
     */
    abstract cast<U>(): T extends U ? Option<U> : never

    /**
     * Extend this option to allow another type to be part of it
     */
    abstract extend<U>(): Option<T | U>
}

/**
 * Concrete value
 */
class SomeValue<T> extends OptionClass<T> {
    constructor(readonly inner: T) {
        super()
    }

    isSome(): this is SomeValue<T> {
        return true
    }

    isNone(): this is NoneValue<T> {
        return false
    }

    some(callback: (data: T) => void): this {
        callback(this.inner)
        return this
    }

    none(callback: () => void): this {
        return this
    }

    toNative(): T | undefined {
        return this.inner
    }

    expect(message: string): T {
        return this.inner
    }

    expectNone(message: string): void {
        panic(message)
    }

    unwrap(): T {
        return this.inner
    }

    unwrapOr(fallback: T): T {
        return this.inner
    }

    unwrapOrElse(fallback: () => T): T {
        return this.inner
    }

    map<U>(mapper: (value: T) => U): Option<U> {
        return Some(mapper(this.inner))
    }

    mapOr<U>(mapper: (value: T) => U, fallback: U): U {
        return mapper(this.inner)
    }

    mapOrElse<U>(mapper: (value: T) => U, fallback: () => U): U {
        return mapper(this.inner)
    }

    and<U>(other: Option<U>): Option<U> {
        return other
    }

    andThen<U>(mapper: (value: T) => Option<U>): Option<U> {
        return mapper(this.inner)
    }

    filter(predicate: (value: T) => boolean): Option<T> {
        return predicate(this.inner) ? this : None()
    }

    or(other: Option<T>): Option<T> {
        return this
    }

    orElse(other: () => Option<T>): Option<T> {
        return this
    }

    xor(other: Option<T>): Option<T> {
        return other.isNone() ? this : None()
    }

    okOr<U>(fallbackError: U): Result<T, U> {
        return Ok(this.inner)
    }

    okOrElse<U>(fallbackError: () => U): Result<T, U> {
        return Ok(this.inner)
    }

    condition(cond: (value: T) => boolean, fallback: boolean): boolean {
        return cond(this.inner)
    }

    clone(): Option<T> {
        return Some(this.inner)
    }

    toNullable(): T | null {
        return this.inner
    }

    cast<U>(): T extends U ? Option<U> : never {
        return forceType(this)
    }

    extend<U>(): Option<T | U> {
        return this
    }
}

/**
 * Empty value
 */
class NoneValue<T> extends OptionClass<T> {
    readonly beNone = true

    constructor() {
        super()
    }

    isSome(): this is SomeValue<T> {
        return false
    }

    isNone(): this is NoneValue<T> {
        return true
    }

    some(callback: (data: T) => void): this {
        return this
    }

    none(callback: () => void): this {
        callback()
        return this
    }

    toNative(): T | undefined {
        return undefined
    }

    expect(message: string): T {
        panic(message)
    }

    expectNone(message: string): void {}

    unwrap(): T {
        return panic("Tried to unwrap a None() value!")
    }

    unwrapOr(fallback: T): T {
        return fallback
    }

    unwrapOrElse(fallback: () => T): T {
        return fallback()
    }

    map<U>(mapper: (value: T) => U): Option<U> {
        return None()
    }

    mapOr<U>(mapper: (value: T) => U, fallback: U): U {
        return fallback
    }

    mapOrElse<U>(mapper: (value: T) => U, fallback: () => U): U {
        return fallback()
    }

    and<U>(other: Option<U>): Option<U> {
        return None()
    }

    andThen<U>(mapper: (value: T) => Option<U>): Option<U> {
        return None()
    }

    filter(predicate: (value: T) => boolean): Option<T> {
        return None()
    }

    or(other: Option<T>): Option<T> {
        return other
    }

    orElse(other: () => Option<T>): Option<T> {
        return other()
    }

    xor(other: Option<T>): Option<T> {
        return other
    }

    okOr<U>(fallbackError: U): Result<T, U> {
        return Err(fallbackError)
    }

    okOrElse<U>(fallbackError: () => U): Result<T, U> {
        return Err(fallbackError())
    }

    condition(cond: (value: T) => boolean, fallback: boolean): boolean {
        return fallback
    }

    clone(): Option<T> {
        return None()
    }

    toNullable(): T | null {
        return null
    }

    cast<U>(): T extends U ? Option<U> : never {
        return forceType(this)
    }

    extend<U>(): Option<T | U> {
        return this
    }
}

/**
 * Optional type
 */
export type Option<T> = SomeValue<T> | NoneValue<T>

/**
 * Check if a value is an Option
 */
export function isOption(value: unknown): value is Option<unknown> {
    return value instanceof SomeValue || value instanceof NoneValue
}

/**
 * Create a concrete value
 * @param value
 */
export function Some<T>(value: T): Option<T> {
    return new SomeValue(value)
}

/**
 * Create an empty value
 */
export function None<T>(): Option<T> {
    return new NoneValue<T>()
}

/**
 * Get the value from a single state
 * @param key
 */
export function getStateValue<T extends object, K extends string & KeyOfUnion<T>, U>(
    matchable: AbstractMatchable<T>,
    key: K
): Option<ValOfKeyOfUnion<T, K>> {
    let state = matchable._getState()

    if (O.keys(state)[0] !== key) {
        return None()
    } else {
        return Some(O.values(state)[0]) as ValOfKeyOfUnion<T, K>
    }
}

/**
 * Create an Option<T> from a nullable/maybe-undefined value
 * @param value
 */
export function maybeOption<T>(value: T | null | undefined): Option<T> {
    return value === null || value === undefined ? None() : Some(value)
}
