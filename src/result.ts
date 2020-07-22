/**
 * @file Result values that are either a success or an error
 */

import { MsgParam, panic } from './console'
import { Matchable, State, match, state } from './match'
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
export class Result<T, E> extends Matchable<ResultMatch<T, E>> {
    /**
     * Is this result a success?
     */
    isOk(): boolean {
        return match(this, {
            Ok: () => true,
            Err: () => false,
        })
    }

    /**
     * Is this result an error?
     */
    isErr(): boolean {
        return match(this, {
            Ok: () => false,
            Err: () => true,
        })
    }

    /**
     * Get this result's success value
     */
    ok(): Option<T> {
        return match(this, {
            Ok: (value) => Some(value),
            Err: () => None(),
        })
    }

    /**
     * Get this result's error value
     */
    err(): Option<E> {
        return match(this, {
            Ok: () => None(),
            Err: (err) => Some(err),
        })
    }

    /**
     * Run a callback if this result is Ok()
     * @param callback
     */
    withOk(callback: (data: T) => void): this {
        match(this, {
            Ok: (data) => callback(data),
            Err: () => {},
        })

        return this
    }

    /**
     * Run a callback if this result is Err()
     * @param callback
     */
    withErr(callback: (err: E) => void): this {
        match(this, {
            Ok: () => {},
            Err: (err) => callback(err),
        })

        return this
    }

    /**
     * Expect this result to be a success
     * Panics if it isn't
     * @param message Panic message
     */
    expect(message: string): T {
        return match(this, {
            Ok: (value) => value,
            Err: () => panic(message),
        })
    }

    /**
     * Expect this result to be an error
     * Panics if it isn't
     * @param message Panic message
     */
    expectErr(message: string): E {
        return match(this, {
            Ok: () => panic(message),
            Err: (err) => err,
        })
    }

    /**
     * Unwrap this result's success value
     * Panics if the result is not a success
     */
    unwrap(): T {
        return match(this, {
            Ok: (value) => value,
            Err: () => panic("Tried to unwrap an 'Err' value!"),
        })
    }

    /**
     * Unwrap this result's success value
     * Panics if the result is not a success and displays the Err() variant's value
     */
    unwrapDebug(): T {
        return match(this, {
            Ok: (value) => value,
            Err: (err) => panic("Tried to unwrap an 'Err' value: " + err),
        })
    }

    /**
     * Unwrap this result's success value
     * Panics if the result is not a success and displays the message provided by the formatter
     * @param formatter
     */
    unwrapWith(formatter: (err: E) => string | [string, MsgParam[]]): T {
        return match(this, {
            Ok: (value) => value,
            Err: (err) => {
                const message = formatter(err)

                if (Array.isArray(message)) {
                    panic(message[0], ...message[1])
                } else {
                    panic(message)
                }
            },
        })
    }

    /**
     * Unwrap this result's success value
     * @param fallback Fallback value in case this result is an error
     */
    unwrapOr(fallback: T): T {
        return match(this, {
            Ok: (value) => value,
            Err: () => fallback,
        })
    }

    /**
     * Unwrap this result's success value
     * @param fallback Fallback function in case this result is an error
     */
    unwrapOrElse(fallback: (err: E) => T): T {
        return match(this, {
            Ok: (value) => value,
            Err: (err) => fallback(err),
        })
    }

    /**
     * Unwrap this result's error value
     */
    unwrapErr(): E {
        return match(this, {
            Ok: () => panic("Tried to unwrap error of an 'Ok' value!"),
            Err: (err) => err,
        })
    }

    /**
     * Map this result's success value
     * @param mapper Mapping function
     */
    map<U>(mapper: (value: T) => U): Result<U, E> {
        return match(this, {
            Ok: (value) => Ok(mapper(value)),
            Err: (err) => Err(err),
        })
    }

    /**
     * Map this result's value
     * @param success Mapping function for success value
     * @param error Mapping function for error value
     */
    mapOrElse<U>(success: (value: T) => U, error: (err: E) => U): U {
        return match(this, {
            Ok: (value) => success(value),
            Err: (err) => error(err),
        })
    }

    /**
     * Map this result's error value
     * @param mapper Mapping function for error value
     */
    mapErr<F>(mapper: (err: E) => F): Result<T, F> {
        return match(this, {
            Ok: (value) => Ok(value),
            Err: (err) => Err(mapper(err)),
        })
    }

    /**
     * Expect this result and another one to be successes
     * @param other Another result
     */
    and<U>(other: Result<U, E>): Result<U, E> {
        return match(this, {
            Ok: () => other,
            Err: (err) => Err(err),
        })
    }

    /**
     * Run a callback in case this result is a success
     * @param other A callback returning a new result from this one's success value
     */
    andThen<U>(other: (value: T) => Result<U, E>): Result<U, E> {
        return match(this, {
            Ok: (value) => other(value),
            Err: (err) => Err(err),
        })
    }

    /**
     * Expect one of this result and another to be a success
     * @param other Another result
     */
    or<F>(other: Result<T, F>): Result<T, F> {
        return match(this, {
            Ok: (value) => Ok(value),
            Err: () => other,
        })
    }

    /**
     * Expect one of this result and another to be a success
     * @param other Function generating a result
     */
    orElse<F>(other: () => Result<T, F>): Result<T, F> {
        return match(this, {
            Ok: (value) => Ok(value),
            Err: () => other(),
        })
    }

    /**
     * Clone this result
     */
    clone(): Result<T, E> {
        return match(this, {
            Ok: (value) => Ok(value),
            Err: (err) => Err(err),
        })
    }

    /**
     * Create a result from a fallible function (= function which may throw())
     * @param core
     */
    static fallible<T>(core: () => T): Result<T, Error> {
        let value: T

        try {
            value = core()
        } catch (e) {
            return Err(e)
        }

        return Ok(value)
    }

    /**
     * Create an Err() variant from an Error
     * @param error
     */
    static fromError(error: Error): Result<any, string> {
        return Err(error.message)
    }
}

/**
 * Create a new success result
 * @param value The success value
 */
export function Ok<T>(value: T): Result<T, any> {
    return new Result(state("Ok", value))
}

/**
 * Create a new error result
 * @param err The error value
 */
export function Err<E>(err: E): Result<any, E> {
    return new Result(state("Err", err))
}
