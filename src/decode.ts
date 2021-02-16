/**
 * @file Parser library for decoding data
 */

import { CollLike, Dictionary, RecordDict } from "./dictionary"
import { format } from "./env"
import { List, ListLike } from "./list"
import { enumStr, Matchable, State, state, VoidStates } from "./match"
import { Collection, O } from "./objects"
import { None, Option, Some } from "./option"
import { Err, Ok, Result } from "./result"
import { stringify } from "./stringify"

/**
 * A function that handles decoding of a given type to another,
 * The decoding may fail and return an error in that case
 * @template F Original type
 * @template T Target type
 */
export type Decoder<F, T> = (value: F) => Result<T, DecodingError>

/**
 * A global decoder, which decodes 'unknown' values
 * @template T Target type
 */
export type GDecoder<T> = Decoder<unknown, T>

/**
 * Single error line in a decoding error
 */
export type DecodingErrorLine =
    // String literal
    | ["s", string]
    // String to format
    | ["f", string, unknown[]]
    // Decoding error
    | ["e", DecodingError]
    // Raw decoding error lines
    | ["l", DecodingErrorLine[]]

/**
 * Decoding error
 */
export class DecodingError extends Matchable<
    | State<"WrongType", string>
    | State<"ArrayItem", [number, DecodingError]>
    | State<"ListItem", [number, DecodingError]>
    | State<"CollectionItem", [string, DecodingError]>
    | State<"DictionaryKey", [string, DecodingError]>
    | State<"DictionaryValue", [string, DecodingError]>
    | State<"MissingTupleEntry", number>
    | State<"MissingCollectionField", string>
    | State<"FailedCombining", [number, DecodingError]>
    | State<"NoneOfEither", DecodingError[]>
    | State<"NoneOfCases", string[]>
    | State<"NoneOfEnumStates", [string, string[]]>
    | State<"CustomError", DecodingErrorLine[]>
> {
    /**
     * Get the error as not-yet-formatted lines
     */
    rawLines(): Array<DecodingErrorLine> {
        return this.match<DecodingErrorLine[]>({
            WrongType: (expected) => [["f", `Value does not have expected type "{}"`, [expected]]],

            ArrayItem: ([i, err]) => [
                ["f", `Failed to decode item n°{} from array:`, [i + 1]],
                ["e", err],
            ],

            ListItem: ([i, err]) => [
                ["f", `Failed to decode item n°{} from list:`, [i + 1]],
                ["e", err],
            ],

            CollectionItem: ([key, err]) => [
                ["f", `Failed to decode field "{}":`, [key]],
                ["e", err],
            ],

            DictionaryKey: ([key, err]) => [
                ["f", `Failed to decode dictionary key "{}":`, [key]],
                ["e", err],
            ],

            DictionaryValue: ([i, err]) => [
                ["f", `Failed to decode dictionary value associated to key "{}":`, [i]],
                ["e", err],
            ],

            MissingTupleEntry: (pos) => [["f", `Missing expected tuple entry n°{}`, [pos + 1]]],

            MissingCollectionField: (field) => [["f", `Missing expected collection field "{}"`, [field]]],

            FailedCombining: ([i, err]) => [
                ["s", `Failed to decode combined type with decoder n°${i + 1}:`],
                ["e", err],
            ],

            NoneOfEither: (errors): DecodingErrorLine[] =>
                errors[0]
                    ? [
                          ["s", `...failed to decode using either() with decoder 1:`],
                          ["e", errors[0]],
                          ...errors
                              .map<DecodingErrorLine[]>((err, i) => [
                                  ["s", `...as well as with decoder ${i + 2}:`],
                                  ["e", err],
                              ])
                              .flat(),
                      ]
                    : [["s", "...failed to decode using either() with unspecified decoders"]],

            NoneOfCases: (candidates) => [["f", `Value is not one of the candidate values: {}`, [candidates.join(", ")]]],

            NoneOfEnumStates: ([enumName, states]) => [["f", `Value is not one of enumeration "{}"'s state: {}`, [enumName, states.join(", ")]]],

            CustomError: (err): DecodingErrorLine[] => [["l", err]],
        })
    }

    /**
     * Render each line of the error individually
     */
    renderLines(): string[] {
        return DecodingError.renderLines(this.rawLines())
    }

    /**
     * Render the error as a text
     * @param message
     */
    render(): string {
        return this.renderLines().join("\n")
    }

    /**
     * Render a list of error lines
     * @param errorLines
     */
    static renderLines(errorLines: DecodingErrorLine[]): string[] {
        let rendered: string[] = []

        for (const line of errorLines) {
            switch (line[0]) {
                case "s":
                    rendered.push(line[1])
                    break

                case "f":
                    rendered.push(format(line[1], ...line[2]))
                    break

                case "e":
                    rendered = rendered.concat(DecodingError.renderLines(line[1].rawLines()).map((line) => "\t" + line))
                    break

                case "l":
                    rendered = rendered.concat(DecodingError.renderLines(line[1]).map((line) => "\t" + line))
            }
        }

        return rendered
    }
}

/**
 * Common decoders
 */
export namespace Decoders {
    /** Expect the value to be exactly 'undefined' */
    export const exactlyUndefined: Decoder<unknown, undefined> = (value) =>
        value === undefined ? Ok(undefined) : Err(new DecodingError(state("WrongType", "undefined")))

    /** Expect the value to be exactly 'nul' */
    export const exactlyNull: Decoder<unknown, null> = (value) => (value === null ? Ok(null) : Err(new DecodingError(state("WrongType", "null"))))

    /** Decode 'null' and 'undefined' */
    export const nil: Decoder<unknown, null | undefined> = (value) =>
        value === null || value === undefined ? Ok(value as null | undefined) : Err(new DecodingError(state("WrongType", "nil")))

    /** Decode booleans */
    export const bool: Decoder<unknown, boolean> = (value) =>
        value === true || value === false ? Ok(value) : Err(new DecodingError(state("WrongType", "boolean")))

    /** Decode numbers */
    export const number: Decoder<unknown, number> = (value) =>
        typeof value === "number" ? Ok(value) : Err(new DecodingError(state("WrongType", "number")))

    /** Decode strings */
    export const string: Decoder<unknown, string> = (value) =>
        typeof value === "string" ? Ok(value) : Err(new DecodingError(state("WrongType", "string")))

    /** Decode lists */
    export const list: Decoder<unknown, List<unknown>> = (value) =>
        value instanceof List ? Ok(value) : Err(new DecodingError(state("WrongType", "List")))

    /** Decode arrays */
    export const array: Decoder<unknown, Array<unknown>> = (value) =>
        O.isArray(value) ? Ok(value) : Err(new DecodingError(state("WrongType", "Array")))

    /** Decode dictionaries */
    export const dictionary: Decoder<unknown, Dictionary<unknown, unknown>> = (value) =>
        value instanceof Dictionary ? Ok(value) : Err(new DecodingError(state("WrongType", "Dictionary")))

    /** Decode records */
    export const record: Decoder<unknown, RecordDict<unknown>> = (value) =>
        value instanceof RecordDict ? Ok(value) : Err(new DecodingError(state("WrongType", "RecordDict")))

    /** Decode collections */
    export const collection: Decoder<unknown, Collection<unknown>> = (value) =>
        O.isCollection(value) ? Ok(value) : Err(new DecodingError(state("WrongType", "Collection")))

    /** Decode lists with a custom decoder for values */
    export function listOf<T>(decoder: GDecoder<T>): GDecoder<List<T>> {
        return then(instanceOf(List), (list) =>
            list.resultable((item, i) => decoder(item).mapErr((err) => new DecodingError(state("ListItem", [i, err]))))
        )
    }

    /** Decode arrays with a custom decoder for values */
    export function arrayOf<T>(decoder: GDecoder<T>): GDecoder<Array<T>> {
        return then(array, (arr) => {
            let out = []

            for (let i = 0; i < arr.length; i++) {
                const decoded = decoder(arr[i])

                if (decoded.isErr()) {
                    return Err(new DecodingError(state("ArrayItem", [i, decoded.err])))
                }

                out.push(decoded.data)
            }

            return Ok(out)
        })
    }

    /** Decode dictionaries with a custom decoder for keys and another for values */
    export function dictOf<K, V>(keyDecoder: GDecoder<K>, valueDecoder: GDecoder<V>): GDecoder<Dictionary<K, V>> {
        return then(instanceOf(Dictionary), (dict) =>
            dict.resultable((key, value) =>
                keyDecoder(key)
                    .mapErr((err) => new DecodingError(state("DictionaryKey", [stringify(key, { prettify: false }), err])))
                    .andThen((key) =>
                        valueDecoder(value)
                            .mapErr((err) => new DecodingError(state("DictionaryValue", [stringify(key, { prettify: false }), err])))
                            .map((value) => [key, value])
                    )
            )
        )
    }

    /** Decode records with a custom decoder for values */
    export function recordOf<V>(valueDecoder: GDecoder<V>): GDecoder<RecordDict<V>> {
        return then(instanceOf(RecordDict), (dict) =>
            dict
                .resultable((key, value) =>
                    string(key)
                        .mapErr((err) => new DecodingError(state("DictionaryKey", [stringify(key, { prettify: false }), err])))
                        .andThen((key) =>
                            valueDecoder(value)
                                .mapErr((err) => new DecodingError(state("DictionaryValue", [stringify(key, { prettify: false }), err])))
                                .map((value) => [key, value])
                        )
                )
                .map((dict) => RecordDict.cast(dict))
        )
    }

    /** Decode collections with a custom decoder for values */
    export function collectionOf<T>(decoder: GDecoder<T>): GDecoder<Array<T>> {
        return then(collection, (arr) => {
            let out = []

            for (const [field, value] of O.entries(arr)) {
                const decoded = decoder(value)

                if (decoded.isErr()) {
                    return Err(new DecodingError(state("CollectionItem", [field.toString(), decoded.err])))
                }

                out.push(decoded.data)
            }

            return Ok(out)
        })
    }

    /** Expect the value to be an instance of the provided constructor */
    export function instanceOf<F, T>(cstr: new (...args: any[]) => T): Decoder<F, T> {
        return (value) => (value instanceof cstr ? Ok(value) : Err(new DecodingError(state("WrongType", `constructor[${cstr.name}]`))))
    }

    /** Sub-type a value to a primitive type */
    export function typedPrimitive<P extends null | boolean | number | string>(primitive: P): Decoder<unknown, P> {
        return (value) =>
            value === primitive
                ? Ok(value as P)
                : Err(new DecodingError(state("WrongType", `primitive[${stringify(primitive, { prettify: false })}]`)))
    }

    /** Sub-type a value to a more precise type using a type predicate function */
    export function withType<F, T extends F>(typename: string, predicate: (value: F) => value is T): Decoder<F, T> {
        return (value) => (predicate(value) ? Ok(value) : Err(new DecodingError(state("WrongType", typename))))
    }

    /** Map a decoded value */
    export function map<F, T, U>(decoder: Decoder<F, T>, mapper: (value: T) => U): Decoder<F, U> {
        return (value) => decoder(value).map(mapper)
    }

    /** Map a decoded value using another decoder */
    export function then<F, T, U>(decoder: Decoder<F, T>, mapper: Decoder<T, U>): Decoder<F, U> {
        return (value) => decoder(value).andThen(mapper)
    }

    /** Decode an optional value to an Option<T> */
    export function maybe<F, T>(decoder: Decoder<F, T>): Decoder<F | null | undefined, Option<T>> {
        return (value) =>
            Option.maybe(value).match({
                Some: (value) => decoder(value).map((value) => Some(value)),
                None: () => Ok(None()),
            })
    }

    /** Decode a nullable value */
    export function nullable<F, T>(decoder: Decoder<F, T>): Decoder<F, T | null> {
        return (value) => (value === null ? Ok(null) : decoder(value))
    }

    /** Decode an optional value */
    export function undefinable<F, T>(decoder: Decoder<F, T>): Decoder<F, T | undefined> {
        return (value) => (value === null || value === undefined ? Ok(undefined) : decoder(value))
    }

    /** Expect a value to be one of the provided values */
    export function oneOf<F, T extends F>(candidates: T[]): Decoder<F, T> {
        return (value) => {
            if (candidates.includes(value as any)) {
                return Ok(value as T)
            } else {
                return Err(
                    new DecodingError(
                        state(
                            "NoneOfCases",
                            candidates.map((c) => stringify(c, { prettify: false }))
                        )
                    )
                )
            }
        }
    }

    /** Map a list of possible values to another value */
    export function cases<K extends string | number | symbol, T>(cases: { [key in K]: T }): GDecoder<T> {
        return then(string, (value) => {
            for (const [match, mapped] of O.entries(cases)) {
                if (value === match) {
                    return Ok(mapped)
                }
            }

            return Err(
                new DecodingError(
                    state(
                        "NoneOfCases",
                        O.keys(cases).map((entry) => entry.toString())
                    )
                )
            )
        })
    }

    /** Decode a string as an enumeration's state */
    export function enumState<S extends object, T extends Matchable<S>>(cstr: new (state: S) => T, cases: Array<VoidStates<S>>): Decoder<string, T> {
        return (value) =>
            cases.includes(value as any)
                ? Ok(new cstr(enumStr(value) as any))
                : Err(new DecodingError(state("NoneOfEnumStates", [cstr.name, cases.map((c) => stringify(c, { prettify: false }))])))
    }

    /** Ensure a value is of a given type using fallback decoders */
    export function ensure<F, T>(...decoders: Array<Decoder<F, T>>): Decoder<F, T> {
        return untypedEither(...decoders) as Decoder<F, T>
    }

    /** Try to decode a value using multiple decoders to an unknown data type */
    export function untypedEither<F>(...decoders: Array<Decoder<F, unknown>>): Decoder<F, unknown> {
        return (value) => {
            const errors = []

            for (const decoder of decoders) {
                const decoded = decoder(value)

                if (decoded.isOk()) return Ok(decoded.data)

                errors.push(decoded.err)
            }

            return Err(new DecodingError(state("NoneOfEither", errors)))
        }
    }

    /** Decode a value with multiple decoders and merge the final type */
    export function untypedCombine<F, T>(decoders: Array<Decoder<F, unknown>>, merger: (...values: unknown[]) => T): Decoder<F, T> {
        return (value) => {
            const values: unknown[] = []

            for (const [i, decoder] of decoders.entries()) {
                const decoded = decoder(value)

                if (decoded.isErr()) return Err(new DecodingError(state("FailedCombining", [i, decoded.err])))

                values.push(decoded.data)
            }

            return Ok(merger(...values))
        }
    }

    /** Decode arrays/lists to moderately-typed tuples as arrays with a common decoder for each member of the tuple */
    export function untypedTuple<F>(decoders: Array<Decoder<F, unknown>>): Decoder<ListLike<F>, unknown[]> {
        return (encoded) => {
            const arr = List.toArray(encoded)

            let out: unknown[] = []
            let i = 0

            if (arr.length < decoders.length) {
                return Err(new DecodingError(state("MissingTupleEntry", decoders.length)))
            }

            for (const decoder of decoders) {
                let decoded = decoder(Option.expect(arr[i++]))

                if (decoded.isErr()) {
                    return Err(new DecodingError(state("ArrayItem", [i - 1, decoded.err])))
                }

                out.push(decoded.data)
            }

            return Ok(out)
        }
    }

    /** Decode a collection to a moderately-typed collection with a common decoder for each member of the mapping */
    export function untypedMapped<F>(mappings: Collection<Decoder<F, any>>): Decoder<CollLike<F>, Collection<unknown>> {
        return (encoded) => {
            const coll = new RecordDict(encoded)

            let out: Collection<unknown> = {}

            for (const [field, decoder] of O.entries(mappings)) {
                const collField = coll.get(field)

                if (collField.isNone()) {
                    return Err(new DecodingError(state("MissingCollectionField", field)))
                }

                let decoded = decoder(collField.data)

                if (decoded.isErr()) {
                    return Err(new DecodingError(state("CollectionItem", [field, decoded.err])))
                }

                out[field] = decoded.data
            }

            return Ok(out)
        }
    }

    /** Decode a collection to a strongly-typed collection with a decoder for each member of the mapping */
    export function mapped<F, O extends object>(decoders: { [key in keyof O]: Decoder<unknown, O[key]> }): Decoder<CollLike<F>, O> {
        return untypedMapped<F>(decoders) as any
    }

    /* prettier-ignore */ export function either<_F, A>(a: Decoder<_F, A>): Decoder<_F, A>;
    /* prettier-ignore */ export function either<_F, A, B>(a: Decoder<_F, A>, b: Decoder<_F, B>): Decoder<_F, A | B>;
    /* prettier-ignore */ export function either<_F, A, B, C>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>): Decoder<_F, A | B | C>;
    /* prettier-ignore */ export function either<_F, A, B, C, D>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>): Decoder<_F, A | B | C | D>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>): Decoder<_F, A | B | C | D | E>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>): Decoder<_F, A | B | C | D | E | F>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F, G>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>): Decoder<_F, A | B | C | D | E | F | G>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F, G, H>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>): Decoder<_F, A | B | C | D | E | F | G | H>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F, G, H, I>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>): Decoder<_F, A | B | C | D | E | F | G | H | I>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F, G, H, I, J>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>): Decoder<_F, A | B | C | D | E | F | G | H | I | J>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F, G, H, I, J, K>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>): Decoder<_F, A | B | C | D | E | F | G | H | I | J | K>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F, G, H, I, J, K, L>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>): Decoder<_F, A | B | C | D | E | F | G | H | I | J | K | L>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F, G, H, I, J, K, L, M>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>): Decoder<_F, A | B | C | D | E | F | G | H | I | J | K | L | M>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>): Decoder<_F, A | B | C | D | E | F | G | H | I | J | K | L | M | N>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>): Decoder<_F, A | B | C | D | E | F | G | H | I | J | K | L | M | N | O>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>): Decoder<_F, A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>): Decoder<_F, A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>): Decoder<_F, A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q | R>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>): Decoder<_F, A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q | R | S>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, t: Decoder<_F, T>): Decoder<_F, A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q | R | S | T>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, t: Decoder<_F, T>, u: Decoder<_F, U>): Decoder<_F, A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q | R | S | T | U>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, t: Decoder<_F, T>, u: Decoder<_F, U>, v: Decoder<_F, V>): Decoder<_F, A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q | R | S | T | U | V>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, t: Decoder<_F, T>, u: Decoder<_F, U>, v: Decoder<_F, V>, w: Decoder<_F, W>): Decoder<_F, A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q | R | S | T | U | V | W>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, t: Decoder<_F, T>, u: Decoder<_F, U>, v: Decoder<_F, V>, w: Decoder<_F, W>, x: Decoder<_F, X>): Decoder<_F, A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q | R | S | T | U | V | W | X>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, t: Decoder<_F, T>, u: Decoder<_F, U>, v: Decoder<_F, V>, w: Decoder<_F, W>, x: Decoder<_F, X>, y: Decoder<_F, Y>): Decoder<_F, A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q | R | S | T | U | V | W | X | Y>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, t: Decoder<_F, T>, u: Decoder<_F, U>, v: Decoder<_F, V>, w: Decoder<_F, W>, x: Decoder<_F, X>, y: Decoder<_F, Y>, z: Decoder<_F, Z>): Decoder<_F, A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q | R | S | T | U | V | W | X | Y | Z>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z, AA>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, t: Decoder<_F, T>, u: Decoder<_F, U>, v: Decoder<_F, V>, w: Decoder<_F, W>, x: Decoder<_F, X>, y: Decoder<_F, Y>, z: Decoder<_F, Z>, aa: Decoder<_F, AA>): Decoder<_F, A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q | R | S | T | U | V | W | X | Y | Z | AA>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z, AA, AB>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, t: Decoder<_F, T>, u: Decoder<_F, U>, v: Decoder<_F, V>, w: Decoder<_F, W>, x: Decoder<_F, X>, y: Decoder<_F, Y>, z: Decoder<_F, Z>, aa: Decoder<_F, AA>, ab: Decoder<_F, AB>): Decoder<_F, A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q | R | S | T | U | V | W | X | Y | Z | AA | AB>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z, AA, AB, AC>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, t: Decoder<_F, T>, u: Decoder<_F, U>, v: Decoder<_F, V>, w: Decoder<_F, W>, x: Decoder<_F, X>, y: Decoder<_F, Y>, z: Decoder<_F, Z>, aa: Decoder<_F, AA>, ab: Decoder<_F, AB>, ac: Decoder<_F, AC>): Decoder<_F, A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q | R | S | T | U | V | W | X | Y | Z | AA | AB | AC>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z, AA, AB, AC, AD>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, t: Decoder<_F, T>, u: Decoder<_F, U>, v: Decoder<_F, V>, w: Decoder<_F, W>, x: Decoder<_F, X>, y: Decoder<_F, Y>, z: Decoder<_F, Z>, aa: Decoder<_F, AA>, ab: Decoder<_F, AB>, ac: Decoder<_F, AC>, ad: Decoder<_F, AD>): Decoder<_F, A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q | R | S | T | U | V | W | X | Y | Z | AA | AB | AC | AD>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z, AA, AB, AC, AD, AE>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, t: Decoder<_F, T>, u: Decoder<_F, U>, v: Decoder<_F, V>, w: Decoder<_F, W>, x: Decoder<_F, X>, y: Decoder<_F, Y>, z: Decoder<_F, Z>, aa: Decoder<_F, AA>, ab: Decoder<_F, AB>, ac: Decoder<_F, AC>, ad: Decoder<_F, AD>, ae: Decoder<_F, AE>): Decoder<_F, A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q | R | S | T | U | V | W | X | Y | Z | AA | AB | AC | AD | AE>;
    /* prettier-ignore */ export function either<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z, AA, AB, AC, AD, AE, AF>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, t: Decoder<_F, T>, u: Decoder<_F, U>, v: Decoder<_F, V>, w: Decoder<_F, W>, x: Decoder<_F, X>, y: Decoder<_F, Y>, z: Decoder<_F, Z>, aa: Decoder<_F, AA>, ab: Decoder<_F, AB>, ac: Decoder<_F, AC>, ad: Decoder<_F, AD>, ae: Decoder<_F, AE>, af: Decoder<_F, AF>): Decoder<_F, A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q | R | S | T | U | V | W | X | Y | Z | AA | AB | AC | AD | AE | AF>;
    /* prettier-ignore */ export function either<_F>(...decoders: Array<Decoder<_F, unknown>>): Decoder<_F, any> {
        return untypedEither(...decoders)
    }

    /* prettier-ignore */ export function combine<_F, A>(a: Decoder<_F, A>, merger: (a: A) => A): Decoder<_F, A>;
    /* prettier-ignore */ export function combine<_F, A, B>(a: Decoder<_F, A>, b: Decoder<_F, B>, merger: (a: A, b: B) => A & B): Decoder<_F, A & B>;
    /* prettier-ignore */ export function combine<_F, A, B, C>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, merger: (a: A, b: B, c: C) => A & B & C): Decoder<_F, A & B & C>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, merger: (a: A, b: B, c: C, d: D) => A & B & C & D): Decoder<_F, A & B & C & D>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, merger: (a: A, b: B, c: C, d: D, e: E) => A & B & C & D & E): Decoder<_F, A & B & C & D & E>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, merger: (a: A, b: B, c: C, d: D, e: E, f: F) => A & B & C & D & E & F): Decoder<_F, A & B & C & D & E & F>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F, G>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, merger: (a: A, b: B, c: C, d: D, e: E, f: F, g: G) => A & B & C & D & E & F & G): Decoder<_F, A & B & C & D & E & F & G>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F, G, H>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, merger: (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H) => A & B & C & D & E & F & G & H): Decoder<_F, A & B & C & D & E & F & G & H>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F, G, H, I>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, merger: (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I) => A & B & C & D & E & F & G & H & I): Decoder<_F, A & B & C & D & E & F & G & H & I>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F, G, H, I, J>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, merger: (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J) => A & B & C & D & E & F & G & H & I & J): Decoder<_F, A & B & C & D & E & F & G & H & I & J>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F, G, H, I, J, K>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, merger: (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J, k: K) => A & B & C & D & E & F & G & H & I & J & K): Decoder<_F, A & B & C & D & E & F & G & H & I & J & K>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F, G, H, I, J, K, L>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, merger: (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J, k: K, l: L) => A & B & C & D & E & F & G & H & I & J & K & L): Decoder<_F, A & B & C & D & E & F & G & H & I & J & K & L>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F, G, H, I, J, K, L, M>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, merger: (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J, k: K, l: L, m: M) => A & B & C & D & E & F & G & H & I & J & K & L & M): Decoder<_F, A & B & C & D & E & F & G & H & I & J & K & L & M>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, merger: (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J, k: K, l: L, m: M, n: N) => A & B & C & D & E & F & G & H & I & J & K & L & M & N): Decoder<_F, A & B & C & D & E & F & G & H & I & J & K & L & M & N>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, merger: (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J, k: K, l: L, m: M, n: N, o: O) => A & B & C & D & E & F & G & H & I & J & K & L & M & N & O): Decoder<_F, A & B & C & D & E & F & G & H & I & J & K & L & M & N & O>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, merger: (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J, k: K, l: L, m: M, n: N, o: O, p: P) => A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P): Decoder<_F, A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, merger: (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J, k: K, l: L, m: M, n: N, o: O, p: P, q: Q) => A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q): Decoder<_F, A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, merger: (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J, k: K, l: L, m: M, n: N, o: O, p: P, q: Q, r: R) => A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R): Decoder<_F, A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, merger: (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J, k: K, l: L, m: M, n: N, o: O, p: P, q: Q, r: R, s: S) => A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S): Decoder<_F, A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, t: Decoder<_F, T>, merger: (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J, k: K, l: L, m: M, n: N, o: O, p: P, q: Q, r: R, s: S, t: T) => A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S & T): Decoder<_F, A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S & T>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, t: Decoder<_F, T>, u: Decoder<_F, U>, merger: (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J, k: K, l: L, m: M, n: N, o: O, p: P, q: Q, r: R, s: S, t: T, u: U) => A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S & T & U): Decoder<_F, A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S & T & U>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, t: Decoder<_F, T>, u: Decoder<_F, U>, v: Decoder<_F, V>, merger: (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J, k: K, l: L, m: M, n: N, o: O, p: P, q: Q, r: R, s: S, t: T, u: U, v: V) => A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S & T & U & V): Decoder<_F, A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S & T & U & V>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, t: Decoder<_F, T>, u: Decoder<_F, U>, v: Decoder<_F, V>, w: Decoder<_F, W>, merger: (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J, k: K, l: L, m: M, n: N, o: O, p: P, q: Q, r: R, s: S, t: T, u: U, v: V, w: W) => A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S & T & U & V & W): Decoder<_F, A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S & T & U & V & W>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, t: Decoder<_F, T>, u: Decoder<_F, U>, v: Decoder<_F, V>, w: Decoder<_F, W>, x: Decoder<_F, X>, merger: (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J, k: K, l: L, m: M, n: N, o: O, p: P, q: Q, r: R, s: S, t: T, u: U, v: V, w: W, x: X) => A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S & T & U & V & W & X): Decoder<_F, A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S & T & U & V & W & X>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, t: Decoder<_F, T>, u: Decoder<_F, U>, v: Decoder<_F, V>, w: Decoder<_F, W>, x: Decoder<_F, X>, y: Decoder<_F, Y>, merger: (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J, k: K, l: L, m: M, n: N, o: O, p: P, q: Q, r: R, s: S, t: T, u: U, v: V, w: W, x: X, y: Y) => A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S & T & U & V & W & X & Y): Decoder<_F, A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S & T & U & V & W & X & Y>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, t: Decoder<_F, T>, u: Decoder<_F, U>, v: Decoder<_F, V>, w: Decoder<_F, W>, x: Decoder<_F, X>, y: Decoder<_F, Y>, z: Decoder<_F, Z>, merger: (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J, k: K, l: L, m: M, n: N, o: O, p: P, q: Q, r: R, s: S, t: T, u: U, v: V, w: W, x: X, y: Y, z: Z) => A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S & T & U & V & W & X & Y & Z): Decoder<_F, A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S & T & U & V & W & X & Y & Z>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z, AA>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, t: Decoder<_F, T>, u: Decoder<_F, U>, v: Decoder<_F, V>, w: Decoder<_F, W>, x: Decoder<_F, X>, y: Decoder<_F, Y>, z: Decoder<_F, Z>, aa: Decoder<_F, AA>, merger: (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J, k: K, l: L, m: M, n: N, o: O, p: P, q: Q, r: R, s: S, t: T, u: U, v: V, w: W, x: X, y: Y, z: Z, aa: AA) => A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S & T & U & V & W & X & Y & Z & AA): Decoder<_F, A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S & T & U & V & W & X & Y & Z & AA>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z, AA, AB>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, t: Decoder<_F, T>, u: Decoder<_F, U>, v: Decoder<_F, V>, w: Decoder<_F, W>, x: Decoder<_F, X>, y: Decoder<_F, Y>, z: Decoder<_F, Z>, aa: Decoder<_F, AA>, ab: Decoder<_F, AB>, merger: (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J, k: K, l: L, m: M, n: N, o: O, p: P, q: Q, r: R, s: S, t: T, u: U, v: V, w: W, x: X, y: Y, z: Z, aa: AA, ab: AB) => A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S & T & U & V & W & X & Y & Z & AA & AB): Decoder<_F, A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S & T & U & V & W & X & Y & Z & AA & AB>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z, AA, AB, AC>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, t: Decoder<_F, T>, u: Decoder<_F, U>, v: Decoder<_F, V>, w: Decoder<_F, W>, x: Decoder<_F, X>, y: Decoder<_F, Y>, z: Decoder<_F, Z>, aa: Decoder<_F, AA>, ab: Decoder<_F, AB>, ac: Decoder<_F, AC>, merger: (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J, k: K, l: L, m: M, n: N, o: O, p: P, q: Q, r: R, s: S, t: T, u: U, v: V, w: W, x: X, y: Y, z: Z, aa: AA, ab: AB, ac: AC) => A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S & T & U & V & W & X & Y & Z & AA & AB & AC): Decoder<_F, A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S & T & U & V & W & X & Y & Z & AA & AB & AC>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z, AA, AB, AC, AD>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, t: Decoder<_F, T>, u: Decoder<_F, U>, v: Decoder<_F, V>, w: Decoder<_F, W>, x: Decoder<_F, X>, y: Decoder<_F, Y>, z: Decoder<_F, Z>, aa: Decoder<_F, AA>, ab: Decoder<_F, AB>, ac: Decoder<_F, AC>, ad: Decoder<_F, AD>, merger: (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J, k: K, l: L, m: M, n: N, o: O, p: P, q: Q, r: R, s: S, t: T, u: U, v: V, w: W, x: X, y: Y, z: Z, aa: AA, ab: AB, ac: AC, ad: AD) => A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S & T & U & V & W & X & Y & Z & AA & AB & AC & AD): Decoder<_F, A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S & T & U & V & W & X & Y & Z & AA & AB & AC & AD>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z, AA, AB, AC, AD, AE>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, t: Decoder<_F, T>, u: Decoder<_F, U>, v: Decoder<_F, V>, w: Decoder<_F, W>, x: Decoder<_F, X>, y: Decoder<_F, Y>, z: Decoder<_F, Z>, aa: Decoder<_F, AA>, ab: Decoder<_F, AB>, ac: Decoder<_F, AC>, ad: Decoder<_F, AD>, ae: Decoder<_F, AE>, merger: (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J, k: K, l: L, m: M, n: N, o: O, p: P, q: Q, r: R, s: S, t: T, u: U, v: V, w: W, x: X, y: Y, z: Z, aa: AA, ab: AB, ac: AC, ad: AD, ae: AE) => A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S & T & U & V & W & X & Y & Z & AA & AB & AC & AD & AE): Decoder<_F, A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S & T & U & V & W & X & Y & Z & AA & AB & AC & AD & AE>;
    /* prettier-ignore */ export function combine<_F, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z, AA, AB, AC, AD, AE, AF>(a: Decoder<_F, A>, b: Decoder<_F, B>, c: Decoder<_F, C>, d: Decoder<_F, D>, e: Decoder<_F, E>, f: Decoder<_F, F>, g: Decoder<_F, G>, h: Decoder<_F, H>, i: Decoder<_F, I>, j: Decoder<_F, J>, k: Decoder<_F, K>, l: Decoder<_F, L>, m: Decoder<_F, M>, n: Decoder<_F, N>, o: Decoder<_F, O>, p: Decoder<_F, P>, q: Decoder<_F, Q>, r: Decoder<_F, R>, s: Decoder<_F, S>, t: Decoder<_F, T>, u: Decoder<_F, U>, v: Decoder<_F, V>, w: Decoder<_F, W>, x: Decoder<_F, X>, y: Decoder<_F, Y>, z: Decoder<_F, Z>, aa: Decoder<_F, AA>, ab: Decoder<_F, AB>, ac: Decoder<_F, AC>, ad: Decoder<_F, AD>, ae: Decoder<_F, AE>, af: Decoder<_F, AF>, merger: (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J, k: K, l: L, m: M, n: N, o: O, p: P, q: Q, r: R, s: S, t: T, u: U, v: V, w: W, x: X, y: Y, z: Z, aa: AA, ab: AB, ac: AC, ad: AD, ae: AE, af: AF) => A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S & T & U & V & W & X & Y & Z & AA & AB & AC & AD & AE & AF): Decoder<_F, A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R & S & T & U & V & W & X & Y & Z & AA & AB & AC & AD & AE & AF>;
    /* prettier-ignore */ export function combine(...decodersAndMerger: any[]): any {
        const merger = decodersAndMerger.pop()
        return untypedCombine(decodersAndMerger, merger)
    }

    /* prettier-ignore */ export function tuple<_F,A>(d:[Decoder<_F,A>]):Decoder<_F[]|List<_F>,[A]>;
    /* prettier-ignore */ export function tuple<_F,A,B>(d:[Decoder<_F,A>,Decoder<_F,B>]):Decoder<_F[]|List<_F>,[A,B]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>]):Decoder<_F[]|List<_F>,[A,B,C]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>]):Decoder<_F[]|List<_F>,[A,B,C,D]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>]):Decoder<_F[]|List<_F>,[A,B,C,D,E]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F,G>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F,G,H>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F,G,H,I>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F,G,H,I,J>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F,G,H,I,J,K>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F,G,H,I,J,K,L>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F,G,H,I,J,K,L,M>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>,Decoder<_F,T>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>,Decoder<_F,T>,Decoder<_F,U>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>,Decoder<_F,T>,Decoder<_F,U>,Decoder<_F,V>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>,Decoder<_F,T>,Decoder<_F,U>,Decoder<_F,V>,Decoder<_F,W>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>,Decoder<_F,T>,Decoder<_F,U>,Decoder<_F,V>,Decoder<_F,W>,Decoder<_F,X>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>,Decoder<_F,T>,Decoder<_F,U>,Decoder<_F,V>,Decoder<_F,W>,Decoder<_F,X>,Decoder<_F,Y>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>,Decoder<_F,T>,Decoder<_F,U>,Decoder<_F,V>,Decoder<_F,W>,Decoder<_F,X>,Decoder<_F,Y>,Decoder<_F,Z>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>,Decoder<_F,T>,Decoder<_F,U>,Decoder<_F,V>,Decoder<_F,W>,Decoder<_F,X>,Decoder<_F,Y>,Decoder<_F,Z>,Decoder<_F,AA>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>,Decoder<_F,T>,Decoder<_F,U>,Decoder<_F,V>,Decoder<_F,W>,Decoder<_F,X>,Decoder<_F,Y>,Decoder<_F,Z>,Decoder<_F,AA>,Decoder<_F,AB>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>,Decoder<_F,T>,Decoder<_F,U>,Decoder<_F,V>,Decoder<_F,W>,Decoder<_F,X>,Decoder<_F,Y>,Decoder<_F,Z>,Decoder<_F,AA>,Decoder<_F,AB>,Decoder<_F,AC>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC,AD>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>,Decoder<_F,T>,Decoder<_F,U>,Decoder<_F,V>,Decoder<_F,W>,Decoder<_F,X>,Decoder<_F,Y>,Decoder<_F,Z>,Decoder<_F,AA>,Decoder<_F,AB>,Decoder<_F,AC>,Decoder<_F,AD>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC,AD]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC,AD,AE>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>,Decoder<_F,T>,Decoder<_F,U>,Decoder<_F,V>,Decoder<_F,W>,Decoder<_F,X>,Decoder<_F,Y>,Decoder<_F,Z>,Decoder<_F,AA>,Decoder<_F,AB>,Decoder<_F,AC>,Decoder<_F,AD>,Decoder<_F,AE>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC,AD,AE]>;
    /* prettier-ignore */ export function tuple<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC,AD,AE,AF>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>,Decoder<_F,T>,Decoder<_F,U>,Decoder<_F,V>,Decoder<_F,W>,Decoder<_F,X>,Decoder<_F,Y>,Decoder<_F,Z>,Decoder<_F,AA>,Decoder<_F,AB>,Decoder<_F,AC>,Decoder<_F,AD>,Decoder<_F,AE>,Decoder<_F,AF>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC,AD,AE,AF]>;
    /* prettier-ignore */ export function tuple(d: Array<Decoder<any, any>>): any {
        return untypedTuple(d);
    }
}
