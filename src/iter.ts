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
        super(() => (this._done ? state("Done") : this._pointer >= 0 ? state("Created") : state("AtStep", this._pointer)))

        this._iterator = iterable[Symbol.iterator]()
        this._onYield = new Consumers()
        this._peeked = None()
        this._done = false
        this._pointer = -1
    }

    /**
     * Is the iterator done?
     */
    get done(): boolean {
        return this._done
    }

    /**
     * Get the current value's index (-1 if the iterator didn't yield any value)
     */
    get pointer(): number {
        return this._pointer
    }

    /**
     * Get the next value
     * @returns The yielded value, or `None` if the iterator is already done
     */
    next(): Option<T> {
        if (this.done) {
            return None()
        }

        if (this._peeked.isSome()) {
            return Some(this._peeked.take().unwrap())
        }

        this._pointer++

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
        this._peeked = Some(next.unwrap())

        return Some(next.unwrap())
    }

    /**
     * Collect all yield values in a list
     * Consumes the iterator
     */
    collect(): List<T> {
        const yielded = new List<T>()

        while (!this._done) {
            this.next().some((value) => yielded.push(value))
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
            this.next().some((value) => yielded.push(value))
        }

        return yielded
    }

    /**
     * Join values to a string
     * Consumes the iterator
     * @param str Joint
     * @param stringifyer (Optional) Stringifyer for values
     */
    join(str: string, stringifyer?: (value: T) => string): string {
        return this.collect()
            .map((val) => (stringifyer ? stringifyer(val) : val))
            .join(str)
    }

    /**
     * Inspect elements without modifying them
     */
    inspect(inspector: (value: T) => void): this {
        this._onYield.push((value) => inspector(value))
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
    map<U>(mapper: (value: T, position: number) => U): Iter<U> {
        const that = this
        let position = 0

        return Iter.fromGenerator(function* (): IterableIterator<U> {
            for (const value of that) {
                yield mapper(value, position++)
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
    any(predicate: (value: T) => boolean): boolean {
        for (const value of this) {
            if (predicate(value)) {
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
    find(predicate: (value: T) => boolean): Option<T> {
        for (const value of this) {
            if (predicate(value)) {
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
    position(predicate: (value: T) => boolean): Option<number> {
        for (const [position, value] of this.enumerate()) {
            if (predicate(value)) {
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
    all(predicate: (value: T) => boolean): boolean {
        for (const value of this) {
            if (!predicate(value)) {
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
    filter(predicate: (value: T) => boolean): Iter<T> {
        const that = this

        return Iter.fromGenerator(function* () {
            for (const value of that) {
                if (predicate(value)) {
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
    filterMap<U>(predicate: (value: T) => Option<U>): Iter<U> {
        const that = this

        return Iter.fromGenerator(function* () {
            for (const value of that) {
                const mapped = predicate(value)

                if (mapped.isSome()) {
                    yield mapped.unwrap()
                }
            }
        })
    }

    /**
     * Skip values while the provided predicate returns true
     * Consumes the iterator
     * @param predicate
     */
    skipWhile(predicate: (value: T) => boolean): Iter<T> {
        const that = this

        return Iter.fromGenerator(function* () {
            let finished = false

            for (const value of that) {
                if (finished || !predicate(value)) {
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
    takeWhile(predicate: (value: T) => boolean): Iter<T> {
        const that = this

        return Iter.fromGenerator(function* () {
            for (const value of that) {
                if (!predicate(value)) {
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
        return this.takeWhile((_) => this._pointer - start <= values)
    }

    /**
     * Turn the rewindable iterator into a native iterator
     */
    [Symbol.iterator](): IterableIterator<T> {
        return this._iterator
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
