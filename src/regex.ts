import { O } from './objects'
import { Option } from './option'
import { Result } from './result'
import { forceType } from './typecasting'

/**
 * Regular expression
 */
export class Regex<N extends string> {
    readonly inner: RegExp

    /**
     * Create a regular expression
     * If a string regex is provided and is not a valid regular expression, an error will be thrown
     */
    constructor(regexp: string | RegExp, readonly names: N[] = []) {
        this.inner = regexp instanceof RegExp ? regexp : new RegExp(regexp)
    }

    /**
     * Match a string using this regular expression
     * @param subject
     * @returns Matched parameters
     */
    match(subject: string): Option<string[]> {
        return Option.maybe(subject.match(this.inner)).map(([_, ...parts]) => parts)
    }

    /**
     * Match a string using this regular expression
     * @param subject
     * @returns Matched string as well as matched parameters including the subject
     */
    matchWithSubject(subject: string): Option<[string, string[]]> {
        return Option.maybe(subject.match(this.inner)).map(([match, ...parts]) => [match, parts])
    }

    /**
     * Match a string using this regular expression and name captured strings
     * @param subject
     * @returns Matched string as well as matched parameters in a strongly-typed object
     */
    matchNamed(subject: string): Option<{ [name in N]: string } & { _subject: string }> {
        return this.matchWithSubject(subject).map(([matched, parts]) => {
            return forceType<{ [name in N]: string } & { _subject: string }>(
                O.fromEntries([["_subject", matched], ...this.names.map<[string, string]>((name, pos) => [name, parts[pos] ?? ""])])
            )
        })
    }

    /**
     * Parse a regular expression
     * @returns A typed regular expression, or an error if the provided expression is not valid
     */
    static parse<N extends string>(expr: string, names?: N[]): Result<Regex<N>, Error> {
        return Result.fallible(() => new RegExp(expr)).map((regexp) => new Regex(regexp, names))
    }
}
