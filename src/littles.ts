/**
 * @file Some little utilities
 */

import { Err, Ok, Result } from './result'

/**
 * Parse a string as an integer
 * @param str The string to parse
 * @returns The parsed integer
 */
export function tryParseInt(str: string, base: number = 10, strictCheck = true): Result<number, void> {
    const parsed = parseInt(str, base)
    return Number.isNaN(parsed) ? Err(void 0) : strictCheck || parsed.toString() === str ? Ok(parsed) : Err(void 0)
}

/**
 * Parse a string as floating-point number
 * @param str The string to parse
 * @returns The parsed floating-point number
 */
export function tryParseFloat(str: string, strictCheck = true): Result<number, void> {
    const parsed = strictCheck ? Number(str) : parseFloat(str)
    return Number.isNaN(parsed) ? Err(void 0) : Ok(parsed)
}

/**
 * Add indentation to a string
 * @param str The string to indent
 * @param indent The number of characters to indent the string with
 * @param indentChar The character to indent the string with
 * @returns The indented string
 */
export function addStrIndent(str: string, indent: number, indentChar = " "): string {
    return str.replace(/^.*$/gm, (match) => indentChar.repeat(indent) + match)
}
