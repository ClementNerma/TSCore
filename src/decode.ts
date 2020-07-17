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

export type Decoder<F, T> = (value: F) => Result<T, DecodingError>
export type GDecoder<T> = Decoder<unknown, T>

export type DecodingErrorLine =
    // String literal
    | ["s", string]
    // String to format
    | ["f", string, MsgParam[]]
    // Decoding error
    | ["e", DecodingError]
    // Raw decoding error lines
    | ["l", DecodingErrorLine[]]

export class DecodingError extends Matchable<
    | State<"WrongType", string>
    | State<"ArrayItem", [number, DecodingError]>
    | State<"ListItem", [number, DecodingError]>
    | State<"CollectionItem", [string, DecodingError]>
    | State<"DictionaryKey", [string, DecodingError]>
    | State<"DictionaryValue", [string, DecodingError]>
    | State<"MissingTupleEntry", number>
    | State<"MissingCollectionField", string>
    | State<"NoneOfEither", [DecodingError, DecodingError]>
    | State<"NoneOfCases", string[]>
    | State<"NoneOfEnumStates", [string, string[]]>
    | State<"CustomError", DecodingErrorLine[]>
> {
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

            NoneOfEither: (err) => [
                ["s", `...failed to decode using either() with decoder A:`],
                ["e", err[0]],
                ["s", "...as well as with decoder B:"],
                ["e", err[1]],
            ],

            NoneOfCases: (candidates) => [["f", `Value is not one of the candidate values: {}`, [candidates.join(", ")]]],

            NoneOfEnumStates: (err) => [["f", `Value is not one of enumeration "{}"'s state: {}`, [err[0], err[1].join(", ")]]],

            CustomError: (err): DecodingErrorLine[] => [
                ["s", "Failed to decode using custom decoder:"],
                ["l", err],
            ],
        })
    }

    renderLines(formatter?: (message: MsgParam) => string): string[] {
        return DecodingError.renderLines(this.rawLines(), formatter)
    }

    render(formatter?: (message: MsgParam) => string): string {
        return this.renderLines(formatter).join("\n")
    }

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

export namespace Decoders {
    export function exactlyUndefined(value: unknown): Result<undefined, DecodingError> {
        return value === undefined ? Ok(undefined) : Err(new DecodingError(state("WrongType", "undefined")))
    }

    export function exactlyNull(value: unknown): Result<null, DecodingError> {
        return value === null ? Ok(null) : Err(new DecodingError(state("WrongType", "null")))
    }

    export function nil(value: unknown): Result<null | undefined, DecodingError> {
        return value === null || value === undefined ? Ok(value as null | undefined) : Err(new DecodingError(state("WrongType", "nil")))
    }

    export function bool(value: unknown): Result<boolean, DecodingError> {
        return value === true || value === false ? Ok(value) : Err(new DecodingError(state("WrongType", "boolean")))
    }

    export function number(value: unknown): Result<number, DecodingError> {
        return typeof value === "number" ? Ok(value) : Err(new DecodingError(state("WrongType", "number")))
    }

    export function string(value: unknown): Result<string, DecodingError> {
        return typeof value === "string" ? Ok(value) : Err(new DecodingError(state("WrongType", "string")))
    }

    export function array(value: unknown): Result<Array<unknown>, DecodingError> {
        return O.isArray(value) ? Ok(value) : Err(new DecodingError(state("WrongType", "array")))
    }

    export function collection(value: unknown): Result<Collection<unknown>, DecodingError> {
        return O.isCollection(value) ? Ok(value) : Err(new DecodingError(state("WrongType", "collection")))
    }

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

    export function listOf<T>(decoder: GDecoder<T>): GDecoder<List<T>> {
        return then(instanceOf(List), (list) =>
            list.resultable((item, i) => decoder(item).mapErr((err) => new DecodingError(state("ListItem", [i, err]))))
        )
    }

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

    export function untypedMapped<F>(
        mappings: Array<[string, Decoder<F, unknown>]>
    ): Decoder<Collection<F> | Dictionary<string, F>, { [key: string]: unknown }> {
        return (encoded) => {
            const coll = encoded instanceof Dictionary ? encoded.mapKeysToCollection((k) => k) : encoded
            let out: { [key: string]: unknown } = {}

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

    // prettier-ignore
    export function tuple1<_F,A>(d:[Decoder<_F,A>]):Decoder<_F[]|List<_F>,[A]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple2<_F,A,B>(d:[Decoder<_F,A>,Decoder<_F,B>]):Decoder<_F[]|List<_F>,[A,B]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple3<_F,A,B,C>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>]):Decoder<_F[]|List<_F>,[A,B,C]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple4<_F,A,B,C,D>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>]):Decoder<_F[]|List<_F>,[A,B,C,D]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple5<_F,A,B,C,D,E>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>]):Decoder<_F[]|List<_F>,[A,B,C,D,E]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple6<_F,A,B,C,D,E,F>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple7<_F,A,B,C,D,E,F,G>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple8<_F,A,B,C,D,E,F,G,H>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple9<_F,A,B,C,D,E,F,G,H,I>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple10<_F,A,B,C,D,E,F,G,H,I,J>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple11<_F,A,B,C,D,E,F,G,H,I,J,K>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple12<_F,A,B,C,D,E,F,G,H,I,J,K,L>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple13<_F,A,B,C,D,E,F,G,H,I,J,K,L,M>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple14<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple15<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple16<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple17<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple18<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple19<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple20<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>,Decoder<_F,T>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple21<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>,Decoder<_F,T>,Decoder<_F,U>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple22<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>,Decoder<_F,T>,Decoder<_F,U>,Decoder<_F,V>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple23<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>,Decoder<_F,T>,Decoder<_F,U>,Decoder<_F,V>,Decoder<_F,W>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple24<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>,Decoder<_F,T>,Decoder<_F,U>,Decoder<_F,V>,Decoder<_F,W>,Decoder<_F,X>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple25<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>,Decoder<_F,T>,Decoder<_F,U>,Decoder<_F,V>,Decoder<_F,W>,Decoder<_F,X>,Decoder<_F,Y>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple26<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>,Decoder<_F,T>,Decoder<_F,U>,Decoder<_F,V>,Decoder<_F,W>,Decoder<_F,X>,Decoder<_F,Y>,Decoder<_F,Z>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple27<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>,Decoder<_F,T>,Decoder<_F,U>,Decoder<_F,V>,Decoder<_F,W>,Decoder<_F,X>,Decoder<_F,Y>,Decoder<_F,Z>,Decoder<_F,AA>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple28<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>,Decoder<_F,T>,Decoder<_F,U>,Decoder<_F,V>,Decoder<_F,W>,Decoder<_F,X>,Decoder<_F,Y>,Decoder<_F,Z>,Decoder<_F,AA>,Decoder<_F,AB>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple29<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>,Decoder<_F,T>,Decoder<_F,U>,Decoder<_F,V>,Decoder<_F,W>,Decoder<_F,X>,Decoder<_F,Y>,Decoder<_F,Z>,Decoder<_F,AA>,Decoder<_F,AB>,Decoder<_F,AC>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple30<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC,AD>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>,Decoder<_F,T>,Decoder<_F,U>,Decoder<_F,V>,Decoder<_F,W>,Decoder<_F,X>,Decoder<_F,Y>,Decoder<_F,Z>,Decoder<_F,AA>,Decoder<_F,AB>,Decoder<_F,AC>,Decoder<_F,AD>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC,AD]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple31<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC,AD,AE>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>,Decoder<_F,T>,Decoder<_F,U>,Decoder<_F,V>,Decoder<_F,W>,Decoder<_F,X>,Decoder<_F,Y>,Decoder<_F,Z>,Decoder<_F,AA>,Decoder<_F,AB>,Decoder<_F,AC>,Decoder<_F,AD>,Decoder<_F,AE>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC,AD,AE]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple32<_F,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC,AD,AE,AF>(d:[Decoder<_F,A>,Decoder<_F,B>,Decoder<_F,C>,Decoder<_F,D>,Decoder<_F,E>,Decoder<_F,F>,Decoder<_F,G>,Decoder<_F,H>,Decoder<_F,I>,Decoder<_F,J>,Decoder<_F,K>,Decoder<_F,L>,Decoder<_F,M>,Decoder<_F,N>,Decoder<_F,O>,Decoder<_F,P>,Decoder<_F,Q>,Decoder<_F,R>,Decoder<_F,S>,Decoder<_F,T>,Decoder<_F,U>,Decoder<_F,V>,Decoder<_F,W>,Decoder<_F,X>,Decoder<_F,Y>,Decoder<_F,Z>,Decoder<_F,AA>,Decoder<_F,AB>,Decoder<_F,AC>,Decoder<_F,AD>,Decoder<_F,AE>,Decoder<_F,AF>]):Decoder<_F[]|List<_F>,[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC,AD,AE,AF]>{return untypedTuple(d) as any;}

    type __K = string
    type __V<K extends string | number | symbol, V> = { [key in K]: V }
    type CollOrDict<F> = Collection<F> | Dictionary<string, F>

    // prettier-ignore
    export function mapped1<_F,KA extends __K,VA>(d:[[KA,Decoder<_F, VA>]]):Decoder<CollOrDict<_F>, __V<KA,VA>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped2<_F,KA extends __K,VA,KB extends __K,VB>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped3<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped4<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped5<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped6<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped7<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped8<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped9<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped10<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped11<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped12<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped13<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped14<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped15<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped16<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped17<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped18<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped19<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped20<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>],[KT,Decoder<_F, VT>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped21<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>],[KT,Decoder<_F, VT>],[KU,Decoder<_F, VU>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped22<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>],[KT,Decoder<_F, VT>],[KU,Decoder<_F, VU>],[KV,Decoder<_F, VV>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped23<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>],[KT,Decoder<_F, VT>],[KU,Decoder<_F, VU>],[KV,Decoder<_F, VV>],[KW,Decoder<_F, VW>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped24<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>],[KT,Decoder<_F, VT>],[KU,Decoder<_F, VU>],[KV,Decoder<_F, VV>],[KW,Decoder<_F, VW>],[KX,Decoder<_F, VX>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped25<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX,KY extends __K,VY>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>],[KT,Decoder<_F, VT>],[KU,Decoder<_F, VU>],[KV,Decoder<_F, VV>],[KW,Decoder<_F, VW>],[KX,Decoder<_F, VX>],[KY,Decoder<_F, VY>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>&__V<KY,VY>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped26<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX,KY extends __K,VY,KZ extends __K,VZ>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>],[KT,Decoder<_F, VT>],[KU,Decoder<_F, VU>],[KV,Decoder<_F, VV>],[KW,Decoder<_F, VW>],[KX,Decoder<_F, VX>],[KY,Decoder<_F, VY>],[KZ,Decoder<_F, VZ>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>&__V<KY,VY>&__V<KZ,VZ>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped27<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX,KY extends __K,VY,KZ extends __K,VZ,KAA extends __K,VAA>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>],[KT,Decoder<_F, VT>],[KU,Decoder<_F, VU>],[KV,Decoder<_F, VV>],[KW,Decoder<_F, VW>],[KX,Decoder<_F, VX>],[KY,Decoder<_F, VY>],[KZ,Decoder<_F, VZ>],[KAA,Decoder<_F, VAA>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>&__V<KY,VY>&__V<KZ,VZ>&__V<KAA,VAA>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped28<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX,KY extends __K,VY,KZ extends __K,VZ,KAA extends __K,VAA,KAB extends __K,VAB>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>],[KT,Decoder<_F, VT>],[KU,Decoder<_F, VU>],[KV,Decoder<_F, VV>],[KW,Decoder<_F, VW>],[KX,Decoder<_F, VX>],[KY,Decoder<_F, VY>],[KZ,Decoder<_F, VZ>],[KAA,Decoder<_F, VAA>],[KAB,Decoder<_F, VAB>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>&__V<KY,VY>&__V<KZ,VZ>&__V<KAA,VAA>&__V<KAB,VAB>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped29<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX,KY extends __K,VY,KZ extends __K,VZ,KAA extends __K,VAA,KAB extends __K,VAB,KAC extends __K,VAC>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>],[KT,Decoder<_F, VT>],[KU,Decoder<_F, VU>],[KV,Decoder<_F, VV>],[KW,Decoder<_F, VW>],[KX,Decoder<_F, VX>],[KY,Decoder<_F, VY>],[KZ,Decoder<_F, VZ>],[KAA,Decoder<_F, VAA>],[KAB,Decoder<_F, VAB>],[KAC,Decoder<_F, VAC>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>&__V<KY,VY>&__V<KZ,VZ>&__V<KAA,VAA>&__V<KAB,VAB>&__V<KAC,VAC>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped30<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX,KY extends __K,VY,KZ extends __K,VZ,KAA extends __K,VAA,KAB extends __K,VAB,KAC extends __K,VAC,KAD extends __K,VAD>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>],[KT,Decoder<_F, VT>],[KU,Decoder<_F, VU>],[KV,Decoder<_F, VV>],[KW,Decoder<_F, VW>],[KX,Decoder<_F, VX>],[KY,Decoder<_F, VY>],[KZ,Decoder<_F, VZ>],[KAA,Decoder<_F, VAA>],[KAB,Decoder<_F, VAB>],[KAC,Decoder<_F, VAC>],[KAD,Decoder<_F, VAD>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>&__V<KY,VY>&__V<KZ,VZ>&__V<KAA,VAA>&__V<KAB,VAB>&__V<KAC,VAC>&__V<KAD,VAD>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped31<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX,KY extends __K,VY,KZ extends __K,VZ,KAA extends __K,VAA,KAB extends __K,VAB,KAC extends __K,VAC,KAD extends __K,VAD,KAE extends __K,VAE>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>],[KT,Decoder<_F, VT>],[KU,Decoder<_F, VU>],[KV,Decoder<_F, VV>],[KW,Decoder<_F, VW>],[KX,Decoder<_F, VX>],[KY,Decoder<_F, VY>],[KZ,Decoder<_F, VZ>],[KAA,Decoder<_F, VAA>],[KAB,Decoder<_F, VAB>],[KAC,Decoder<_F, VAC>],[KAD,Decoder<_F, VAD>],[KAE,Decoder<_F, VAE>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>&__V<KY,VY>&__V<KZ,VZ>&__V<KAA,VAA>&__V<KAB,VAB>&__V<KAC,VAC>&__V<KAD,VAD>&__V<KAE,VAE>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped32<_F,KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX,KY extends __K,VY,KZ extends __K,VZ,KAA extends __K,VAA,KAB extends __K,VAB,KAC extends __K,VAC,KAD extends __K,VAD,KAE extends __K,VAE,KAF extends __K,VAF>(d:[[KA,Decoder<_F, VA>],[KB,Decoder<_F, VB>],[KC,Decoder<_F, VC>],[KD,Decoder<_F, VD>],[KE,Decoder<_F, VE>],[KF,Decoder<_F, VF>],[KG,Decoder<_F, VG>],[KH,Decoder<_F, VH>],[KI,Decoder<_F, VI>],[KJ,Decoder<_F, VJ>],[KK,Decoder<_F, VK>],[KL,Decoder<_F, VL>],[KM,Decoder<_F, VM>],[KN,Decoder<_F, VN>],[KO,Decoder<_F, VO>],[KP,Decoder<_F, VP>],[KQ,Decoder<_F, VQ>],[KR,Decoder<_F, VR>],[KS,Decoder<_F, VS>],[KT,Decoder<_F, VT>],[KU,Decoder<_F, VU>],[KV,Decoder<_F, VV>],[KW,Decoder<_F, VW>],[KX,Decoder<_F, VX>],[KY,Decoder<_F, VY>],[KZ,Decoder<_F, VZ>],[KAA,Decoder<_F, VAA>],[KAB,Decoder<_F, VAB>],[KAC,Decoder<_F, VAC>],[KAD,Decoder<_F, VAD>],[KAE,Decoder<_F, VAE>],[KAF,Decoder<_F, VAF>]]):Decoder<CollOrDict<_F>, __V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>&__V<KY,VY>&__V<KZ,VZ>&__V<KAA,VAA>&__V<KAB,VAB>&__V<KAC,VAC>&__V<KAD,VAD>&__V<KAE,VAE>&__V<KAF,VAF>>{return untypedMapped(d) as any;}

    export function instanceOf<F, T>(cstr: new (...args: any[]) => T): Decoder<F, T> {
        return (value) => (value instanceof cstr ? Ok(value) : Err(new DecodingError(state("WrongType", `constructor[${cstr.name}]`))))
    }

    export function withType<F, T extends F>(typename: string, predicate: (value: F) => value is T): Decoder<F, T> {
        return (value) => (predicate(value) ? Ok(value) : Err(new DecodingError(state("WrongType", typename))))
    }

    export function map<F, T, U>(decoder: Decoder<F, T>, mapper: (value: T) => U): Decoder<F, U> {
        return (value) => decoder(value).map(mapper)
    }

    export function then<F, T, U>(decoder: Decoder<F, T>, mapper: Decoder<T, U>): Decoder<F, U> {
        return (value) => decoder(value).andThen(mapper)
    }

    export function optional<F, T>(decoder: Decoder<F, T>): Decoder<F, Option<T>> {
        return (value) => Option.transpose(Option.nullable(value).map((value) => decoder(value)))
    }

    export function maybe<F, T>(decoder: Decoder<F, T>): Decoder<F, T | undefined> {
        return (value) => (value === undefined ? Ok(undefined) : decoder(value))
    }

    export function either<F, T>(decoderA: Decoder<F, T>, decoderB: Decoder<F, T>): Decoder<F, T> {
        return (value) => {
            const aDecoded = decoderA(value)

            if (aDecoded.isOk()) {
                return Ok(aDecoded.unwrap())
            }

            const bDecoded = decoderB(value)

            if (bDecoded.isOk()) {
                return Ok(bDecoded.unwrap())
            }

            return Err(new DecodingError(state("NoneOfEither", [aDecoded.unwrapErr(), bDecoded.unwrapErr()])))
        }
    }

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

    export function enumState<S extends object, T extends Matchable<S>>(cstr: new (state: S) => T, cases: Array<VoidStates<S>>): Decoder<string, T> {
        return (value) =>
            cases.includes(value as any)
                ? Ok(new cstr(enumStr(value) as any))
                : Err(new DecodingError(state("NoneOfEnumStates", [cstr.name, cases.map((c) => _stringify(c))])))
    }
}
