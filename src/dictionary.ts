/**
 * @file Represent collections in a type-safe way
 */

import { Iter } from './iter'
import { O } from './objects'
import { None, Option, Some } from './option'
import { Err, Ok, Result } from './result'
import { forceType } from './typecasting'

/**
 * Convert a dictionary type to a collection type
 */
export type DictionaryToCollection<K, V> = {
    [S in K extends string | number | symbol ? K : string | number | symbol]: V
}

/**
 * Dictionary of values
 * @template K Type of keys
 * @template V Type of values
 */
export class Dictionary<K, V> {
    /** Dictionary's content */
    private readonly _content: Map<K, V>

    /**
     * Create a new dictionary from a list of entries
     * @param content
     */
    constructor(content?: Array<[K, V]>) {
        this._content = new Map(content)
    }

    /**
     * Create a dictionary from an object
     * @param object
     */
    static fromObject<T extends object>(object: T): Dictionary<keyof T, T[keyof T]> {
        return new Dictionary(forceType(O.entries(object)))
    }

    /**
     * Get the number of entries
     */
    get size(): number {
        return this._content.size
    }

    /**
     * Check if the dictionary is empty
     */
    empty(): boolean {
        return this._content.size === 0
    }

    /**
     * Check if a given key exists
     * @param key
     */
    has(key: K): boolean {
        return this._content.has(key)
    }

    /**
     * Get the value from a given key
     * @param key
     */
    get(key: K): Option<V> {
        return this.has(key) ? Some(this._content.get(key) as V) : None()
    }

    /**
     * Set the value related to a key
     * @param key
     * @param value
     */
    set(key: K, value: V): this {
        this._content.set(key, value)
        return this
    }

    /**
     * Get the value related to a key, or set it if it does not exist yet
     * @param key
     * @param value
     */
    getOrSet(key: K, value: V): V {
        return this.get(key).unwrapOrElse(() => {
            this.set(key, value)
            return value
        })
    }

    /**
     * Get the value related to a key, or set it if it using a callback if it does not exist
     * @param key
     * @param setter
     */
    getOrSetWith(key: K, setter: (key: K, dict: this) => V): V {
        return this.get(key).unwrapOrElse(() => {
            const value = setter(key, this)
            this.set(key, value)
            return value
        })
    }

    /**
     * Remove a given key
     * @param key
     */
    delete(key: K): boolean {
        return this._content.delete(key)
    }

    /**
     * Remove all entries
     */
    clear(callback?: (value: V, key: K, dict: this) => void): void {
        if (callback) {
            this.forEach(callback)
        }

        this._content.clear()
    }

    /**
     * Create a new dictionary with mapped keys
     * @param mapper
     */
    mapKeys<X>(mapper: (key: K, value: V) => X): Dictionary<X, V> {
        return new Dictionary(Array.from(this._content.entries()).map((entry) => [mapper(entry[0], entry[1]), entry[1]]))
    }

    /**
     * Create a new dictionary with mapped values
     * @param mapper
     */
    mapValues<Y>(mapper: (value: V, key: K) => Y): Dictionary<K, Y> {
        return new Dictionary(Array.from(this._content.entries()).map((entry) => [entry[0], mapper(entry[1], entry[0])]))
    }

    /**
     * Create a new dictionary with mapped entries
     * @param mapper
     */
    map<X, Y>(mapper: (key: K, value: V) => [X, Y]): Dictionary<X, Y> {
        return new Dictionary(Array.from(this._content.entries()).map((entry) => mapper(entry[0], entry[1])))
    }

    /**
     * Create a collection with mapped keys
     * @param mapper
     */
    mapKeysToCollection<X extends string | number | symbol>(mapper: (key: K, value: V) => X): { [S in X]: V } {
        return O.fromEntries(Array.from(this._content.entries()).map((entry) => [mapper(entry[0], entry[1]), entry[1]])) as { [S in X]: V }
    }

    /**
     * Create a collection with mapped values
     * Fails if all keys are not either strings, symbols or numbers
     * @param mapper
     */
    mapValuesToCollection<Y>(mapper: (value: V, key: K) => Y): Result<DictionaryToCollection<K, Y>, void> {
        if (this.size == 0) {
            return Ok(forceType({}))
        }

        if (this.keys().any((key) => !["string", "number", "symbol"].includes(typeof key))) {
            return Err(undefined)
        } else {
            return Ok(
                O.fromEntries(
                    forceType<[number | string | symbol, Y][]>(
                        Array.from(this._content.entries()).map((entry) => [entry[0], mapper(entry[1], entry[0])])
                    )
                ) as DictionaryToCollection<K, Y>
            )
        }
    }

    /**
     * Create a collection with mapped values
     * Does not check if keys are valid object indexes, so this function *WILL* return weird results
     *   if all keys are not either strings, symbols or numbers.
     * For a safe conversion, see .mapValuesToCollection()
     * This function's only advantage is it's faster to process than its safe counterpart as it does
     *   not check all keys in the dictionary.
     * @param mapper
     */
    mapValuesToCollectionUnchecked<Y>(mapper: (value: V, key: K) => Y): DictionaryToCollection<K, Y> {
        return O.fromEntries(
            forceType<[number | string | symbol, Y][]>(Array.from(this._content.entries()).map((entry) => [entry[0], mapper(entry[1], entry[0])]))
        ) as DictionaryToCollection<K, Y>
    }

    /**
     * Create a collection with mapped entries
     * @param mapper
     */
    mapToCollection<X extends string | number | symbol, Y>(mapper: (key: K, value: V) => [X, Y]): { [S in X]: Y } {
        return O.fromEntries(Array.from(this._content.entries()).map((entry) => mapper(entry[0], entry[1]))) as { [S in X]: Y }
    }

    /**
     * Create an array with mapped entries
     * @param mapper
     */
    mapToArray<U>(mapper: (key: K, value: V) => U): U[] {
        return Array.from(this._content.entries()).map((entry) => mapper(entry[0], entry[1]))
    }

    /**
     * Test and map all keys and values in the dictionary using a testing function
     * If all keys and values are mapped to Ok() values, a list with the mapped values is returned
     * As soon as an error (mapped to Err()) is encountered, the error is returned
     * @param tester
     */
    resultable<X, Y, E>(tester: (key: K, value: V, dict: this) => Result<[X, Y], E>): Result<Dictionary<X, Y>, E> {
        const mapped = new Dictionary<X, Y>()

        for (const [key, value] of this._content.entries()) {
            const result = tester(key, value, this)

            if (result.isOk()) {
                const [mappedKey, mappedValue] = result.unwrap()
                mapped.set(mappedKey, mappedValue)
            } else {
                return Err(result.unwrapErr())
            }
        }

        return Ok(mapped)
    }

    /**
     * Test and map all values in the dictionary using a testing function
     * If all values are mapped to Ok() values, a list with the mapped values is returned
     * As soon as an error (mapped to Err()) is encountered, the error is returned
     * @param tester
     */
    resultableValues<U, E>(tester: (key: K, value: V, dict: this) => Result<U, E>): Result<Dictionary<K, U>, E> {
        const mapped = new Dictionary<K, U>()

        for (const [key, value] of this._content.entries()) {
            const result = tester(key, value, this)

            if (result.isOk()) {
                mapped.set(key, result.unwrap())
            } else {
                return Err(result.unwrapErr())
            }
        }

        return Ok(mapped)
    }

    /**
     * Run a callback function for each entry of the dictionary
     * @param callback
     * @param thisArg
     */
    forEach(callback: (value: V, key: K, dict: this) => void, thisArg?: any): void {
        this._content.forEach((value, key) => callback(value, key, this))
    }

    /**
     * Iterate through the dictionary's keys
     */
    keys(): Iter<K> {
        return new Iter(this._content.keys())
    }

    /**
     * Iterate through the dictionary's values
     */
    values(): Iter<V> {
        return new Iter(this._content.values())
    }

    /**
     * Iterate through the dictionary's entries
     */
    entries(): Iter<[K, V]> {
        return new Iter(this._content.entries())
    }

    /**
     * Clone the dictionary
     */
    clone(): Dictionary<K, V> {
        return new Dictionary(Array.from(this._content.entries()))
    }

    /**
     * Iterate through the dictionary's entries
     */
    [Symbol.iterator](): IterableIterator<[K, V]> {
        return this._content.entries()
    }
}

/**
 * Record (dictionary with string keys)
 * @template V Type of values
 */
export type RecordDict<V> = Dictionary<string, V>
