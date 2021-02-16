/**
 * @file Utility functions for objects
 */

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
        return typeof value === "object" && value !== null && "constructor" in value && value.constructor === {}.constructor
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
    static keys<T extends object>(object: T): Array<Exclude<keyof T, number>> {
        return Reflect.ownKeys(object) as Array<Exclude<keyof T, number>>
    }

    /**
     * Get the keys of an object, as strings
     * @param object
     */
    static strKeys<T extends object>(object: T): Exclude<keyof T, string | number> extends never ? Array<Exclude<keyof T, number>> : Array<string> {
        return O.keys(object).map((key) => key.toString()) as any
    }

    /**
     * Get the keys of a collection with stricter typing
     * This is better than using O.keys() as this function will always return an array of strings
     * @param collection
     */
    static collKeys<T extends object>(collection: Collection<T>): string[] {
        return Object.keys(collection)
    }

    /**
     * Get the values of an object
     * @param object
     */
    static values<T extends object>(object: T): Array<T[Exclude<keyof T, number>]> {
        return Object.values(object)
    }

    /**
     * Get entries of an object
     * @param object
     */
    static entries<T extends object>(object: T): Array<[Exclude<keyof T, number>, T[Exclude<keyof T, number>]]> {
        return Object.entries(object) as any
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
    static map<T extends object, X extends string | number | symbol, Y>(
        object: T,
        mapper: (key: keyof T, value: T[keyof T]) => [X, Y]
    ): { [S in X]: Y } {
        return O.fromEntries(O.entries(object).map(([key, value]) => mapper(key, value)))
    }

    /**
     * Map an object's values
     * @param object
     * @param mapper
     */
    static mapValues<T extends object, Y>(object: T, mapper: (key: keyof T, value: T[keyof T]) => Y): { [S in keyof T]: Y } {
        return O.map(object, (key, value) => [key, mapper(key, value)])
    }

    /**
     * Create an object's copy without specific keys
     * @param object The original object
     * @param keys The keys to remove
     */
    static without<T extends object, K extends Exclude<keyof T, number>>(
        object: T,
        keys: K[]
    ): { [SK in Exclude<Exclude<keyof T, number>, K>]: T[SK] } {
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
                return obj.hasOwnProperty(prop) ? obj[prop as Exclude<keyof T, number>] : handler(prop.toString())
            },
        })
    }

    /**
     * Create an object with the keys and properties of two others
     * @param from The original object
     * @param add The object to add properties from
     */
    static merge<Base extends object, Merge extends object>(from: Base, add: Merge): Base & Merge {
        const out: Base & Merge = {} as any

        for (const [key, value] of O.entries(from)) {
            out[key as keyof (Base & Merge)] = value as any
        }

        for (const [key, value] of O.entries(add)) {
            out[key as keyof (Base & Merge)] = value as any
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

        return obj
    }
}
