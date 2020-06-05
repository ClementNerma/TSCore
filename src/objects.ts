/**
 * @file Utility functions for objects
 */

import { forceType } from "./typecasting"

/**
 * Key-value object type
 */
export type Collection<T> = { [key: string]: T }

/**
 * Object utilities
 */
export class O {
    /**
     * Check if a value is an array
     * Alias of `Array.isArray`, but with stricter typing
     * @param value
     */
    static isArray(value: unknown): value is unknown[] {
        return Array.isArray(value)
    }

    /**
     * Check if a value is a key-value object
     * @param value
     */
    static isCollection(value: unknown): value is Collection<unknown> {
        return value && (value as object).constructor === {}.constructor
    }

    /**
     * Create an array from a generation function
     * @param length Length of the array
     * @param generator Generation function (takes index as a parameter)
     */
    static array<T>(length: number, generator: (index: number) => T): T[] {
        let index = 0
        return Array.apply(null, Array(length)).map(() => generator(index++))
    }

    /**
     * Get the keys of an object
     * Alias of `Reflect.ownKeys`, but with stricter typing
     * @param object
     */
    static keys<T extends object>(object: T): Array<keyof T> {
        return Reflect.ownKeys(object) as Array<keyof T>
    }

    /**
     * Get the values of an object
     * @param object
     */
    static values<T extends object>(object: T): Array<T[keyof T]> {
        return O.keys(object).map((key) => object[key])
    }

    /**
     * Get entries of an object
     * @param object
     */
    static entries<T extends object>(object: T): Array<[string, T[keyof T]]> {
        return O.keys(object).map((key) => [key.toString(), object[key]])
    }

    /**
     * Clone softly an object (clones keys but not values)
     * @param object
     */
    static cloneSoft<T extends object>(object: T): T {
        return Object.assign({}, object)
    }

    /**
     * Clone a value recursively
     * NOTE: Types which are not clonable will simply be copied to the output value without any cloning
     * @param value
     */
    static cloneDeep<T>(value: T): T {
        if (value === undefined || value === null) {
            return value
        } else {
            const cstr = (value as Object).constructor

            if (cstr === Boolean || cstr === Number || cstr === Symbol || cstr === String) {
                return value
            } else if (O.isArray(value)) {
                return value.map((sub) => O.cloneDeep(sub)) as any
            } else if (O.isCollection(value)) {
                let out: { [key: string]: unknown } = {}

                for (const [key, val] of O.entries(value)) {
                    out[key as any] = O.cloneDeep(val)
                }

                return out as any
            } else {
                return value
            }
        }
    }

    /**
     * Map an object's entries
     * @param object
     * @param mapper
     */
    static map<T extends object, K extends keyof T, V, X extends string | number | symbol, Y>(
        object: T,
        mapper: (key: K, value: T[K]) => [X, Y]
    ): { [S in X]: Y } {
        return O.fromEntries(O.entries(object).map((entry) => mapper(entry[0] as K, entry[1] as T[K]))) as { [S in X]: Y }
    }

    /**
     * Map an object's values
     * @param object
     * @param mapper
     */
    static mapValues<T extends object, K extends keyof T, V, Y>(object: T, mapper: (key: K, value: T[K]) => Y): { [S in K]: Y } {
        return O.map(object, (key, value) => [key, mapper(key as K, value as T[K])])
    }

    /**
     * Create an object's copy without specific keys
     * @param object The original object
     * @param keys The keys to remove
     */
    static without<T extends object, K extends keyof T>(object: T, keys: K[]): { [SK in Exclude<keyof T, K>]: T[SK] } {
        const copy = O.cloneSoft(object)

        for (const key of keys) {
            delete copy[key]
        }

        return copy
    }

    /**
     * Handle an object's non-existing fields
     * @param obj An object
     * @param handler The handler function
     * @example cover({ john: 26, jack: 28 }, () => null);
     */
    static cover<T extends object>(obj: T, handler: (prop: string) => unknown): T {
        return new Proxy(obj as any, {
            get(_, prop) {
                return obj.hasOwnProperty(prop) ? obj[prop as keyof T] : handler(prop.toString())
            },
        })
    }

    /**
     * Create an object with the keys and properties of two others
     * @param from The original object
     * @param add The object to add properties from
     */
    static merge<T extends object, A extends object>(from: T, add: A): T & A {
        const out: T & A = {} as any

        for (const [key, value] of O.entries(from)) {
            out[key as keyof (T & A)] = value as (T & A)[keyof (T & A)]
        }

        for (const [key, value] of O.entries(add)) {
            out[key as keyof (T & A)] = value as (T & A)[keyof (T & A)]
        }

        return out
    }

    /**
     * Create an object from a list of entries
     * Roughly equivalent to ES2019's O.fromEntries()
     * @param entries
     */
    static fromEntries<K extends string | number | symbol, V>(entries: Array<[K, V]>): { [key in K]: V } {
        const obj: { [key in K]: V } = {} as any

        for (const [key, value] of entries) {
            obj[key] = value
        }

        return forceType(obj)
    }
}
