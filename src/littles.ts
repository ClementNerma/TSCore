/**
 * @file Some little utilities
 */

import { Err, Ok, Result } from './result'

/**
 * Parse a string as an integer
 * @param str The string to parse
 * @returns The parsed integer
 */
export function tryParseInt(str: string, base: number = 10): Result<number, void> {
    const parsed = parseInt(str, base)
    return Number.isNaN(parsed) ? Err(undefined) : Ok(parsed)
}

/**
 * Parse a string as floating-point number
 * @param str The string to parse
 * @returns The parsed floating-point number
 */
export function tryParseFloat(str: string): Result<number, void> {
    const parsed = parseFloat(str)
    return Number.isNaN(parsed) ? Err(undefined) : Ok(parsed)
}
