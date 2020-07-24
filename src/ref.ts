/**
 * @file Reference values to avoid cloning and share resources
 */

import { panic } from './env'
import { Consumers } from './list'
import { AbstractMatchable, Enum, State, match, state } from './match'
import { Option, Some } from './option'
import { Result } from './result'

export type RefMatch<T> = State<"Available", T> | State<"Destroyed">

/**
 * Reference
 * Allows to share primitive values across contexts
 * Allows to destroy the reference
 * @template T Type of referred value
 */
export class Ref<T> extends AbstractMatchable<RefMatch<T>> {
    private readonly _wrapper: Option<{ ref: T }>
    private _onDestroy: Consumers<void>

    /**
     * Create a new reference
     * @param value Referred value
     */
    constructor(value: { ref: T }) {
        super(() =>
            match(this._wrapper, {
                Some: (ref) => state("Available", ref.ref),
                None: () => state("Destroyed"),
            })
        )

        this._wrapper = Some(value)
        this._onDestroy = new Consumers()
    }

    /**
     * Is the reference available? (= has not been destroyed)
     */
    get alive(): boolean {
        return this._wrapper.isSome()
    }

    /**
     * Has the reference been destroyed?
     */
    get destroyed(): boolean {
        return this._wrapper.isNone()
    }

    /**
     * Read the reference's value
     * Panics if the reference has been destroyed
     */
    read(): T {
        return this._wrapper.expect("Cannot read a destroyed reference!").ref
    }

    /**
     * Try to read the reference's value
     */
    tryRead(): Option<T> {
        return this._wrapper.map((ref) => ref.ref)
    }

    /**
     * Write a value through the reference
     * Panics if the reference has been destroyed
     * @param value The value to write
     */
    write(value: T): this {
        this._wrapper.expect("Cannot write a destroyed reference!").ref = value
        return this
    }

    /**
     * Try to write the reference's value
     * @param value
     */
    tryWrite(value: T): Result<this, Enum<"Destroyed">> {
        return this._wrapper
            .map((ref) => {
                ref.ref = value
                return this
            })
            .okOr(new Enum("Destroyed"))
    }

    /**
     * Change the reference's result through a function
     * @param core A function that returns the referred's new value
     */
    apply(core: (value: T) => T): this {
        this._wrapper.expect("Cannot apply a callback inside a destroyed reference!").ref = core(this.read())
        return this
    }

    /**
     * Try to change the reference's result through a function
     * @param core
     */
    tryApply(core: (value: T) => T): Result<this, Enum<"Destroyed">> {
        return this._wrapper
            .map((ref) => {
                ref.ref = core(this.read())
                return this
            })
            .okOr(new Enum("Destroyed"))
    }

    /**
     * Destroy this reference
     * Panics if the reference has already been destroyed
     */
    destroy(): this {
        if (this._wrapper.isNone()) {
            panic("Cannot destroy a reference twice!")
        }

        this._wrapper.take()
        this._onDestroy.resolve()

        return this
    }

    /**
     * Register a callback to be ran when the reference is destroyed
     * If reference has already been destroyed, callback runs immediately
     * @param callback
     */
    onDestroy(callback: () => void): this {
        match(this, {
            Available: () => this._onDestroy.push(callback),
            Destroyed: () => callback(),
        })

        return this
    }

    /**
     * Clone this reference
     * Panics if the reference has been destroyed
     */
    clone(): Ref<T> {
        return new Ref(this._wrapper.expect("Cannot clone a destroyed reference!"))
    }

    /**
     * Check if two references point toward the same data
     * @param other
     */
    is(other: Ref<T>): boolean {
        const alive = this.alive

        if (alive && alive === other.alive) {
            return this._wrapper.unwrap() === other._wrapper.unwrap()
        }

        return false
    }

    /**
     * Wrap a data in a reference
     * @param data
     */
    static wrap<T>(data: T): Ref<T> {
        return new Ref({ ref: data })
    }
}
