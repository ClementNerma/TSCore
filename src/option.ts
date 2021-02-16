import { panic } from "./env"
import { AbstractMatchable, KeyOfUnion, State, state, ValOfKeyOfUnion } from "./match"
import { O } from "./objects"
import { Err, Ok, Result } from "./result"

/**
 * Option's pattern matching
 * @template T Concrete type
 */
type OptionMatch<T> = State<"Some", T> | State<"None">

/**
 * Option type
 * @template T Concrete type
 */
abstract class OptionClass<T> extends AbstractMatchable<OptionMatch<T>> {
    /**
     * Create a new optional value
     */
    constructor() {
        super(() => (this.isSome() ? state("Some", this.data) : state("None")))
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
    abstract ifSome(callback: (data: T) => void): this

    /**
     * Run a callback if this option is a 'None' value
     * @param callback
     */
    abstract ifNone(callback: () => void): this

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
     * Unwrap this option's concrete value
     * Panics if the option is not a concrete value and displays the message provided by the formatter
     * @param formatter
     */
    abstract unwrapWith(formatter: () => string, p: typeof panic): T

    /**
     * Map this option's concrete value
     * @param mapper Mapping function
     */
    abstract map<U>(mapper: (value: T) => U): Option<U>

    /**
     * Map this option's concrete value, asynchronously
     * @param mapper Asynchronous mapping function
     */
    abstract mapAsync<U>(mapper: (value: T) => Promise<U>): Promise<Option<U>>

    /**
     * Map this option's concrete value
     * @param mapper Mapping function
     * @param fallback Fallback function in case this option is 'None'
     */
    abstract mapOr<U>(mapper: (value: T) => U, fallback: U): U

    /**
     * Map this option's concrete value, asynchronously
     * @param mapper Asynchronous mapping function
     * @param fallback Fallback function in case this option is 'None'
     */
    abstract mapOrAsync<U>(mapper: (value: T) => Promise<U>, fallback: U): Promise<U>

    /**
     * Map this option's concrete value
     * @param mapper Mapping function
     * @param fallback Fallback function in case this option is 'None'
     */
    abstract mapOrElse<U>(mapper: (value: T) => U, fallback: () => U): U

    /**
     * Map this option's concrete value, asynchronously
     * @param mapper Asynchronous mapping function
     * @param fallback Asynchronous fallback function in case this option is 'None'
     */
    abstract mapOrElseAsync<U>(mapper: (value: T) => Promise<U>, fallback: () => Promise<U>): Promise<U>

    /**
     * Map this option to a string, falling back to an empty string if this option is 'None'
     * @param mapper Mapping function
     */
    abstract mapStr(mapper: (value: T) => string): string

    /**
     * Expect this option and another to be concrete
     * @param other Another option
     */
    abstract and<U>(other: Option<U>): Option<U>

    /**
     * Run a callback in case this option is concrete
     * @param mapper A callback returning a nullable value from this option's concrete value
     */
    abstract andThen<U>(mapper: (value: T) => Option<U>): Option<U>

    /**
     * Run an asynchronous callback in case this option is concrete
     * @param mapper A callback returning a nullable value from this option's concrete value
     */
    abstract andThenAsync<U>(mapper: (value: T) => Promise<Option<U>>): Promise<Option<U>>

    /**
     * Expect this option and another to be concrete
     * @param other Another option
     */
    abstract andMaybe<U>(other: U | null | undefined): Option<U>

    /**
     * Run a callback in case this option is concrete
     * @param mapper A callback returning a nullable value from this option's concrete value
     */
    abstract andThenMaybe<U>(mapper: (value: T) => U | null | undefined): Option<U>

    /**
     * Run an asynchronous callback in case this option is concrete
     * @param mapper A callback returning a nullable value from this option's concrete value
     */
    abstract andThenMaybeAsync<U>(mapper: (value: T) => Promise<U | null | undefined>): Promise<Option<U>>

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
     * Expect one of this option and another to be concrete asynchronously
     * @param other Asynchronous function generating an option
     */
    abstract orElseAsync(other: () => Promise<Option<T>>): Promise<Option<T>>

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
    constructor(readonly data: T) {
        super()
    }

    isSome(): this is SomeValue<T> {
        return true
    }

    isNone(): this is NoneValue<T> {
        return false
    }

    ifSome(callback: (data: T) => void): this {
        callback(this.data)
        return this
    }

    ifNone(callback: () => void): this {
        return this
    }

    toNative(): T | undefined {
        return this.data
    }

    expect(message: string): T {
        return this.data
    }

    expectNone(message: string): void {
        panic(message)
    }

    unwrap(): T {
        return this.data
    }

    unwrapOr(fallback: T): T {
        return this.data
    }

    unwrapOrElse(fallback: () => T): T {
        return this.data
    }

    unwrapWith(formatter: (p: typeof panic) => string): T {
        return this.data
    }

    map<U>(mapper: (value: T) => U): Option<U> {
        return Some(mapper(this.data))
    }

    mapAsync<U>(mapper: (value: T) => Promise<U>): Promise<Option<U>> {
        return mapper(this.data).then(Some)
    }

    mapOr<U>(mapper: (value: T) => U, fallback: U): U {
        return mapper(this.data)
    }

    mapOrAsync<U>(mapper: (value: T) => Promise<U>, fallback: U): Promise<U> {
        return mapper(this.data)
    }

    mapOrElse<U>(mapper: (value: T) => U, fallback: () => U): U {
        return mapper(this.data)
    }

    mapOrElseAsync<U>(mapper: (value: T) => Promise<U>, fallback: () => Promise<U>): Promise<U> {
        return mapper(this.data)
    }

    mapStr(mapper: (value: T) => string): string {
        return mapper(this.data)
    }

    and<U>(other: Option<U>): Option<U> {
        return other
    }

    andThen<U>(mapper: (value: T) => Option<U>): Option<U> {
        return mapper(this.data)
    }

    andThenAsync<U>(mapper: (value: T) => Promise<Option<U>>): Promise<Option<U>> {
        return mapper(this.data)
    }

    andMaybe<U>(other: U | null | undefined): Option<U> {
        return other !== null && other !== undefined ? Some(other) : None()
    }

    andThenMaybe<U>(mapper: (value: T) => U | null | undefined): Option<U> {
        const mapped = mapper(this.data)
        return mapped !== null && mapped !== undefined ? Some(mapped) : None()
    }

    andThenMaybeAsync<U>(mapper: (value: T) => Promise<U | null | undefined>): Promise<Option<U>> {
        return mapper(this.data).then(Option.maybe)
    }

    filter(predicate: (value: T) => boolean): Option<T> {
        return predicate(this.data) ? this : None()
    }

    or(other: Option<T>): Option<T> {
        return this
    }

    orElse(other: () => Option<T>): Option<T> {
        return this
    }

    orElseAsync(other: () => Promise<Option<T>>): Promise<Option<T>> {
        return Promise.resolve(this)
    }

    xor(other: Option<T>): Option<T> {
        return other.isNone() ? this : None()
    }

    okOr<U>(fallbackError: U): Result<T, U> {
        return Ok(this.data)
    }

    okOrElse<U>(fallbackError: () => U): Result<T, U> {
        return Ok(this.data)
    }

    clone(): Option<T> {
        return Some(this.data)
    }

    toNullable(): T | null {
        return this.data
    }

    cast<U>(): T extends U ? Option<U> : never {
        return this as any
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

    ifSome(callback: (data: T) => void): this {
        return this
    }

    ifNone(callback: () => void): this {
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

    unwrapWith(formatter: (p: typeof panic) => string): T {
        return panic("{}", formatter(panic))
    }

    map<U>(mapper: (value: T) => U): Option<U> {
        return None()
    }

    mapAsync<U>(mapper: (value: T) => Promise<U>): Promise<Option<U>> {
        return Promise.resolve(None())
    }

    mapOr<U>(mapper: (value: T) => U, fallback: U): U {
        return fallback
    }

    mapOrAsync<U>(mapper: (value: T) => Promise<U>, fallback: U): Promise<U> {
        return Promise.resolve(fallback)
    }

    mapOrElse<U>(mapper: (value: T) => U, fallback: () => U): U {
        return fallback()
    }

    mapOrElseAsync<U>(mapper: (value: T) => Promise<U>, fallback: () => Promise<U>): Promise<U> {
        return fallback()
    }

    mapStr(mapper: (value: T) => string): string {
        return ""
    }

    and<U>(other: Option<U>): Option<U> {
        return None()
    }

    andThen<U>(mapper: (value: T) => Option<U>): Option<U> {
        return None()
    }

    andThenAsync<U>(mapper: (value: T) => Promise<Option<U>>): Promise<Option<U>> {
        return Promise.resolve(None())
    }

    andMaybe<U>(other: U | null | undefined): Option<U> {
        return None()
    }

    andThenMaybe<U>(mapper: (value: T) => U | null | undefined): Option<U> {
        return None()
    }

    andThenMaybeAsync<U>(mapper: (value: T) => Promise<U | null | undefined>): Promise<Option<U>> {
        return Promise.resolve(None())
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

    orElseAsync(other: () => Promise<Option<T>>): Promise<Option<T>> {
        return other()
    }

    clone(): Option<T> {
        return None()
    }

    toNullable(): T | null {
        return null
    }

    cast<U>(): T extends U ? Option<U> : never {
        return this as any
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
export function getStateValue<T extends object, K extends string & KeyOfUnion<T>>(
    matchable: AbstractMatchable<T>,
    key: K
): Option<ValOfKeyOfUnion<T, K>> {
    let state = matchable._getState()

    if (((O.keys(state)[0] as unknown) as KeyOfUnion<T>) !== key) {
        return None()
    } else {
        return Some(O.values(state)[0]) as ValOfKeyOfUnion<T, K>
    }
}

/**
 * Utility functions for Option<T>
 */
export namespace Option {
    /**
     * Check if a value is an Option
     */
    export function is(value: unknown): value is Option<unknown> {
        return value instanceof SomeValue || value instanceof NoneValue
    }

    /**
     * Create an Option<T> from a nullable/maybe-undefined value
     * @param value
     */
    export function maybe<T>(value: T | null | undefined): Option<T> {
        return value === null || value === undefined ? None() : Some(value)
    }

    /**
     * Create an Option<T> from a future nullable/maybe-undefined value
     * @param futureValue
     */
    export async function maybeAsync<T>(futureValue: Promise<T | null | undefined>): Promise<Option<T>> {
        return maybe(await futureValue)
    }

    /**
     * Create an Option<void> from a boolean (`true` creates a Some(), `false` creates a None())
     * @param value
     */
    export function bool(value: boolean): Option<void> {
        return value ? Some(undefined) : None()
    }

    /**
     * Transpose an Option<Result<T, E>> into a Result<Option<T>, E>
     * @param option
     */
    export function transpose<T, E>(option: Option<Result<T, E>>): Result<Option<T>, E> {
        return option
            .map((result) =>
                result.mapOrElse(
                    (data) => Ok(Some(data)),
                    (err) => Err(err)
                )
            )
            .unwrapOrElse(() => Ok(None<T>()))
    }

    /**
     * Expect a value to be neither 'null' nor 'undefined'
     * @param value
     * @param message
     */
    export function expect<T>(value: T | null | undefined, message?: string): NonNullable<T> {
        return value ?? panic(message || "Tried to use a null or undefined value as non-nullable!")
    }

    /**
     * Expect a value to be neither 'null' nor 'undefined'
     * @param value
     * @param message
     */
    export function expectSome<T>(value: T | null | undefined, message?: string): Option<T> {
        return Some(value ?? panic(message || "Tried to use a null or undefined value as non-nullable!"))
    }

    /**
     * Return a Some(T) if the provided property exists in the provided object, or a None() otherwise
     * @param obj
     * @param prop
     */
    export function prop<O extends object, K extends keyof O>(obj: O, prop: K): Option<O[K]> {
        return obj.hasOwnProperty(prop) ? Some(obj[prop]) : None()
    }

    /**
     * Create a Some(T) option from either an existing option, or a fallback value if it's a None()
     * @param option
     * @param fallback
     * @param mapper An optional function that performs operations on the concrete value
     */
    export function or<T>(option: Option<T>, fallback: T, mapper?: (mapper: T) => T): Option<T> {
        const value = option.unwrapOr(fallback)
        return Some(mapper ? mapper(value) : value)
    }

    /**
     * Create a Some(T) option from either an existing option, or a fallback function if it's a None()
     * @param option
     * @param fallback
     * @param mapper An optional function that performs operations on the concrete value
     */
    export function orElse<T>(option: Option<T>, fallback: () => T, mapper?: (mapper: T) => T): Option<T> {
        const value = option.unwrapOrElse(() => fallback())
        return Some(mapper ? mapper(value) : value)
    }

    /**
     * Try a list of functions and return the value of the first function that doesn't return a None()
     * @param tries The functions to 'try'
     * @returns The first concrete return value of a function (if any)
     */
    export function any<T>(tries: Array<() => Option<T>>): Option<T> {
        for (const oneTry of tries) {
            const data = oneTry()

            if (data.isSome()) {
                return data
            }
        }

        return None()
    }
}
