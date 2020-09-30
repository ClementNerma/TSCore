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
 * Map lines of a string
 * @param str The string to indent
 * @param mapper A function to map the lines
 * @returns The mapped string
 * @example mapStrLines('a\nb', line => '> ' + line) === '> a\n> b'
 */
export function mapStrLines(str: string, mapper: (line: string, lineIndex: number) => string): string {
    let i = 0
    return str.replace(/^.*$/gm, (match) => mapper(match, i++))
}
