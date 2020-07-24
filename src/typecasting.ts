/**
 * @file Typecasting utilities
 */

import { panic } from './console'

/**
 * Force the type of a data
 * NOTE: This function does not perform any kind of checking, so it's entirely unsafe
 * @template T Target type
 * @param value A value
 * @returns The provided value, typed with the provided type
 */
export function forceType<T>(value: unknown): T {
    return value as T
}

/**
 * Expect a value to be neither 'null' nor 'undefined'
 * @param value
 * @param message
 */
export function expect<T>(value: T | null | undefined, message?: string): NonNullable<T> {
    return value ?? panic(message || "Tried to use a null or undefined value as non-nullable!")
}
