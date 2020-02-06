import { Result, Err, Ok } from "./result";

export function tryParseInt(str: string, base: number = 10): Result<number, void> {
    const parsed = parseInt(str, base);
    return Number.isNaN(parsed) ? Err(undefined) : Ok(parsed);
}

export function tryParseFloat(str: string): Result<number, void> {
    const parsed = parseFloat(str);
    return Number.isNaN(parsed) ? Err(undefined) : Ok(parsed);
}
