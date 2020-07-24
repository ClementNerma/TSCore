/**
 * @file Represent optional values in a type-safe, functional and combinable way
 */

import { panic } from './env'
import { AbstractMatchable, KeyOfUnion, Matchable, State, ValOfKeyOfUnion, match, state } from './match'
import { O } from './objects'
import { Err, Ok, Result } from './result'

/**
 * Option's pattern matching
 * @template T Concrete value type
 */
export type OptMatch<T> = State<"Some", T> | State<"None">

/**
 * Option type
 * @template T Concrete value type
 */
export class Option<T> extends Matchable<OptMatch<T>> {
    /**
     * Is this option concrete?
     */
    isSome(): boolean {
        return match(this, {
            Some: () => true,
            None: () => false,
        })
    }

    /**
     * Is this option 'None'?
     */
    isNone(): boolean {
        return match(this, {
            Some: () => false,
            None: () => true,
        })
    }

    /**
     * Run a callback if this option is concrete
     * @param callback
     */
    some(callback: (data: T) => void): this {
        match(this, {
            Some: (data) => callback(data),
            None: () => {},
        })

        return this
    }

    /**
     * Run a callback if this option is a 'None' value
     * @param callback
     */
    none(callback: () => void): this {
        match(this, {
            Some: () => {},
            None: () => callback(),
        })

        return this
    }

    /**
     * Convert this value to a native one ('undefined' if this option is a 'None' value)
     */
    toNative(): T | undefined {
        return match(this, {
            Some: (value) => value,
            None: () => undefined,
        })
    }

    /**
     * Expect this option to be concrete
     * Panics if it isn't
     * @param message Panic message
     */
    expect(message: string): T {
        return match(this, {
            Some: (value) => value,
            None: () => panic(message),
        })
    }

    /**
     * Expect this option to be 'None'
     * Panics if it isn't
     * @param message Panic message
     */
    expectNone(message: string): void {
        return match(this, {
            Some: () => panic(message),
            None: () => {},
        })
    }

    /**
     * Unwrap this option's concrete value
     * Panics if the option is not concrete
     */
    unwrap(): T {
        return match(this, {
            Some: (value) => value,
            None: () => panic("Tried to unwrap a 'None' value!"),
        })
    }

    /**
     * Unwrap this option's concrete value
     * @param fallback Fallback value in case this option is 'None'
     */
    unwrapOr(fallback: T): T {
        return match(this, {
            Some: (value) => value,
            None: () => fallback,
        })
    }

    /**
     * Unwrap this option' concrete value
     * @param fallback Fallback function in case this option is 'None'
     */
    unwrapOrElse(fallback: () => T): T {
        return match(this, {
            Some: (value) => value,
            None: () => fallback(),
        })
    }

    /**
     * Map this option's concrete value
     * @param mapper Mapping function
     */
    map<U>(mapper: (value: T) => U): Option<U> {
        return match(this, {
            Some: (value) => Some(mapper(value)),
            None: () => None(),
        })
    }

    /**
     * Map this option's concrete value
     * @param mapper Mapping function
     * @param fallback Fallback function in case this option is 'None'
     */
    mapOr<U>(mapper: (value: T) => U, fallback: U): U {
        return match(this, {
            Some: (value) => mapper(value),
            None: () => fallback,
        })
    }

    /**
     * Map this option's concrete value
     * @param mapper Mapping function
     * @param fallback Fallback function in case this option is 'None'
     */
    mapOrElse<U>(mapper: (value: T) => U, fallback: () => U): U {
        return match(this, {
            Some: (value) => mapper(value),
            None: () => fallback(),
        })
    }

    /**
     * Expect this option and another to be concrete
     * @param other Another option
     */
    and<U>(other: Option<U>): Option<U> {
        return match(this, {
            Some: () => other,
            None: () => None(),
        })
    }

    /**
     * Run a callback in case this option is a success
     * @param mapper A callback returning a new option from this one's concrete value
     */
    andThen<U>(mapper: (value: T) => Option<U>): Option<U> {
        return match(this, {
            Some: (value) => mapper(value),
            None: () => None(),
        })
    }

    /**
     * Create a 'Some' or 'None' value depending on this option's concreteness
     * @param predicate Predicate
     */
    filter(predicate: (value: T) => boolean): Option<T> {
        return match(this, {
            Some: (value) => (predicate(value) ? this.clone() : None()),
            None: () => None(),
        })
    }

    /**
     * Expect one of this option and another to be concrete
     * @param other Another option
     */
    or(other: Option<T>): Option<T> {
        return match(this, {
            Some: () => this.clone(),
            None: () => other,
        })
    }

    /**
     * Expect one of this option and another to be concrete
     * @param other Function generating an option
     */
    orElse(other: () => Option<T>): Option<T> {
        return match(this, {
            Some: () => this.clone(),
            None: () => other(),
        })
    }

    /**
     * Expect exactly one of this option and another to be concrete
     * @param other Another option
     */
    xor(other: Option<T>): Option<T> {
        return match(this, {
            Some: () =>
                match(other, {
                    Some: () => None(),
                    None: () => this.clone(),
                }),
            None: () => other,
        })
    }

    /**
     * Turn the option into a result
     * @param fallbackError The error result to use if the option is not concrete
     */
    okOr<U>(fallbackError: U): Result<T, U> {
        return match(this, {
            Some: (value) => Ok(value),
            None: () => Err(fallbackError),
        })
    }

    /**
     * Turn the option into a result
     * @param fallbackError The error callback to use if the option is not concrete
     */
    okOrElse<U>(fallbackError: () => U): Result<T, U> {
        return match(this, {
            Some: (value) => Ok(value),
            None: () => Err(fallbackError()),
        })
    }

    /**
     * Turn the option into a boolean value
     * @param cond The condition function
     * @param fallback The boolean value to return if the option is a 'None'
     */
    condition(cond: (value: T) => boolean, fallback = false): boolean {
        return match(this, {
            Some: (value) => cond(value),
            None: () => fallback,
        })
    }

    /**
     * Get this option's value or insert another if it's 'None'
     * @param value The value to insert
     */
    getOrInsert(value: T): T {
        return match(this, {
            Some: (value) => value,
            None: () => {
                this._state = state("Some", value)
                return value
            },
        })
    }

    /**
     * Get this option's value or insert another if it's 'None'
     * @param callback A function generating the value to insert
     */
    getOrInsertWith(callback: () => T): T {
        return match(this, {
            Some: (value) => value,
            None: () => {
                const newValue = callback()
                this._state = state("Some", newValue)
                return newValue
            },
        })
    }

    /**
     * Take the value out of this option and replace it by a 'None'
     * @returns This option (before replacement)
     */
    take(): Option<T> {
        const prev = this.clone()
        this._state = state("None")
        return prev
    }

    /**
     * Replace this option's value with a concrete one
     * @param value The value to replace this option's one with
     * @returns This option (before replacement)
     */
    replace(value: T): Option<T> {
        const prev = this.clone()
        this._state = state("Some", value)
        return prev
    }

    /**
     * Clone this option
     */
    clone(): Option<T> {
        return match(this, {
            Some: (value) => Some(value),
            None: () => None(),
        })
    }

    /**
     * Convert this value to an undefinable one
     */
    toUndefinable(): T | undefined {
        return match(this, {
            Some: (value) => value,
            None: () => undefined,
        })
    }

    /**
     * Convert this value to a nullable one
     */
    toNullable(): T | null {
        return match(this, {
            Some: (value) => value,
            None: () => null,
        })
    }

    /**
     * Cast this option's inner value to a parent type
     * If the provided type is not a parent of the inner value's one, the option will be returned but typechecking will fail
     */
    cast<U>(): T extends U ? Option<U> : never {
        return this.clone() as any
    }

    /**
     * Extend this option to allow another type to be part of it
     */
    extend<U>(): Option<T | U> {
        return this.clone()
    }

    /**
     * Transpose an Option<Result<T, E>> value to a Result<Option<T>, E>
     * @param option
     */
    static transpose<T, E>(option: Option<Result<T, E>>): Result<Option<T>, E> {
        return match(option, {
            Some: (result) =>
                match(result, {
                    Ok: (data) => Ok(Some(data)),
                    Err: (err) => Err(err),
                }),
            None: () => Ok(None()),
        })
    }

    /**
     * Create an option value from a nullable one
     * @param value A nullable value
     */
    static nullable<T = unknown>(value: T | null | undefined): Option<T> {
        return value === null || value === undefined ? None() : Some(value)
    }

    /**
     * Create an option value from a voidable one
     * @param value A voidable value
     */
    static voidable<T = unknown>(value: T | void): Option<T> {
        return value === undefined ? None() : Some(value)
    }

    /**
     * Create an option value from a potentially undefined one
     * @param value A potentially undefined value
     */
    static undefinable<T = unknown>(value: T | undefined): Option<T> {
        return value === undefined ? None() : Some(value)
    }

    /**
     * Return a Some(T) if the provided predicate is `true` ; else None() is returned
     * @param predicate
     * @param value
     */
    static cond<T>(predicate: boolean, value: T): Option<T> {
        return predicate ? Some(value) : None()
    }

    /**
     * Return a Some(T) if the provided property exists in the provided object ; else None() is returnedd
     * @param prop
     * @param obj
     */
    static prop<T extends object, K extends keyof T>(obj: T, prop: K): Option<T[K]> {
        return prop in obj ? Some(obj[prop]) : None()
    }
}

/**
 * Create a new concrete value
 * @param value A value
 */
export function Some<T>(value: T): Option<T> {
    return new Option(state("Some", value))
}

/**
 * Create a new 'None' value
 */
export function None<T = unknown>(): Option<T> {
    return new Option(state("None"))
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
