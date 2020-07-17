/**
 * @file Constrained type
 */

import { assert } from './assert'
import { Err, Ok, Result } from './result'

/**
 * Constrained type
 * When assigning to this type, if the provided constraint callback returns 'false', the assignment is not performed
 * @template T Type
 */
export class With<T> {
    protected _constraint: (value: T) => boolean
    protected _value: T

    /**
     * Create a new constrained type
     * If the provided initial value is not accepted by the constraint, the program will panic
     * @param constraint The constraint function
     * @param initial The initial value
     */
    constructor(constraint: (value: T) => boolean, initial: T) {
        assert(constraint(initial), "Initial value does not respect provided type constraint")

        this._constraint = constraint
        this._value = initial
    }

    /**
     * Try to assign a new value
     * Will return an Err() without doing anything if the constraint rejects the value
     * @param value The value to assign
     */
    set(value: T): Result<null, null> {
        if (this._constraint(value)) {
            this._value = value
            return Ok(null)
        } else {
            return Err(null)
        }
    }

    /**
     * Get the current value
     */
    get(): T {
        return this._value
    }
}
