/**
 * @file Result values that are either a success or an error
 */

import { formatAdvanced, panic, unreachable } from './env'
import { AbstractMatchable, State, state } from './match'
import { None, Option, Some } from './option'

/**
 * Result's pattern matching
 * @template T Success type
 * @template E Error type
 */
export type ResultMatch<T, E> = State<"Ok", T> | State<"Err", E>

/**
 * Result type
 * @template T Success type
 * @template E Error type
 */
abstract class ResultClass<T, E> extends AbstractMatchable<ResultMatch<T, E>> {
    /**
     * Create a new result value
     */
    constructor() {
        super(() => (this.isOk() ? state("Ok", this.data) : this.isErr() ? state("Err", this.err) : unreachable()))
    }

    /**
     * Is this result a success?
     */
    abstract isOk(): this is OkValue<T, E>

    /**
     * Is this result an error?
     */
    abstract isErr(): this is ErrValue<T, E>

    /**
     * Get this result's success value
     */
    abstract maybeOk(): Option<T>

    /**
     * Get this result's error value
     */
    abstract maybeErr(): Option<E>

    /**
     * Run a callback if this result is Ok()
     * @param callback
     */
    abstract withOk(callback: (data: T) => void): this

    /**
     * Run a callback if this result is Err()
     * @param callback
     */
    abstract withErr(callback: (err: E) => void): this

    /**
     * Expect this result to be a success
     * Panics if it isn't
     * @param message Panic message
     */
    abstract expect(message: string): T

    /**
     * Expect this result to be an error
     * Panics if it isn't
     * @param message Panic message
     */
    abstract expectErr(message: string): E

    /**
     * Unwrap this result's success value
     * Panics if the result is not a success
     */
    abstract unwrap(): T

    /**
     * Unwrap this result's success value
     * Panics if the result is not a success and displays the message provided by the formatter
     * @param formatter
     */
    abstract unwrapWith(formatter: (err: E, p: typeof panic) => string): T

    /**
     * Unwrap this result's success value
     * @param fallback Fallback value in case this result is an error
     */
    abstract unwrapOr(fallback: T): T

    /**
     * Unwrap this result's success value
     * @param fallback Fallback function in case this result is an error
     */
    abstract unwrapOrElse(fallback: (err: E) => T): T

    /**
     * Unwrap this result's error value
     */
    abstract unwrapErr(): E

    /**
     * Map this result's success value
     * @param mapper Mapping function
     */
    abstract map<U>(mapper: (value: T) => U): Result<U, E>

    /**
     * Map this result's value
     * @param success Mapping function for success value
     * @param error Mapping function for error value
     */
    abstract mapOrElse<U>(success: (value: T) => U, error: (err: E) => U): U

    /**
     * Map this result's error value
     * @param mapper Mapping function for error value
     */
    abstract mapErr<F>(mapper: (err: E) => F): Result<T, F>

    /**
     * Expect this result and another one to be successes
     * @param other Another result
     */
    abstract and<U>(other: Result<U, E>): Result<U, E>

    /**
     * Run a callback in case this result is a success
     * @param other A callback returning a new result from this one's success value
     */
    abstract andThen<U>(other: (value: T) => Result<U, E>): Result<U, E>

    /**
     * Expect one of this result and another to be a success
     * @param other Another result
     */
    abstract or<F>(other: Result<T, F>): Result<T, F>

    /**
     * Expect one of this result and another to be a success
     * @param other Function generating a result
     */
    abstract orElse<F>(other: () => Result<T, F>): Result<T, F>

    /**
     * Cast this result's inner success value to a parent type
     * If the provided type is not a parent of the inner value's one, the result will be returned but typechecking will fail
     */
    abstract castOk<U>(): T extends U ? Result<U, E> : never

    /**
     * Cast this result's inner error value to a parent type
     * If the provided type is not a parent of the inner value's one, the result will be returned but typechecking will fail
     */
    abstract castErr<F>(): E extends F ? Result<T, F> : never

    /**
     * Extend this result's success type to allow another type to be part of it
     */
    abstract extendOk<U>(): Result<T | U, E>

    /**
     * Extend this result's error type to allow another type to be part of it
     */
    abstract extendErr<F>(): Result<T, E | F>

    /**
     * Extend this result's type to allow another type to be part of it
     */
    abstract extend<U, F>(): Result<T | U, E | F>

    /**
     * Clone this result
     */
    abstract clone(): Result<T, E>
}

/**
 * Success type
 */
class OkValue<T, E> extends ResultClass<T, E> {
    constructor(readonly data: T) {
        super()
    }

    isOk(): this is OkValue<T, E> {
        return true
    }

    isErr(): this is ErrValue<T, E> {
        return false
    }

    maybeOk(): Option<T> {
        return Some(this.data)
    }

    maybeErr(): Option<E> {
        return None()
    }

    withOk(callback: (data: T) => void): this {
        callback(this.data)
        return this
    }

    withErr(callback: (err: E) => void): this {
        return this
    }

    expect(message: string): T {
        return this.data
    }

    expectErr(message: string): E {
        return panic(message)
    }

    unwrap(): T {
        return this.data
    }

    unwrapWith(formatter: (err: E, p: typeof panic) => string): T {
        return this.data
    }

    unwrapOr(fallback: T): T {
        return this.data
    }

    unwrapOrElse(fallback: (err: E) => T): T {
        return this.data
    }

    unwrapErr(): E {
        return panic("Tried to unwrap an Ok() value as an Err(): {}", this)
    }

    map<U>(mapper: (value: T) => U): Result<U, E> {
        return Ok(mapper(this.data))
    }

    mapOrElse<U>(success: (value: T) => U, error: (err: E) => U): U {
        return success(this.data)
    }

    mapErr<F>(mapper: (err: E) => F): Result<T, F> {
        return Ok(this.data)
    }

    and<U>(other: Result<U, E>): Result<U, E> {
        return other
    }

    andThen<U>(other: (value: T) => Result<U, E>): Result<U, E> {
        return other(this.data)
    }

    or<F>(other: Result<T, F>): Result<T, F> {
        return Ok(this.data)
    }

    orElse<F>(other: () => Result<T, F>): Result<T, F> {
        return Ok(this.data)
    }

    castOk<U>(): T extends U ? Result<U, E> : never {
        return Ok(this.data) as any
    }

    castErr<F>(): E extends F ? Result<T, F> : never {
        return Ok(this.data) as any
    }

    extendOk<U>(): Result<T | U, E> {
        return Ok(this.data)
    }

    extendErr<F>(): Result<T, E | F> {
        return Ok(this.data)
    }

    extend<U, F>(): Result<T | U, E | F> {
        return Ok(this.data)
    }

    clone(): Result<T, E> {
        return Ok(this.data)
    }

    asOk(): Result<T, any> {
        return Ok(this.data)
    }
}

/**
 * Error type
 */
export class ErrValue<T, E> extends ResultClass<T, E> {
    constructor(readonly err: E) {
        super()
    }

    isOk(): this is OkValue<T, E> {
        return false
    }

    isErr(): this is ErrValue<T, E> {
        return true
    }

    maybeOk(): Option<T> {
        return None()
    }

    maybeErr(): Option<E> {
        return Some(this.err)
    }

    withOk(callback: (data: T) => void): this {
        return this
    }

    withErr(callback: (err: E) => void): this {
        callback(this.err)
        return this
    }

    expect(message: string): T {
        return panic(message)
    }

    expectErr(message: string): E {
        return this.err
    }

    unwrap(): T {
        return panic("Tried to unwrap an Err() value: {}", this.err)
    }

    unwrapWith(formatter: (err: E, p: typeof panic) => string): T {
        return panic("{}", formatter(this.err, panic))
    }

    unwrapOr(fallback: T): T {
        return fallback
    }

    unwrapOrElse(fallback: (err: E) => T): T {
        return fallback(this.err)
    }

    unwrapErr(): E {
        return this.err
    }

    map<U>(mapper: (value: T) => U): Result<U, E> {
        return Err(this.err)
    }

    mapOrElse<U>(success: (value: T) => U, error: (err: E) => U): U {
        return error(this.err)
    }

    mapErr<F>(mapper: (err: E) => F): Result<T, F> {
        return Err(mapper(this.err))
    }

    and<U>(other: Result<U, E>): Result<U, E> {
        return Err(this.err)
    }

    andThen<U>(other: (value: T) => Result<U, E>): Result<U, E> {
        return Err(this.err)
    }

    or<F>(other: Result<T, F>): Result<T, F> {
        return other
    }

    orElse<F>(other: () => Result<T, F>): Result<T, F> {
        return other()
    }

    castOk<U>(): T extends U ? Result<U, E> : never {
        return Ok(this.err) as any
    }

    castErr<F>(): E extends F ? Result<T, F> : never {
        return Ok(this.err) as any
    }

    extendOk<U>(): Result<T | U, E> {
        return Err(this.err)
    }

    extendErr<F>(): Result<T, E | F> {
        return Err(this.err)
    }

    extend<U, F>(): Result<T | U, E | F> {
        return Err(this.err)
    }

    clone(): Result<T, E> {
        return Err(this.err)
    }

    asErr(): Result<any, E> {
        return Err(this.err)
    }
}

/**
 * Result type
 * @template T Success type
 * @template E Error type
 */
export type Result<T, E> = OkValue<T, E> | ErrValue<T, E>

/**
 * Check if a value is a Result
 */
export function isResult(value: unknown): value is Result<unknown, unknown> {
    return value instanceof OkValue || value instanceof ErrValue
}

/**
 * Create a new success result
 * @param value The success value
 */
export function Ok<T>(value: T): Result<T, any> {
    return new OkValue(value)
}

/**
 * Create a new error result
 * @param err The error value
 */
export function Err<E>(err: E): Result<any, E> {
    return new ErrValue(err)
}

/**
 * Create a new error result with formatting
 * @param err The error value
 * @param params The formatting parameters
 */
export function ErrMsg(err: string, ...params: unknown[]): Result<any, string> {
    return new ErrValue(formatAdvanced(err, params, "error"))
}

/**
 * Utility functions for Result<T, E>
 */
export namespace Result {
    /**
     * Create a result from a fallible function (= function which may throw())
     * @param core
     */
    export function fallible<T>(core: () => T): Result<T, Error> {
        let value: T

        try {
            value = core()
        } catch (e) {
            return Err(e)
        }

        return Ok(value)
    }

    /**
     * Create an Ok(T) option from either an existing result, or a fallback value if it's an Err()
     * @param result
     * @param fallback
     * @param mapper An optional function that performs operations on the concrete value
     */
    export function or<T, E>(result: Result<T, E>, fallback: T, mapper?: (mapper: T) => T): Result<T, E> {
        const value = result.unwrapOr(fallback)
        return Ok(mapper ? mapper(value) : value)
    }

    /**
     * Create an Ok(T) option from either an existing option, or a fallback function if it's an Err()
     * @param result
     * @param fallback
     * @param mapper An optional function that performs operations on the concrete value
     */
    export function orElse<T, E>(result: Result<T, E>, fallback: () => T, mapper?: (mapper: T) => T): Result<T, E> {
        const value = result.unwrapOrElse(() => fallback())
        return Ok(mapper ? mapper(value) : value)
    }

    /**
     * Try a list of functions and return the value of the first function that doesn't throws
     * @param tries The functions to 'try'
     * @returns The return value of a function or the list of errors of all functions
     */
    export function any<T>(tries: Array<() => T>): Result<T, Error[]> {
        const errors = []

        for (const oneTry of tries) {
            const data = fallible(oneTry)

            if (data.isOk()) {
                return data.asOk()
            }

            errors.push(data.err)
        }

        return Err(errors)
    }
}
