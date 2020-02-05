import {MatchableType, State, state} from "./match";
import {Consumers, List} from "./list";
import {None, Option, Some} from "./option";
import {O} from "./objects";

export type IterState =
    | State<"Created">
    | State<"AtStep", number>
    | State<"Done">;

/**
 * Iterator
 * @template T Values yield by the iterator
 */
export class Iter<T> extends MatchableType<IterState> implements Iterable<T> {
    /** Sub-iterator used to yield values */
    protected readonly _iterator: IterableIterator<T>;
    /** Event listeners to call when a value is yielded */
    protected readonly _onYield: Consumers<T>;
    /** Is the iterator done? */
    protected _done: boolean;
    /** Index of the current value */
    protected _pointer: number;

    /**
     * Create a new iterator
     * @param iterable An iterable value
     */
    constructor(iterable: { [Symbol.iterator](): IterableIterator<T> }) {
        super(() => this._done ? state("Done") : (this._pointer >= 0 ? state("Created") : state("AtStep", this._pointer)));

        this._iterator = iterable[Symbol.iterator]();
        this._onYield = new Consumers();
        this._done = false;
        this._pointer = -1;
    }

    /**
     * Is the iterator done?
     */
    get done(): boolean {
        return this._done;
    }

    /**
     * Get the current value's index (-1 if the iterator didn't yield any value)
     */
    get pointer(): number {
        return this._pointer;
    }

    /**
     * Get the next value
     * @returns The yielded value, or `None` if the iterator is already done
     */
    next(): Option<T> {
        if (this.done) {
            return None();
        }

        this._pointer++;

        const next = this._iterator.next();

        if (next.done) {
            this._done = true;
            return None();
        }

        this._onYield.trigger(next.value);

        return Some(next.value);
    }

    /**
     * Collect all values of the iterator
     */
    collect(): List<T> {
        const yielded = new List<T>();

        while (!this._done) {
            this.next().some(value => yielded.push(value));
        }

        return yielded;
    }

    /**
     * Check if any value in the iterator matches a predicate
     * @param predicate
     */
    any(predicate: (value: T) => boolean): boolean {
        for (const value of this) {
            if (predicate(value)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get the first element matching a predicate
     * @param predicate
     */
    position(predicate: (value: T) => boolean): Option<T> {
        for (const value of this) {
            if (predicate(value)) {
                return Some(value);
            }
        }

        return None();
    }

    /**
     * Check if all values in the iterator match a predicate
     * @param predicate
     */
    all(predicate: (value: T) => boolean): boolean {
        for (const value of this) {
            if (!predicate(value)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Turn the rewindable iterator into a native iterator
     */
    [Symbol.iterator](): IterableIterator<T> {
        return this._iterator;
    }

    /**
     * Create an iterator from a generator function
     * @param generator
     */
    static fromGenerator<T>(generator: () => IterableIterator<T>): Iter<T> {
        return new Iter(generator());
    }
}

/**
 * Create a rewindable iterator from an object's entries
 * @param object
 */
export function iter<T extends object>(object: T): Iter<[keyof T, T[keyof T]]> {
    return new Iter(O.entries(object));
}