/**
 * @file Powered-up iterators
 */

import { Consumers, List } from './list'
import { AbstractMatchable, State, state } from './match'
import { O } from './objects'
import { None, Option, Some } from './option'

export type IterState = State<"Created"> | State<"AtStep", number> | State<"Done">

/**
 * Iterator
 * @template T Values yield by the iterator
 */
export class Iter<T> extends AbstractMatchable<IterState> implements Iterable<T> {
    /** Sub-iterator used to yield values */
    protected readonly _iterator: IterableIterator<T>
    /** Event listeners to call when a value is yielded */
    protected readonly _onYield: Consumers<T>
    /** Peeked values */
    protected _peeked: Option<T>
    /** Is the iterator done? */
    protected _done: boolean
    /** Index of the current value */
    protected _pointer: number

    /**
     * Create a new iterator
     * @param iterable An iterable value
     */
    constructor(iterable: { [Symbol.iterator](): IterableIterator<T> }) {
        super(() => (this._done ? state("Done") : this._pointer === 0 ? state("Created") : state("AtStep", this._pointer)))

        this._iterator = iterable[Symbol.iterator]()
        this._onYield = new Consumers()
        this._peeked = None()
        this._done = false
        this._pointer = 0
    }

    /**
     * Is the iterator done?
     */
    get done(): boolean {
        return this._done
    }

    /**
     * Get the current value's index (0 if the iterator didn't yield any value)
     */
    get pointer(): number {
        return this._pointer
    }

    /**
     * Get the next value
     * @returns The yielded value, or `None` if the iterator is already done
     */
    next(): Option<T> {
        if (this._done) {
            return None()
        }

        this._pointer++

        if (this._peeked.isSome()) {
            const prev = this._peeked.data
            this._peeked = None()
            return Some(prev)
        }

        const next = this._iterator.next()

        if (next.done) {
            this._done = true
            return None()
        }

        this._onYield.trigger(next.value)

        return Some(next.value)
    }

    /**
     * Get the next value from the iterator without advancing it
     * The next time .next() will be called, the peeked value will be returned
     */
    peek(): Option<T> {
        let next = this.next()

        if (next.isNone()) {
            return None()
        }

        this._pointer--
        this._peeked = Some(next.data)

        return Some(next.data)
    }

    /**
     * Collect all yield values in a list
     * Consumes the iterator
     */
    collect(): List<T> {
        const yielded = new List<T>()

        while (!this._done) {
            this.next().ifSome((value) => yielded.push(value))
        }

        return yielded
    }

    /**
     * Collect all yield values in an array
     * Consumes the iterator
     */
    collectArray(): Array<T> {
        const yielded: T[] = []

        while (!this._done) {
            this.next().ifSome((value) => yielded.push(value))
        }

        return yielded
    }

    /**
     * Consume the iterator into a list
     * @param mapper
     * @param toList Put all values into a list (default: true)
     */
    consume<U>(mapper: (value: T, index: number, iterator: this) => U, toList: true): List<T>
    consume<U>(mapper: (value: T, index: number, iterator: this) => U, toList: false): void
    consume<U>(mapper: (value: T, index: number, iterator: this) => U, toList = false): List<U> | void {
        const list = new List<U>()

        while (!this._done) {
            this.next().ifSome((value) => {
                const mapped = mapper(value, this._pointer - 1, this)
                if (toList) list.push(mapped)
            })
        }

        return toList ? list : void 0
    }

    /**
     * Consume the iterator by running an inspection function on each yield item
     * Equivalent of .consume() with 'toList' set to 'false'
     */
    forEach(inspector: (value: T, index: number, iterator: this) => void): void {
        while (!this._done) {
            this.next().ifSome((value) => inspector(value, this._pointer - 1, this))
        }
    }

    /**
     * Join values to a string
     * Consumes the iterator
     * @param str Joint
     * @param stringifyer (Optional) Stringifyer for values
     */
    join(str: string, stringifyer?: (value: T, index: number, iterator: this) => string): string {
        return this.collect()
            .map((val) => (stringifyer ? stringifyer(val, this._pointer - 1, this) : val))
            .join(str)
    }

    /**
     * Inspect elements without modifying them
     * This method is lazy so inspection will only occur when values are yielded
     * @param inspector
     */
    inspect(inspector: (value: T, index: number, iterator: this) => void): this {
        this._onYield.push((value) => inspector(value, this._pointer - 1, this))
        return this
    }

    /**
     * Count the number of values in the iterator
     * Consumes the iterator
     */
    count(): number {
        let counter = 0
        for (const _ of this) counter++
        return counter
    }

    /**
     * Get the nth value of the iterator (0 is the current value)
     * Consumes the iterator up to the nth item
     * @param nth
     */
    nth(nth: number): Option<T> {
        for (const [pos, value] of this.enumerate()) {
            if (nth === pos) {
                return Some(value)
            }
        }

        return None()
    }

    /**
     * Get the last value in the iterator
     * Consumes the iterator
     */
    last(): Option<T> {
        let last = None<T>()

        for (const value of this) {
            last = Some(value)
        }

        return last
    }

    /**
     * Map this iterator's values
     * Consumes the iterator
     * @param value
     * @param position
     */
    map<U>(mapper: (value: T, position: number, index: number, iterator: this) => U): Iter<U> {
        const that = this
        let position = 0

        return Iter.fromGenerator(function* (): IterableIterator<U> {
            for (const value of that) {
                yield mapper(value, position++, that._pointer - 1, that)
            }
        })
    }

    /**
     * Enumerate this iterator
     * Consumes the iterator
     */
    enumerate(): Iter<[number, T]> {
        return this.map((value, position) => [position, value])
    }

    /**
     * Check if any value in the iterator matches a predicate
     * Consumes the iterator
     * @param predicate
     */
    any(predicate: (value: T, pointer: number, iterator: this) => boolean): boolean {
        for (const value of this) {
            if (predicate(value, this._pointer - 1, this)) {
                return true
            }
        }

        return false
    }

    /**
     * Get the first element matching a predicate
     * Consumes the iterator
     * @param predicate
     */
    find(predicate: (value: T, pointer: number, iterator: this) => boolean): Option<T> {
        for (const value of this) {
            if (predicate(value, this._pointer - 1, this)) {
                return Some(value)
            }
        }

        return None()
    }

    /**
     * Get the position of the first element matching a predicate
     * Consumes the iterator
     * @param predicate
     */
    position(predicate: (value: T, pointer: number, iterator: this) => boolean): Option<number> {
        for (const [position, value] of this.enumerate()) {
            if (predicate(value, this._pointer - 1, this)) {
                return Some(position)
            }
        }

        return None()
    }

    /**
     * Check if all values in the iterator match a predicate
     * Consumes the iterator
     * @param predicate
     */
    all(predicate: (value: T, pointer: number, iterator: this) => boolean): boolean {
        for (const value of this) {
            if (!predicate(value, this._pointer - 1, this)) {
                return false
            }
        }

        return true
    }

    /**
     * Create an iterator that filters this one's elements
     * Consumes the iterator
     * @param predicate
     */
    filter(predicate: (value: T, pointer: number, iterator: this) => boolean): Iter<T> {
        const that = this

        return Iter.fromGenerator(function* () {
            for (const value of that) {
                if (predicate(value, that._pointer - 1, that)) {
                    yield value
                }
            }
        })
    }

    /**
     * Create an iterator that filters and maps this one's values
     * Consumes the iterator
     * @param predicate
     */
    filterMap<U>(predicate: (value: T, pointer: number, iterator: this) => Option<U>): Iter<U> {
        const that = this

        return Iter.fromGenerator(function* () {
            for (const value of that) {
                const mapped = predicate(value, that._pointer - 1, that)

                if (mapped.isSome()) {
                    yield mapped.data
                }
            }
        })
    }

    /**
     * Skip values while the provided predicate returns true
     * Consumes the iterator
     * @param predicate
     */
    skipWhile(predicate: (value: T, pointer: number, iterator: this) => boolean): Iter<T> {
        const that = this

        return Iter.fromGenerator(function* () {
            let finished = false

            for (const value of that) {
                if (finished || !predicate(value, that._pointer - 1, that)) {
                    finished = true
                    yield value
                }
            }
        })
    }

    /**
     * Yield values while the provided predicate returns true
     * Consumes the iterator
     * @param predicate
     */
    takeWhile(predicate: (value: T, pointer: number, iterator: this) => boolean): Iter<T> {
        const that = this

        return Iter.fromGenerator(function* () {
            for (const value of that) {
                if (!predicate(value, that._pointer - 1, that)) {
                    return
                }

                yield value
            }
        })
    }

    /**
     * Skip a given number of values
     * Consumes the iterator up to the number of specifed values
     */
    skip(values: number): this {
        for (let i = 0; i < values; i++) {
            this.next()
        }

        return this
    }

    /**
     * Yield the nth first elements
     */
    take(values: number): Iter<T> {
        const start = this._pointer
        return this.takeWhile((_) => this._pointer - start < values)
    }

    /**
     * Turn the rewindable iterator into a native iterator
     */
    [Symbol.iterator](): IterableIterator<T> {
        return {
            next: () =>
                this.next()
                    .map((value) => ({ done: false, value }))
                    .unwrapOr({ done: true, value: undefined as any }),

            [Symbol.iterator]: () => this[Symbol.iterator](),
        }
    }

    /**
     * Create an iterator from a generator function
     * @param generator
     */
    static fromGenerator<T>(generator: () => IterableIterator<T>): Iter<T> {
        return new Iter(generator())
    }
}

/**
 * Create a rewindable iterator from an object's entries
 * @param object
 */
export function iter<T extends object>(object: T): Iter<[string, T[keyof T]]> {
    return new Iter(O.entries(object))
}
