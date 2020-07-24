/**
 * @file Parser library for decoding data
 */

import { MsgParam, formatCustom } from './console'
import { Dictionary, RecordDict } from './dictionary'
import { List } from './list'
import { Matchable, State, VoidStates, enumStr, state } from './match'
import { Collection, O } from './objects'
import { Option } from './option'
import { Err, Ok, Result } from './result'

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
    | ["f", string, MsgParam[]]
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
    | State<"NoneOfEither", DecodingError[]>
    | State<"NoneOfCases", string[]>
    | State<"NoneOfEnumStates", [string, string[]]>
    | State<"CustomError", DecodingErrorLine[]>
> {
    /**
     * Get the error as not-yet-formatted lines
     */
    rawLines(): Array<DecodingErrorLine> {
        return this.match({
            WrongType: (expected) => [["f", `Value does not have expected type "{}"`, [expected]]],

            ArrayItem: (err) => [
                ["f", `Failed to decode item n°{} from array:`, [err[0] + 1]],
                ["e", err[1]],
            ],

            ListItem: (err) => [
                ["f", `Failed to decode item n°{} from list:`, [err[0] + 1]],
                ["e", err[1]],
            ],

            CollectionItem: (err) => [
                ["f", `Failed to decode field "{}":`, [err[0]]],
                ["e", err[1]],
            ],

            DictionaryKey: (err) => [
                ["f", `Failed to decode dictionary key "{}":`, [err[0]]],
                ["e", err[1]],
            ],

            DictionaryValue: (err) => [
                ["f", `Failed to decode dictionary value associated to key "{}":`, [err[0]]],
                ["e", err[1]],
            ],

            MissingTupleEntry: (pos) => [["f", `Missing expected tuple entry n°{}`, [pos + 1]]],

            MissingCollectionField: (field) => [["f", `Missing expected collection field "{}"`, [field]]],

            NoneOfEither: (errors) => [
                ["s", `...failed to decode using either() with decoder 1:`],
                ["e", errors[0]],
                ...errors
                    .map<DecodingErrorLine[]>((err, i) => [
                        ["s", `...as well as with decoder ${i + 2}:`],
                        ["e", err],
                    ])
                    .flat(),
            ],

            NoneOfCases: (candidates) => [["f", `Value is not one of the candidate values: {}`, [candidates.join(", ")]]],

            NoneOfEnumStates: (err) => [["f", `Value is not one of enumeration "{}"'s state: {}`, [err[0], err[1].join(", ")]]],

            CustomError: (err): DecodingErrorLine[] => [["l", err]],
        })
    }

    /**
     * Render each line of the error individually
     * @param formatter An optional formatter for parameters in the error lines
     */
    renderLines(formatter?: (message: MsgParam) => string): string[] {
        return DecodingError.renderLines(this.rawLines(), formatter)
    }

    /**
     * Render the error as a text
     * @param message
     */
    render(formatter?: (message: MsgParam) => string): string {
        return this.renderLines(formatter).join("\n")
    }

    /**
     * Render a list of error lines
     * @param errorLines
     * @param formatter An optional formatter for parameters in the error lines
     */
    static renderLines(errorLines: DecodingErrorLine[], formatter?: (message: MsgParam) => string): string[] {
        let rendered: string[] = []

        for (const line of errorLines) {
            switch (line[0]) {
                case "s":
                    rendered.push(line[1])
                    break

                case "f":
                    rendered.push(formatCustom(formatter || ((msg) => msg.toString()), line[1], ...line[2]))
                    break

                case "e":
                    rendered = rendered.concat(DecodingError.renderLines(line[1].rawLines(), formatter).map((line) => "\t" + line))
                    break

                case "l":
                    rendered = rendered.concat(DecodingError.renderLines(line[1], formatter).map((line) => "\t" + line))
            }
        }

        return rendered
    }
}

/**
 * (Internal) Stringify a value whose type is not known
 * @param value
 */
function _stringify(value: unknown): string {
    if (value === null) {
        return "<null>"
    } else if (value === undefined) {
        return "<undefined>"
    } else if ((value as any).toString) {
        if (typeof (value as any).toString === "function") {
            const stringifed = (value as any).toString()

            if (typeof stringifed === "string") {
                // Avoid vertical overflow when displaying
                const lines = stringifed.split(/\r\n|\r|\n/)
                // Avoid horizontal overflow too
                return lines[0].length > 64 ? lines[0] + "..." : lines[0]
            } else {
                return "<not stringifyable (.toString() did not return a string)>"
            }
        } else {
            return "<not stringifyable (.toString() method not found)>"
        }
    } else {
        return "<not stringifyable (.toString property not found)>"
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
                    return Err(new DecodingError(state("ArrayItem", [i, decoded.unwrapErr()])))
                }

                out.push(decoded.unwrap())
            }

            return Ok(out)
        })
    }

    /** Decode dictionaries with a custom decoder for keys and another for values */
    export function dictOf<K, V>(keyDecoder: GDecoder<K>, valueDecoder: GDecoder<V>): GDecoder<Dictionary<K, V>> {
        return then(instanceOf(Dictionary), (dict) =>
            dict.resultable((key, value) =>
                keyDecoder(key)
                    .mapErr((err) => new DecodingError(state("DictionaryKey", [_stringify(key), err])))
                    .andThen((key) =>
                        valueDecoder(value)
                            .mapErr((err) => new DecodingError(state("DictionaryValue", [_stringify(key), err])))
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
                        .mapErr((err) => new DecodingError(state("DictionaryKey", [_stringify(key), err])))
                        .andThen((key) =>
                            valueDecoder(value)
                                .mapErr((err) => new DecodingError(state("DictionaryValue", [_stringify(key), err])))
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
                    return Err(new DecodingError(state("CollectionItem", [field.toString(), decoded.unwrapErr()])))
                }

                out.push(decoded.unwrap())
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
            value === primitive ? Ok(value as P) : Err(new DecodingError(state("WrongType", `primitive[${JSON.stringify(primitive)}]`)))
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
    export function maybe<F, T>(decoder: Decoder<F, T>): Decoder<F, Option<T>> {
        return (value) => Option.transpose(Option.nullable(value).map((value) => decoder(value)))
    }

    /** Decode an optional value */
    export function optional<F, T>(decoder: Decoder<F, T>): Decoder<F, T | undefined> {
        return (value) => (value === undefined ? Ok(undefined) : decoder(value))
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
                            candidates.map((c) => _stringify(c))
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
                : Err(new DecodingError(state("NoneOfEnumStates", [cstr.name, cases.map((c) => _stringify(c))])))
    }

    /** Decode an Either<L, R> value */
    export function either<F, T>(...decoders: Array<Decoder<F, T>>): Decoder<F, T> {
        return (value) => {
            const errors = []

            for (const decoder of decoders) {
                const decoded = decoder(value)

                if (decoded.isOk()) return Ok(decoded.unwrap())

                errors.push(decoded.unwrapErr())
            }

            return Err(new DecodingError(state("NoneOfEither", errors)))
        }
    }

    /** Decode arrays/lists to moderately-typed tuples as arrays with a common decoder for each member of the tuple */
    export function untypedTuple<F>(decoders: Array<Decoder<F, unknown>>): Decoder<F[] | List<F>, unknown[]> {
        return (encoded) => {
            const arr = encoded instanceof List ? encoded.toArray() : encoded

            let out: unknown[] = []
            let i = 0

            if (arr.length < decoders.length) {
                return Err(new DecodingError(state("MissingTupleEntry", decoders.length)))
            }

            for (const decoder of decoders) {
                let decoded = decoder(arr[i++])

                if (decoded.isErr()) {
                    return Err(new DecodingError(state("ArrayItem", [i - 1, decoded.unwrapErr()])))
                }

                out.push(decoded.unwrap())
            }

            return Ok(out)
        }
    }

    /** Decode key/value pairs to moderately-typed collections with a common decoder for each member of the mapping */
    export function untypedMapped<F>(
        mappings: Array<[string, Decoder<F, unknown>]>
    ): Decoder<Collection<F> | Dictionary<string, F>, Collection<unknown>> {
        return (encoded) => {
            const coll = encoded instanceof Dictionary ? encoded.mapKeysToCollection((k) => k) : encoded
            let out: Collection<unknown> = {}

            for (const [field, decoder] of mappings) {
                if (!coll.hasOwnProperty(field)) {
                    return Err(new DecodingError(state("MissingCollectionField", field)))
                }

                let decoded = decoder(coll[field])

                if (decoded.isErr()) {
                    return Err(new DecodingError(state("CollectionItem", [field, decoded.unwrapErr()])))
                }

                out[field] = decoded.unwrap()
            }

            return Ok(out)
        }
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

    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA>(d:[[KA,Decoder<_F, VA>]]):Decoder<CollOrDict<_F>, __V<KA,VA>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>],[KT,Decoder<_F, VT>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>],[KT,Decoder<_F, VT>],[KU,Decoder<_F, VU>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>],[KT,Decoder<_F, VT>],[KU,Decoder<_F, VU>],[KV,Decoder<_F, VV>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>],[KT,Decoder<_F, VT>],[KU,Decoder<_F, VU>],[KV,Decoder<_F, VV>],[KW,Decoder<_F, VW>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>],[KT,Decoder<_F, VT>],[KU,Decoder<_F, VU>],[KV,Decoder<_F, VV>],[KW,Decoder<_F, VW>],[KX,Decoder<_F, VX>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX,KY extends __K,VY>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>],[KT,Decoder<_F, VT>],[KU,Decoder<_F, VU>],[KV,Decoder<_F, VV>],[KW,Decoder<_F, VW>],[KX,Decoder<_F, VX>],[KY,Decoder<_F, VY>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>&__V<KY,VY>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX,KY extends __K,VY,KZ extends __K,VZ>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>],[KT,Decoder<_F, VT>],[KU,Decoder<_F, VU>],[KV,Decoder<_F, VV>],[KW,Decoder<_F, VW>],[KX,Decoder<_F, VX>],[KY,Decoder<_F, VY>],[KZ,Decoder<_F, VZ>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>&__V<KY,VY>&__V<KZ,VZ>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX,KY extends __K,VY,KZ extends __K,VZ,KAA extends __K,VAA>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>],[KT,Decoder<_F, VT>],[KU,Decoder<_F, VU>],[KV,Decoder<_F, VV>],[KW,Decoder<_F, VW>],[KX,Decoder<_F, VX>],[KY,Decoder<_F, VY>],[KZ,Decoder<_F, VZ>],[KAA,Decoder<_F, VAA>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>&__V<KY,VY>&__V<KZ,VZ>&__V<KAA,VAA>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX,KY extends __K,VY,KZ extends __K,VZ,KAA extends __K,VAA,KAB extends __K,VAB>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>],[KT,Decoder<_F, VT>],[KU,Decoder<_F, VU>],[KV,Decoder<_F, VV>],[KW,Decoder<_F, VW>],[KX,Decoder<_F, VX>],[KY,Decoder<_F, VY>],[KZ,Decoder<_F, VZ>],[KAA,Decoder<_F, VAA>],[KAB,Decoder<_F, VAB>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>&__V<KY,VY>&__V<KZ,VZ>&__V<KAA,VAA>&__V<KAB,VAB>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX,KY extends __K,VY,KZ extends __K,VZ,KAA extends __K,VAA,KAB extends __K,VAB,KAC extends __K,VAC>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>],[KT,Decoder<_F, VT>],[KU,Decoder<_F, VU>],[KV,Decoder<_F, VV>],[KW,Decoder<_F, VW>],[KX,Decoder<_F, VX>],[KY,Decoder<_F, VY>],[KZ,Decoder<_F, VZ>],[KAA,Decoder<_F, VAA>],[KAB,Decoder<_F, VAB>],[KAC,Decoder<_F, VAC>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>&__V<KY,VY>&__V<KZ,VZ>&__V<KAA,VAA>&__V<KAB,VAB>&__V<KAC,VAC>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX,KY extends __K,VY,KZ extends __K,VZ,KAA extends __K,VAA,KAB extends __K,VAB,KAC extends __K,VAC,KAD extends __K,VAD>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>],[KT,Decoder<_F, VT>],[KU,Decoder<_F, VU>],[KV,Decoder<_F, VV>],[KW,Decoder<_F, VW>],[KX,Decoder<_F, VX>],[KY,Decoder<_F, VY>],[KZ,Decoder<_F, VZ>],[KAA,Decoder<_F, VAA>],[KAB,Decoder<_F, VAB>],[KAC,Decoder<_F, VAC>],[KAD,Decoder<_F, VAD>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>&__V<KY,VY>&__V<KZ,VZ>&__V<KAA,VAA>&__V<KAB,VAB>&__V<KAC,VAC>&__V<KAD,VAD>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX,KY extends __K,VY,KZ extends __K,VZ,KAA extends __K,VAA,KAB extends __K,VAB,KAC extends __K,VAC,KAD extends __K,VAD,KAE extends __K,VAE>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>],[KT,Decoder<_F, VT>],[KU,Decoder<_F, VU>],[KV,Decoder<_F, VV>],[KW,Decoder<_F, VW>],[KX,Decoder<_F, VX>],[KY,Decoder<_F, VY>],[KZ,Decoder<_F, VZ>],[KAA,Decoder<_F, VAA>],[KAB,Decoder<_F, VAB>],[KAC,Decoder<_F, VAC>],[KAD,Decoder<_F, VAD>],[KAE,Decoder<_F, VAE>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>&__V<KY,VY>&__V<KZ,VZ>&__V<KAA,VAA>&__V<KAB,VAB>&__V<KAC,VAC>&__V<KAD,VAD>&__V<KAE,VAE>>;
    /* prettier-ignore */ export function mapped<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX,KY extends __K,VY,KZ extends __K,VZ,KAA extends __K,VAA,KAB extends __K,VAB,KAC extends __K,VAC,KAD extends __K,VAD,KAE extends __K,VAE,KAF extends __K,VAF>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>],[KT,Decoder<_F, VT>],[KU,Decoder<_F, VU>],[KV,Decoder<_F, VV>],[KW,Decoder<_F, VW>],[KX,Decoder<_F, VX>],[KY,Decoder<_F, VY>],[KZ,Decoder<_F, VZ>],[KAA,Decoder<_F, VAA>],[KAB,Decoder<_F, VAB>],[KAC,Decoder<_F, VAC>],[KAD,Decoder<_F, VAD>],[KAE,Decoder<_F, VAE>],[KAF,Decoder<_F, VAF>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>&__V<KY,VY>&__V<KZ,VZ>&__V<KAA,VAA>&__V<KAB,VAB>&__V<KAC,VAC>&__V<KAD,VAD>&__V<KAE,VAE>&__V<KAF,VAF>>;
    /* prettier-ignore */ export function mapped(d: Array<[any, Decoder<any, any>]>): any {
        return untypedMapped(d)
    }

    type __K = string
    type __V<K extends string | number | symbol, V> = { [key in K]: V }
    type CollOrDict<F> = Collection<F> | Dictionary<string, F>
}
