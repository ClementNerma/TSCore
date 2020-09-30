/**
 * @file Comparison utilities
 */



/**
 * Comparator's comparison result
 */
export enum CompResult {
    Smaller = -1,
    Equal = 0,
    Greater = 1,
}

/**
 * Comparator
 * @template T Type of values to compare
 */
export type Comparator<T> = (a: T, b: T) => CompResult

/**
 * Compare two values
 * @param a Left value
 * @param b Right value
 */
export function compare<T>(a: T, b: T): CompResult {
    if (a < b) {
        return CompResult.Smaller
    } else if (a === b) {
        return CompResult.Equal
    } else {
        return CompResult.Greater
    }
}

/**
 * Create a comparator using an object's key
 * @param keys
 * @example comparator<{ name: string, age: number }>('name')
 */
export function comparator<T extends object>(...keys: Array<keyof T>): Comparator<T> {
    return (a, b) => {
        for (const key of keys) {
            const result = compare(a[key], b[key])

            if (result !== 0) {
                return result
            }
        }

        return 0
    }
}

/**
 * Sort an array of objects by key
 * @param arr An array of objects
 * @param keys The key to sort the objects by
 * @example sortByKey([ { points: 10, points: 30, points: 15 } ], 'points')
 */
export function sortByKey<T extends object>(arr: Array<T>, ...keys: Array<keyof T>): Array<T> {
    return arr.sort(comparator(...keys))
}
