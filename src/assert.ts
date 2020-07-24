/**
 * @file Assertion utilities
 */

import { Dictionary } from './dictionary'
import { Either } from './either'
import { format, panic } from './env'
import { List } from './list'
import { O } from './objects'
import { Option } from './option'
import { Ref } from './ref'
import { Result } from './result'
import { forceType } from './typecasting'

/**
 * Assert equality of two values
 * @param left Left value
 * @param right Right value
 * @param panicMessage Panic message
 * @param _ctx [Internal parameter]
 * @example assertEq([ 1, 2 ], [ 1, 2 ])
 */
export function assertEq<T>(left: T, right: T, panicMessage?: string, _ctx: string[] = []): void | never {
    // Beautified panic function
    const fail = (message: string, ...params: unknown[]): never =>
        panic(`{} (${message})\n{}`, panicMessage || "Assertion failed", ...params, _ctx.join("\n"))

    // Ensure values type are identical
    if (typeof left !== typeof right) {
        fail("Left value is a {} value while right value is a {}", typeof left, typeof right)
    }

    // Check for primitives
    if (left === undefined || left === null || typeof left === "boolean" || typeof left === "number" || typeof left === "string") {
        if (left !== right) {
            fail("Left and right values (primitives) are not equal!")
        }

        return
    }

    // Ensure values constructor are identical (= instances of the same class)
    if (!right || forceType<object>(left).constructor !== forceType<object>(right).constructor) {
        fail("Type of left and right values mismatch!")
    }

    // Check for arrays
    if (O.isArray(left) && O.isArray(right)) {
        if (left.length !== right.length) {
            fail("Size of left array ({} elements) and right array ({} elements) mismatch", left.length, right.length)
        }

        for (let i = 0; i < left.length; i++) {
            assertEq(left[i], right[i], panicMessage, _ctx.concat("[Array].Index(" + i + ")"))
        }

        return
    }

    // Check for collections
    if (O.isCollection(left) && O.isCollection(right)) {
        const leftKeys = O.keys(left)
        const rightKeys = O.keys(right)

        if (leftKeys.length !== rightKeys.length) {
            fail("Left and right key-value objects do not have the same number of keys")
        }

        for (const key of leftKeys) {
            if (!rightKeys.includes(key)) {
                fail("Right object does not have left object's {} key", key as string)
            }

            assertEq((left as any)[key], (right as any)[key], panicMessage, _ctx.concat(("Key " + key) as string))
        }

        return
    }

    // Check for references
    if (left instanceof Ref && right instanceof Ref) {
        if (!left.is(right)) {
            fail("Left and right [Ref]s are not the same")
        }

        return
    }

    // Check for lists
    if (left instanceof List && right instanceof List) {
        if (left.length !== right.length) {
            fail("Size of left [List] ({} elements) and right [List] ({} elements) mismatch", left.length, right.length)
        }

        for (let i = 0; i < left.length; i++) {
            assertEq(left.get(i).unwrap(), right.get(i).unwrap(), panicMessage, _ctx.concat("[List].Index(" + i + ")"))
        }

        return
    }

    // Check for dictionaries
    if (left instanceof Dictionary && right instanceof Dictionary) {
        const leftKeys = left.keys().collect()
        const rightKeys = right.keys().collect()

        if (leftKeys.length !== rightKeys.length) {
            fail("Left and right dictionaries do not have the same number of keys")
        }

        for (const key of leftKeys) {
            if (!rightKeys.includes(key)) {
                fail("Left and right dictionaries do not have the same keys", key as string)
            }

            assertEq(left.get(key).unwrap(), right.get(key).unwrap(), panicMessage, _ctx.concat(("Key " + key) as string))
        }

        return
    }

    // Check for options
    if (left instanceof Option && right instanceof Option) {
        if (left.isSome() && !right.isSome()) {
            fail("Left [Option] is concrete but right [Option] is not")
        }

        if (!left.isSome() && right.isSome()) {
            fail("Left [Option] is not concrete but right [Option] is")
        }

        if (left.isSome()) {
            assertEq(left.unwrap(), right.unwrap(), panicMessage, _ctx.concat("[Option].Some"))
        }

        return
    }

    // Check for results
    if (left instanceof Result && right instanceof Result) {
        if (left.isOk() && !right.isOk()) {
            fail("Left [Result] is Ok but right [Result] is Err")
        }

        if (left.isErr() && !right.isErr()) {
            fail("Left [Result] is Err but right [Result] is Ok")
        }

        if (left.isOk()) {
            assertEq(left.ok().unwrap(), right.ok().unwrap(), panicMessage, _ctx.concat("[Result].Ok"))
        } else {
            assertEq(left.err().unwrap(), right.err().unwrap(), panicMessage, _ctx.concat("[Result].Err"))
        }

        return
    }

    // Check for either values
    if (left instanceof Either && right instanceof Either) {
        if (left.isLeft() && !right.isLeft()) {
            fail("Left [Either] does have its value on the left side but right [Either] does not")
        }

        if (!left.isLeft() && right.isLeft()) {
            fail("Left [Either] does have its value on the right side but right [Either] does not")
        }

        if (left.isLeft()) {
            assertEq(left.left().unwrap(), right.left().unwrap(), panicMessage, _ctx.concat("[Either].Left"))
        } else {
            assertEq(left.right().unwrap(), right.right().unwrap(), panicMessage, _ctx.concat("[Either].Right"))
        }

        return
    }

    // Handle unsupported types
    if (left !== right) {
        fail("Left and right values are not strictly the same values")
    }
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
