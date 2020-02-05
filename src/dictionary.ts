import { Option, Some, None } from "./option";
import { O } from "./objects";
import {Iter} from "./iter";

/**
 * Convert a dictionary type to a collection type
 */
export type DictionaryToCollection<K, V> = { [S in (K extends string | number | symbol ? K : string | number | symbol)]: V };

/**
 * Dictionary of values
 * @template K Type of keys
 * @template V Type of values
 */
export class Dictionary<K, V> {
    /** Dictionary's content */
    private readonly _content: Map<K, V>;

    /**
     * Create a new dictionary from a list of entries
     * @param content
     */
    constructor(content?: Array<[K, V]>) {
        this._content = new Map(content);
    }

    /**
     * Create a dictionary from an object
     * @param object
     */
    static fromObject<T extends object>(object: T): Dictionary<keyof T, T[keyof T]> {
        return new Dictionary(O.entries(object));
    }

    /**
     * Get the number of entries
     */
    get size(): number {
        return this._content.size;
    }

    /**
     * Check if a given key exists
     * @param key
     */
    has(key: K): boolean {
        return this._content.has(key);
    }

    /**
     * Get the value from a given key
     * @param key
     */
    get(key: K): Option<V> {
        return this.has(key) ? Some(this._content.get(key) as V) : None();
    }

    /**
     * Set the value related to a key
     * @param key
     * @param value
     */
    set(key: K, value: V): this {
        this._content.set(key, value);
        return this;
    }

    /**
     * Remove a given key
     * @param key
     */
    delete(key: K): boolean {
        return this._content.delete(key);
    }

    /**
     * Remove all entries
     */
    clear(callback?: (value: V, key: K, dict: this) => void): void {
        if (callback) {
            this.forEach(callback);
        }

        this._content.clear();
    }

    /**
     * Create a new dictionary with mapped keys
     * @param mapper
     */
    mapKeys<X>(mapper: (key: K, value: V) => X): Dictionary<X, V> {
        return new Dictionary(Array.from(this._content.entries()).map(entry => [ mapper(entry[0], entry[1]), entry[1] ]));
    }

    /**
     * Create a new dictionary with mapped values
     * @param mapper
     */
    mapValues<Y>(mapper: (value: V, key: K) => Y): Dictionary<K, Y> {
        return new Dictionary(Array.from(this._content.entries()).map(entry => [ entry[0], mapper(entry[1], entry[0]) ]));
    }

    /**
     * Create a new dictionary with mapped entries
     * @param mapper
     */
    map<X, Y>(mapper: (key: K, value: V) => [X, Y]): Dictionary<X, Y> {
        return new Dictionary(Array.from(this._content.entries()).map(entry => mapper(entry[0], entry[1])));
    }

    /**
     * Create a collection with mapped keys
     * @param mapper
     */
    mapKeysToCollection<X extends string | number | symbol>(mapper: (key: K, value: V) => X): { [S in X]: V } {
        return Object.fromEntries(Array.from(this._content.entries()).map(entry => [ mapper(entry[0], entry[1]), entry[1] ])) as { [S in X]: V };
    }

    /**
     * Create a collection with mapped values
     * @param mapper
     */
    mapValuesToCollection<Y>(mapper: (value: V, key: K) => Y): DictionaryToCollection<K, Y> {
        return Object.fromEntries(Array.from(this._content.entries()).map(entry => [ entry[0], mapper(entry[1], entry[0]) ])) as DictionaryToCollection<K, Y>;
    }

    /**
     * Create a collection with mapped entries
     * @param mapper
     */
    mapToCollection<X extends string | number | symbol, Y>(mapper: (key: K, value: V) => [X, Y]): { [S in X]: Y } {
        return Object.fromEntries(Array.from(this._content.entries()).map(entry => mapper(entry[0], entry[1]))) as { [S in X]: Y };
    }

    /**
     * Create an array with mapped entries
     * @param mapper
     */
    mapToArray<U>(mapper: (key: K, value: V) => U): U[] {
        return Array.from(this._content.entries()).map(entry => mapper(entry[0], entry[1]));
    }

    /**
     * Run a callback function for each entry of the dictionary
     * @param callback
     * @param thisArg
     */
    forEach(callback: (value: V, key: K, dict: this) => void, thisArg?: any): void {
        this._content.forEach((value, key) => callback(value, key, this));
    }

    /**
     * Iterate through the dictionary's keys
     */
    keys(): Iter<K> {
        return new Iter(this._content.keys());
    }

    /**
     * Iterate through the dictionary's values
     */
    values(): Iter<V> {
        return new Iter(this._content.values());
    }

    /**
     * Iterate through the dictionary's entries
     */
    entries(): Iter<[K, V]> {
        return new Iter(this._content.entries());
    }

    /**
     * Clone the dictionary
     */
    clone(): Dictionary<K, V> {
        return new Dictionary(Array.from(this._content.entries()));
    }

    /**
     * Iterate through the dictionary's entries
     */
    [Symbol.iterator](): IterableIterator<[K, V]> {
        return this._content.entries();
    }
}
