/**
 * @file Rewindable iterators - iterators that can go back
 */

import {None, Option} from "./option";
import {List} from "./list";
import {Iter} from "./iter";

/**
 * Rewindable iterator
 * This model takes more memory and is a tad slower, but keeps allows to go back in the yielded values
 * @template T Values yield by the iterator
 */
export class Rewindable<T> extends Iter<T> {
    /** List of yielded values if the iterator is rewindable */
    protected readonly _yielded: List<T>;

    /**
     * Create a new iterator
     * @param iterable An iterable value
     * @param collect Collect all values at once
     */
    constructor(iterable: { [Symbol.iterator](): IterableIterator<T> }, collect = false) {
        super(iterable);
        this._yielded = new List();

        if (collect) {
            this.collect();
            this._pointer = -1;
        }
    }

    /**
     * Get all yielded values
     */
    yielded(): List<T> {
        return this._yielded.clone();
    }

    /**
     * Get an already-yielded value
     * @param index
     */
    get(index: number): Option<T> {
        return this._yielded.get(index);
    }

    /**
     * Go to the previous value
     * @returns `None` if the iterator didn't yield any value or if the pointer is already on the first value
     */
    prev(): Option<T> {
        if (this._pointer <= 0) {
            return None();
        }

        return this._yielded.get(-- this._pointer);
    }

    /**
     * Get the current value
     * @returns `None` if the iterator didn't yield any value
     */
    current(): Option<T> {
        return this._yielded.get(this._pointer);
    }

    /**
     * Get the next value
     * If it hasn't been yielded yet, it will be
     * @returns The yielded value, or `None` if the iterator is already done
     */
    next(): Option<T> {
        if (this._yielded.has(this._pointer + 1)) {
            return this._yielded.get(this._pointer + 1);
        }

        return super.next().some(value => this._yielded.push(value));
    }

    /**
     * Collect all values of the iterator
     * @param joinLeft Join all previously-yielded values
     */
    collect(joinLeft = false): List<T> {
        const startIndex = this._pointer;

        while (!this._done) {
            this.next();
        }

        return joinLeft ? this.yielded() : this.yielded().slice(startIndex + 1);
    }
}
