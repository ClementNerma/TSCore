/**
 * @file Assertion utilities
 */

import { Dictionary } from "./dictionary"
import { format, panic } from "./env"
import { List } from "./list"
import { O } from "./objects"
import { Option } from "./option"
import { Ref } from "./ref"
import { Err, Ok, Result } from "./result"

export interface FailedEqCmp {
    readonly message: string
    readonly params: ReadonlyArray<unknown>
    readonly context: ReadonlyArray<string>
}

/**
 * Check if two values are equal, deeply
 * Includes support for TS-Core types
 * @param left Left value
 * @param right Right value
 * @returns 'true' if the values are equal, else an error message to format along with its parameters
 * @example deepCompare({ a: Some(2) }, { a: Some(2) }) => ok
 * @example deepCompare({ a: Some(2) }, { a: None } }) => err
 */
export function deepCompareEq(left: unknown, right: unknown, _ctx: string[] = []): Result<true, FailedEqCmp> {
    // Beautified panic function
    const fail = (message: string, ...params: unknown[]): Result<true, FailedEqCmp> =>
        Err({
            message,
            params,
            context: _ctx,
        })

    // Ensure values type are identical
    if (typeof left !== typeof right) {
        return fail("Left value is a {} value while right value is a {}", typeof left, typeof right)
    }

    // Check for primitives
    if (left === undefined || left === null || typeof left === "boolean" || typeof left === "number" || typeof left === "string") {
        if (left !== right) {
            return fail("Left and right values (primitives) are not equal!")
        }

        return Ok(true)
    }

    // Ensure values constructor are identical (= instances of the same class)
    if (!right || (left as object).constructor !== (right as object).constructor) {
        return fail("Type of left and right values mismatch!")
    }

    // Check for arrays
    if (O.isArray(left) && O.isArray(right)) {
        if (left.length !== right.length) {
            return fail("Size of left array ({} elements) and right array ({} elements) mismatch", left.length, right.length)
        }

        for (let i = 0; i < left.length; i++) {
            const test = deepCompareEq(left[i], right[i], _ctx.concat("[Array].Index(" + i + ")"))

            if (test.isErr()) {
                return test.asErr()
            }
        }

        return Ok(true)
    }

    // Check for collections
    if (O.isCollection(left) && O.isCollection(right)) {
        const leftKeys = O.keys(left)
        const rightKeys = O.keys(right)

        if (leftKeys.length !== rightKeys.length) {
            return fail("Left and right key-value objects do not have the same number of keys")
        }

        for (const key of leftKeys) {
            if (!rightKeys.includes(key)) {
                return fail("Right object does not have left object's {} key", key as string)
            }

            const test = deepCompareEq((left as any)[key], (right as any)[key], _ctx.concat(("Key " + key) as string))

            if (test.isErr()) {
                return test.asErr()
            }
        }

        return Ok(true)
    }

    // Check for references
    if (left instanceof Ref && right instanceof Ref) {
        if (!left.is(right)) {
            return fail("Left and right [Ref]s are not the same")
        }

        return Ok(true)
    }

    // Check for lists
    if (left instanceof List && right instanceof List) {
        if (left.length !== right.length) {
            return fail("Size of left [List] ({} elements) and right [List] ({} elements) mismatch", left.length, right.length)
        }

        for (let i = 0; i < left.length; i++) {
            const test = deepCompareEq(left.get(i).unwrap(), right.get(i).unwrap(), _ctx.concat("[List].Index(" + i + ")"))

            if (test.isErr()) {
                return test.asErr()
            }
        }

        return Ok(true)
    }

    // Check for dictionaries
    if (left instanceof Dictionary && right instanceof Dictionary) {
        const leftKeys = left.keys().collect()
        const rightKeys = right.keys().collect()

        if (leftKeys.length !== rightKeys.length) {
            return fail("Left and right dictionaries do not have the same number of keys")
        }

        for (const key of leftKeys) {
            if (!rightKeys.includes(key)) {
                return fail("Left and right dictionaries do not have the same keys", key as string)
            }

            const test = deepCompareEq(left.get(key).unwrap(), right.get(key).unwrap(), _ctx.concat(("Key " + key) as string))

            if (test.isErr()) {
                return test.asErr()
            }
        }

        return Ok(true)
    }

    // Check for options
    if (Option.is(left) && Option.is(right)) {
        if (left.isSome() && !right.isSome()) {
            return fail("Left [Option] is concrete but right [Option] is not")
        }

        if (!left.isSome() && right.isSome()) {
            return fail("Left [Option] is not concrete but right [Option] is")
        }

        if (left.isSome()) {
            const test = deepCompareEq(left.unwrap(), right.unwrap(), _ctx.concat("[Option].Some"))

            if (test.isErr()) {
                return test.asErr()
            }
        }

        return Ok(true)
    }

    // Check for results
    if (Result.is(left) && Result.is(right)) {
        if (left.isOk() && !right.isOk()) {
            return fail("Left [Result] is Ok but right [Result] is Err")
        }

        if (left.isErr() && !right.isErr()) {
            return fail("Left [Result] is Err but right [Result] is Ok")
        }

        return left.isOk()
            ? deepCompareEq(left.maybeOk().unwrap(), right.maybeOk().unwrap(), _ctx.concat("[Result].Ok"))
            : deepCompareEq(left.maybeErr().unwrap(), right.maybeErr().unwrap(), _ctx.concat("[Result].Err"))
    }

    // Handle unsupported types
    if (left !== right) {
        return fail("Left and right values are not strictly the same values")
    }

    return Ok(true)
}

/**
 * Assert equality of two values
 * @param left Left value
 * @param right Right value
 * @param panicMessage Panic message
 * @param _ctx [Internal parameter]
 * @example assertEq([ 1, 2 ], [ 1, 2 ])
 */
export function assertEq<T>(left: T, right: T, panicMessage?: string): void | never {
    deepCompareEq(left, right).unwrapOrElse(({ message, params, context }) =>
        panic(`{}: ${message}\n{}`, panicMessage ?? "Assertion failed", ...params, context.join("\n"))
    )
}

/**
 * Assert that two values are identical
 * @param left
 * @param right
 * @param strict Check strictly (=== operator)
 * @param panicMessage Panic message
 * @example assertIs(2, 2)
 * @example assertIs(2, "2", true)
 */
export function assertIs(left: unknown, right: unknown, panicMessage?: string, strict = true): void | never {
    if (strict ? left !== right : left != right) {
        panic("{}", panicMessage || format("Assertion failed (Left and right values are not {}identical)", strict ? "strictly " : ""))
    }
}

/**
 * Assert that a predicate is `true`
 * @param predicate
 * @param panicMessage Panic message
 * @example assert(1 === 1)
 */
export function assert(predicate: boolean, panicMessage?: string): void | never {
    if (!predicate) {
        panic("{}", panicMessage || "Assertion failed")
    }
}
