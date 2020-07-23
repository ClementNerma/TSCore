/**
 * @file JSON parsing and decoding
 */

import { panic, unreachable } from './console'
import { Decoder, Decoders as d, DecodingError, DecodingErrorLine } from './decode'
import { Dictionary, RecordDict } from './dictionary'
import { Either } from './either'
import { Iter } from './iter'
import { List } from './list'
import { AbstractMatchable, State, hasState, state } from './match'
import { MaybeUninit } from './maybeUinit'
import { Collection, O } from './objects'
import { None, Option, Some, getStateValue } from './option'
import { Err, Ok, Result } from './result'

export type JsonValuePrimitive = null | boolean | number | string

export type NativeJsonValueType = JsonValuePrimitive | Array<NativeJsonValueType> | { [key: string]: NativeJsonValueType }

export type JsonValueType =
    | JsonValuePrimitive
    | Array<JsonValueType>
    | List<JsonValueType>
    | { [key: string]: JsonValueType }
    | Dictionary<string, JsonValueType>
    | RecordDict<JsonValueType>

export type MatchableJsonValue =
    | State<"Null", null>
    | State<"Boolean", boolean>
    | State<"Number", number>
    | State<"String", string>
    | State<"Array", List<JsonValue>>
    | State<"Collection", RecordDict<JsonValue>>

export type EncodableJsonValue =
    | JsonValuePrimitive
    | Array<EncodableJsonValue>
    | List<EncodableJsonValue>
    | { [key: string]: EncodableJsonValue }
    | Dictionary<string, EncodableJsonValue>
    | RecordDict<EncodableJsonValue>
    | Option<EncodableJsonValue>
    | Either<EncodableJsonValue, EncodableJsonValue>
    | Iter<EncodableJsonValue>
    | MaybeUninit<EncodableJsonValue>

export class JsonValue extends AbstractMatchable<MatchableJsonValue> {
    private readonly value: JsonValueType

    constructor(value: JsonValueType) {
        super(() => {
            if (this.value === null) {
                // TODO: This cast should NOT be required
                return state("Null", this.value as null)
            } else if (this.value === true || this.value === false) {
                return state("Boolean", this.value)
            } else if (this.value.constructor === Number) {
                return state("Number", this.value as number)
            } else if (this.value.constructor === String) {
                return state("String", this.value as string)
            } else if (this.value instanceof List) {
                return state(
                    "Array",
                    this.value.map((value) => new JsonValue(value))
                )
            } else if (this.value instanceof Dictionary) {
                return state("Collection", RecordDict.cast(this.value.mapValues((value) => new JsonValue(value))))
            } else if (O.isArray(this.value)) {
                return state(
                    "Array",
                    new List(this.value).map((value) => new JsonValue(value))
                )
            } else if (O.isCollection(this.value)) {
                const dict = RecordDict.fromCollection(this.value)
                return state("Collection", RecordDict.cast(dict.mapValues((value) => new JsonValue(value))))
            } else {
                unreachable()
            }
        })

        this.value = value
    }

    static parse(source: string): Result<JsonValue, Error> {
        return Result.fallible(() => JSON.parse(source) as JsonValueType).map((json) => new JsonValue(json))
    }

    static extendedToNative(value: EncodableJsonValue): NativeJsonValueType {
        if (value === null || value === false || value === true || typeof value === "number" || typeof value === "string") {
            return value
        }

        if (value instanceof List) {
            return value.toArray().map(JsonValue.extendedToNative)
        }

        if (value instanceof Dictionary) {
            return value.mapValuesToCollectionUnchecked(JsonValue.extendedToNative)
        }

        if (value instanceof Option) {
            return value.match({
                Some: JsonValue.extendedToNative,
                None: () => null,
            })
        }

        if (value instanceof Either) {
            return value.match({
                Left: JsonValue.extendedToNative,
                Right: JsonValue.extendedToNative,
            })
        }

        if (value instanceof Iter) {
            return value.collectArray().map(JsonValue.extendedToNative)
        }

        if (value instanceof MaybeUninit) {
            return JsonValue.extendedToNative(value.value())
        }

        if (O.isArray(value)) {
            return value.map(JsonValue.extendedToNative)
        }

        if (O.isCollection(value)) {
            return O.mapValues(value, JsonValue.extendedToNative)
        }

        unreachable('Provided value is not a valid encodable JSON value (are you using "as any" when calling this function?)')
    }

    static tryEncode(value: unknown): Result<NativeJsonValueType, string> {
        if (value === undefined) {
            return Err('Cannot encode "undefined" to JSON')
        }

        if (value === null || value === false || value === true || typeof value === "number" || typeof value === "string") {
            return Ok(value)
        }

        if (value instanceof List) {
            return value.resultable(JsonValue.tryEncode).map((list) => list.toArray())
        }

        if (value instanceof Dictionary) {
            const out: Collection<NativeJsonValueType> = {}

            for (const [key, val] of value) {
                if (typeof key !== "string") return Err('Key "' + key + '" from dictionary must be a string')

                const encodedVal = JsonValue.tryEncode(val)
                if (encodedVal.isErr()) return Err('Failed to unwrap value of key "' + key + '": ' + encodedVal.unwrapErr())

                out[key] = encodedVal.unwrap()
            }

            return Ok(out)
        }

        if (value instanceof Option) {
            return value.match({
                Some: JsonValue.tryEncode,
                None: () => Ok(null),
            })
        }

        if (value instanceof Result) {
            return value.mapErr(() => "Cannot encode Err() variants of Result<T, E> values").andThen(JsonValue.tryEncode)
        }

        if (value instanceof Either) {
            return value.match({
                Left: JsonValue.tryEncode,
                Right: JsonValue.tryEncode,
            })
        }

        if (value instanceof Iter) {
            return value
                .collect()
                .resultable(JsonValue.tryEncode)
                .map((list) => list.toArray())
        }

        if (value instanceof MaybeUninit) {
            return JsonValue.tryEncode(value.value())
        }

        if (O.isArray(value)) {
            return new List(value).resultable(JsonValue.tryEncode).map((list) => list.toArray())
        }

        if (O.isCollection(value)) {
            const out: Collection<NativeJsonValueType> = {}

            for (const [key, val] of O.entries(value)) {
                const encodedVal = JsonValue.tryEncode(val)
                if (encodedVal.isErr()) return Err('Failed to unwrap value of key "' + key + '": ' + encodedVal.unwrapErr())

                out[key] = encodedVal.unwrap()
            }

            return Ok(out)
        }

        unreachable('Provided value is not a valid encodable JSON value (are you using "as any" when calling this function?)')
    }

    static stringify(value: unknown, indent = 0): Result<string, string> {
        return JsonValue.tryEncode(value).map((json) => JSON.stringify(json, null, indent))
    }

    isNull(): boolean {
        return hasState(this, "Null")
    }

    isBoolean(): boolean {
        return hasState(this, "Boolean")
    }

    isNumber(): boolean {
        return hasState(this, "Number")
    }

    isString(): boolean {
        return hasState(this, "String")
    }

    isArray(size?: number): boolean {
        if (size === undefined) {
            return hasState(this, "Array")
        } else {
            return getStateValue(this, "Array")
                .map((list) => list.length === size)
                .unwrapOr(false)
        }
    }

    isCollection(): boolean {
        return hasState(this, "Collection")
    }

    as<T extends JsonValuePrimitive>(value: T): Option<T> {
        if (this._getStateValue() === value) {
            return Some(value)
        } else {
            return None()
        }
    }

    asOneOf<T extends JsonValuePrimitive>(values: Array<T>): Option<T> {
        const value = this._getStateValue()

        if (values.includes(value as any)) {
            return Some(value as T)
        } else {
            return None()
        }
    }

    asNull(): Option<null> {
        return getStateValue(this, "Null")
    }

    asBoolean(): Option<boolean> {
        return getStateValue(this, "Boolean")
    }

    asNumber(): Option<number> {
        return getStateValue(this, "Number")
    }

    asString(): Option<string> {
        return getStateValue(this, "String")
    }

    asArray(size?: number): Option<List<JsonValue>> {
        return getStateValue(this, "Array").filter((list) => size === undefined || list.length === size)
    }

    asCollection(): Option<RecordDict<JsonValue>> {
        return getStateValue(this, "Collection")
    }

    asParsableNumber(base = 10): Option<number> {
        return this.match({
            Number: (num) => Some(num),
            String: (str) => {
                let parsed = parseInt(str, base)
                return Number.isNaN(parsed) ? None() : Some(parsed)
            },
            _: (_) => None(),
        })
    }

    decode<T>(decoder: JsonDecoder<T>): Result<T, DecodingError> {
        return decoder(this)
    }

    expectToBeNull(): null {
        return getStateValue(this, "Null").expect('JSON value has not "Null" type!')
    }

    expectToBeBoolean(): boolean {
        return getStateValue(this, "Boolean").expect('JSON value has not "Boolean" type!')
    }

    expectToBeNumber(): number {
        return getStateValue(this, "Number").expect('JSON value has not "Number" type!')
    }

    expectToBeString(): string {
        return getStateValue(this, "String").expect('JSON value has not "String" type!')
    }

    expectToBeArray(): List<JsonValue> {
        return getStateValue(this, "Array").expect('JSON value has not "Array" type!')
    }

    expectToBeCollection(): RecordDict<JsonValue> {
        return getStateValue(this, "Collection").expect('JSON value has not "Collection" type!')
    }

    expectToBeParsableNumber(base?: number): number {
        return this.asParsableNumber(base).expect("JSON value is not a parsable number!")
    }

    expectToBeSpecific<T>(decoder: JsonDecoder<T>): T {
        return this.decode(decoder).expect("JSON value could not be decoded using the provided decoder!")
    }

    getIndex(index: number): Option<JsonValue> {
        return this.asArray().andThen((list) => list.get(index))
    }

    get(child: string): Option<JsonValue> {
        return this.asCollection().andThen((col) => col.get(child))
    }

    getNull(child: string): Option<null> {
        return this.get(child).andThen((child) => getStateValue(child, "Null"))
    }

    getBoolean(child: string): Option<boolean> {
        return this.get(child).andThen((child) => getStateValue(child, "Boolean"))
    }

    getNumber(child: string): Option<number> {
        return this.get(child).andThen((child) => getStateValue(child, "Number"))
    }

    getString(child: string): Option<string> {
        return this.get(child).andThen((child) => getStateValue(child, "String"))
    }

    getArray(child: string): Option<List<JsonValue>> {
        return this.get(child).andThen((child) => getStateValue(child, "Array"))
    }

    getCollection(child: string): Option<RecordDict<JsonValue>> {
        return this.get(child).andThen((child) => getStateValue(child, "Collection"))
    }

    getSpecific<T>(child: string, decoder: JsonDecoder<T>): Option<Result<T, DecodingError>> {
        return this.get(child).map((child) => child.decode(decoder))
    }

    expect(child: string): JsonValue {
        return this.asCollection().expect("JSON value is not a collection").get(child).expect(`Child value ${child} was not found in collection`)
    }

    expectIndex(child: number): JsonValue {
        return this.asArray().expect("JSON value is not an array").get(child).expect(`Child value ${child} was not found in array`)
    }

    expectToBe<T extends JsonValuePrimitive>(value: T): T {
        if (this._getStateValue() === value) {
            return value
        } else {
            panic("JSON value is not equal to the provided value!")
        }
    }

    expectToBeOneOf<T extends JsonValuePrimitive>(values: Array<T>): T {
        const value = this._getStateValue()

        if (values.includes(value as any)) {
            return value as T
        } else {
            panic("JSON value is not equal to any of the provided values!")
        }
    }

    expectParsableNumber(child: string, base?: number): number {
        return this.expect(child).asParsableNumber(base).expect(`Child value "${child}" is not a parsable number"`)
    }

    expectNull(child: string): null {
        return getStateValue(this.expect(child), "Null").expect(`Child value "${child}" has not type "Null"`)
    }

    expectBoolean(child: string): boolean {
        return getStateValue(this.expect(child), "Boolean").expect(`Child value "${child}" has not type "Boolean"`)
    }

    expectNumber(child: string): number {
        return getStateValue(this.expect(child), "Number").expect(`Child value "${child}" has not type "Number"`)
    }

    expectString(child: string): string {
        return getStateValue(this.expect(child), "String").expect(`Child value "${child}" has not type "String"`)
    }

    expectArray(child: string): List<JsonValue> {
        return getStateValue(this.expect(child), "Array").expect(`Child value "${child}" has not type "Array"`)
    }

    expectCollection(child: string): RecordDict<JsonValue> {
        return getStateValue(this.expect(child), "Collection").expect(`Child value "${child}" has not type "Collection"`)
    }

    expectSpecific<T>(child: string, decoder: JsonDecoder<T>): T {
        return this.expect(child).expectToBeSpecific(decoder)
    }

    has(child: string): boolean {
        return this.get(child).isSome()
    }

    hasNull(child: string): boolean {
        return this.getNull(child).isSome()
    }

    hasBoolean(child: string): boolean {
        return this.getBoolean(child).isSome()
    }

    hasNumber(child: string): boolean {
        return this.getNumber(child).isSome()
    }

    hasString(child: string): boolean {
        return this.getString(child).isSome()
    }

    hasArray(child: string): boolean {
        return this.getArray(child).isSome()
    }

    hasCollection(child: string): boolean {
        return this.getCollection(child).isSome()
    }

    // NOTE: Add a warning telling using this function is discouraged as it runs the WHOLE decoder!
    hasDecodable<T>(child: string, decoder: JsonDecoder<T>): boolean {
        return this.getSpecific(child, decoder).isSome()
    }

    toNativeJsonValue(): NativeJsonValueType {
        return this.match<NativeJsonValueType>({
            Null: () => null,
            Boolean: (bool) => bool,
            Number: (num) => num,
            String: (str) => str,
            Array: (arr) => arr.toArray().map((val) => val.toNativeJsonValue()),
            Collection: (coll) => coll.mapToCollection((key, value) => [key, value.toNativeJsonValue()]),
        })
    }

    stringify(indent = 0): string {
        return JSON.stringify(this.toNativeJsonValue(), null, indent)
    }
}

export type JsonDecoder<T> = Decoder<JsonValue, T>

export namespace JsonDecoders {
    function _err(lines: DecodingErrorLine[]): DecodingError {
        return new DecodingError(state("CustomError", lines))
    }

    export function parse(value: string): Result<JsonValue, DecodingError> {
        return JsonValue.parse(value).mapErr((err) =>
            _err([
                ["s", "Failed to decode input JSON value:"],
                ["s", err.message],
            ])
        )
    }

    export const json: Decoder<unknown, JsonValue> = (json) =>
        json instanceof JsonValue ? Ok(json) : Err(_err([["s", "Value was expected to be a JSON value"]]))

    export const nil: JsonDecoder<null> = (json) => json.asNull().okOr(_err([["s", "JSON value was expected to be null"]]))
    export const boolean: JsonDecoder<boolean> = (json) => json.asBoolean().okOr(_err([["s", "JSON value was expected to be a boolean"]]))
    export const number: JsonDecoder<number> = (json) => json.asNumber().okOr(_err([["s", "JSON value was expected to be a number"]]))
    export const string: JsonDecoder<string> = (json) => json.asString().okOr(_err([["s", "JSON value was expected to be a string"]]))
    export const list: JsonDecoder<List<JsonValue>> = (json) => listOf((value) => Ok(value))(json)
    export const array: JsonDecoder<Array<JsonValue>> = (json) => arrayOf((value) => Ok(value))(json)
    export const record: JsonDecoder<RecordDict<JsonValue>> = (json) => recordOf((value) => Ok(value))(json)
    export const collection: JsonDecoder<Collection<JsonValue>> = (json) => collectionOf((value) => Ok(value))(json)

    export function listOf<T>(decoder: JsonDecoder<T>): JsonDecoder<List<T>> {
        return (value) =>
            value
                .asArray()
                .map((list) => list.resultable((value, i) => decoder(value).mapErr((err) => new DecodingError(state("ArrayItem", [i, err])))))
                .unwrapOr(Err(_err([["s", "JSON value was expected to be an array"]])))
    }

    export function arrayOf<T>(decoder: JsonDecoder<T>): JsonDecoder<Array<T>> {
        return (value) => listOf(decoder)(value).map((list) => list.toArray())
    }

    export function recordOf<T>(decoder: JsonDecoder<T>): JsonDecoder<RecordDict<T>> {
        return (value) =>
            value
                .asCollection()
                .map((coll) =>
                    coll.resultableValues((key, value) => decoder(value).mapErr((err) => new DecodingError(state("CollectionItem", [key, err]))))
                )
                .unwrapOr(Err(_err([["s", "JSON value was expected to be a collection"]])))
                .map((dict) => RecordDict.cast(dict))
    }

    export function collectionOf<T>(decoder: JsonDecoder<T>): JsonDecoder<Collection<T>> {
        return (value) => recordOf(decoder)(value).map((record) => record.toUnsafeCollection())
    }

    export function untypedTuple(decoders: Array<JsonDecoder<any>>): JsonDecoder<unknown> {
        return d.then(list, (list) => {
            let out = []
            let i = 0

            let arr = list.toArray()

            if (arr.length < decoders.length) {
                return Err(new DecodingError(state("MissingTupleEntry", decoders.length)))
            }

            for (const decoder of decoders) {
                let decoded = decoder(list.get(i++).unwrap())

                if (decoded.isErr()) {
                    return Err(new DecodingError(state("ArrayItem", [i - 1, decoded.unwrap()])))
                }

                out.push(decoded.unwrap())
            }

            return Ok(out)
        })
    }

    export function untypedMapped(mappings: Array<[string, JsonDecoder<any>]>): JsonDecoder<{ [key: string]: unknown }> {
        return d.then(record, (dict) => {
            let out: { [key: string]: unknown } = {}

            for (const [field, decoder] of mappings) {
                const value = dict.get(field)

                if (value.isNone()) {
                    return Err(new DecodingError(state("MissingCollectionField", field)))
                }

                let decoded = decoder(value.unwrap())

                if (decoded.isErr()) {
                    return Err(new DecodingError(state("CollectionItem", [field, decoded.unwrapErr()])))
                }

                out[field] = decoded.unwrap()
            }

            return Ok(out)
        })
    }

    export function optional<T>(decoder: JsonDecoder<T>): JsonDecoder<Option<T>> {
        return (value) => (value.isNull() ? Ok(None()) : decoder(value).map((value) => Some(value)))
    }

    export function maybe<T>(decoder: JsonDecoder<T>): JsonDecoder<T | undefined> {
        return (value) => (value.isNull() ? Ok(undefined) : decoder(value))
    }

    // prettier-ignore
    export function tuple1<A>(d:[JsonDecoder<A>]):JsonDecoder<[A]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple2<A,B>(d:[JsonDecoder<A>,JsonDecoder<B>]):JsonDecoder<[A,B]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple3<A,B,C>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>]):JsonDecoder<[A,B,C]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple4<A,B,C,D>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>]):JsonDecoder<[A,B,C,D]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple5<A,B,C,D,E>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>]):JsonDecoder<[A,B,C,D,E]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple6<A,B,C,D,E,F>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>]):JsonDecoder<[A,B,C,D,E,F]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple7<A,B,C,D,E,F,G>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>]):JsonDecoder<[A,B,C,D,E,F,G]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple8<A,B,C,D,E,F,G,H>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>]):JsonDecoder<[A,B,C,D,E,F,G,H]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple9<A,B,C,D,E,F,G,H,I>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>]):JsonDecoder<[A,B,C,D,E,F,G,H,I]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple10<A,B,C,D,E,F,G,H,I,J>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple11<A,B,C,D,E,F,G,H,I,J,K>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple12<A,B,C,D,E,F,G,H,I,J,K,L>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple13<A,B,C,D,E,F,G,H,I,J,K,L,M>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple14<A,B,C,D,E,F,G,H,I,J,K,L,M,N>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple15<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple16<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple17<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple18<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple19<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple20<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>,JsonDecoder<T>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple21<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>,JsonDecoder<T>,JsonDecoder<U>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple22<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>,JsonDecoder<T>,JsonDecoder<U>,JsonDecoder<V>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple23<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>,JsonDecoder<T>,JsonDecoder<U>,JsonDecoder<V>,JsonDecoder<W>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple24<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>,JsonDecoder<T>,JsonDecoder<U>,JsonDecoder<V>,JsonDecoder<W>,JsonDecoder<X>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple25<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>,JsonDecoder<T>,JsonDecoder<U>,JsonDecoder<V>,JsonDecoder<W>,JsonDecoder<X>,JsonDecoder<Y>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple26<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>,JsonDecoder<T>,JsonDecoder<U>,JsonDecoder<V>,JsonDecoder<W>,JsonDecoder<X>,JsonDecoder<Y>,JsonDecoder<Z>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple27<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>,JsonDecoder<T>,JsonDecoder<U>,JsonDecoder<V>,JsonDecoder<W>,JsonDecoder<X>,JsonDecoder<Y>,JsonDecoder<Z>,JsonDecoder<AA>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple28<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>,JsonDecoder<T>,JsonDecoder<U>,JsonDecoder<V>,JsonDecoder<W>,JsonDecoder<X>,JsonDecoder<Y>,JsonDecoder<Z>,JsonDecoder<AA>,JsonDecoder<AB>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple29<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>,JsonDecoder<T>,JsonDecoder<U>,JsonDecoder<V>,JsonDecoder<W>,JsonDecoder<X>,JsonDecoder<Y>,JsonDecoder<Z>,JsonDecoder<AA>,JsonDecoder<AB>,JsonDecoder<AC>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple30<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC,AD>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>,JsonDecoder<T>,JsonDecoder<U>,JsonDecoder<V>,JsonDecoder<W>,JsonDecoder<X>,JsonDecoder<Y>,JsonDecoder<Z>,JsonDecoder<AA>,JsonDecoder<AB>,JsonDecoder<AC>,JsonDecoder<AD>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC,AD]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple31<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC,AD,AE>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>,JsonDecoder<T>,JsonDecoder<U>,JsonDecoder<V>,JsonDecoder<W>,JsonDecoder<X>,JsonDecoder<Y>,JsonDecoder<Z>,JsonDecoder<AA>,JsonDecoder<AB>,JsonDecoder<AC>,JsonDecoder<AD>,JsonDecoder<AE>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC,AD,AE]>{return untypedTuple(d) as any;}
    // prettier-ignore
    export function tuple32<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC,AD,AE,AF>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>,JsonDecoder<T>,JsonDecoder<U>,JsonDecoder<V>,JsonDecoder<W>,JsonDecoder<X>,JsonDecoder<Y>,JsonDecoder<Z>,JsonDecoder<AA>,JsonDecoder<AB>,JsonDecoder<AC>,JsonDecoder<AD>,JsonDecoder<AE>,JsonDecoder<AF>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC,AD,AE,AF]>{return untypedTuple(d) as any;}

    type __K = string
    type __V<K extends string | number | symbol, V> = { [key in K]: V }

    // prettier-ignore
    export function mapped1<KA extends __K,VA>(d:[[KA,JsonDecoder<VA>]]):JsonDecoder<__V<KA,VA>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped2<KA extends __K,VA,KB extends __K,VB>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped3<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped4<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped5<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped6<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped7<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>],[KG,JsonDecoder<VG>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped8<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>],[KG,JsonDecoder<VG>],[KH,JsonDecoder<VH>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped9<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>],[KG,JsonDecoder<VG>],[KH,JsonDecoder<VH>],[KI,JsonDecoder<VI>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped10<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>],[KG,JsonDecoder<VG>],[KH,JsonDecoder<VH>],[KI,JsonDecoder<VI>],[KJ,JsonDecoder<VJ>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped11<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>],[KG,JsonDecoder<VG>],[KH,JsonDecoder<VH>],[KI,JsonDecoder<VI>],[KJ,JsonDecoder<VJ>],[KK,JsonDecoder<VK>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped12<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>],[KG,JsonDecoder<VG>],[KH,JsonDecoder<VH>],[KI,JsonDecoder<VI>],[KJ,JsonDecoder<VJ>],[KK,JsonDecoder<VK>],[KL,JsonDecoder<VL>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped13<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>],[KG,JsonDecoder<VG>],[KH,JsonDecoder<VH>],[KI,JsonDecoder<VI>],[KJ,JsonDecoder<VJ>],[KK,JsonDecoder<VK>],[KL,JsonDecoder<VL>],[KM,JsonDecoder<VM>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped14<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>],[KG,JsonDecoder<VG>],[KH,JsonDecoder<VH>],[KI,JsonDecoder<VI>],[KJ,JsonDecoder<VJ>],[KK,JsonDecoder<VK>],[KL,JsonDecoder<VL>],[KM,JsonDecoder<VM>],[KN,JsonDecoder<VN>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped15<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>],[KG,JsonDecoder<VG>],[KH,JsonDecoder<VH>],[KI,JsonDecoder<VI>],[KJ,JsonDecoder<VJ>],[KK,JsonDecoder<VK>],[KL,JsonDecoder<VL>],[KM,JsonDecoder<VM>],[KN,JsonDecoder<VN>],[KO,JsonDecoder<VO>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped16<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>],[KG,JsonDecoder<VG>],[KH,JsonDecoder<VH>],[KI,JsonDecoder<VI>],[KJ,JsonDecoder<VJ>],[KK,JsonDecoder<VK>],[KL,JsonDecoder<VL>],[KM,JsonDecoder<VM>],[KN,JsonDecoder<VN>],[KO,JsonDecoder<VO>],[KP,JsonDecoder<VP>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped17<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>],[KG,JsonDecoder<VG>],[KH,JsonDecoder<VH>],[KI,JsonDecoder<VI>],[KJ,JsonDecoder<VJ>],[KK,JsonDecoder<VK>],[KL,JsonDecoder<VL>],[KM,JsonDecoder<VM>],[KN,JsonDecoder<VN>],[KO,JsonDecoder<VO>],[KP,JsonDecoder<VP>],[KQ,JsonDecoder<VQ>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped18<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>],[KG,JsonDecoder<VG>],[KH,JsonDecoder<VH>],[KI,JsonDecoder<VI>],[KJ,JsonDecoder<VJ>],[KK,JsonDecoder<VK>],[KL,JsonDecoder<VL>],[KM,JsonDecoder<VM>],[KN,JsonDecoder<VN>],[KO,JsonDecoder<VO>],[KP,JsonDecoder<VP>],[KQ,JsonDecoder<VQ>],[KR,JsonDecoder<VR>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped19<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>],[KG,JsonDecoder<VG>],[KH,JsonDecoder<VH>],[KI,JsonDecoder<VI>],[KJ,JsonDecoder<VJ>],[KK,JsonDecoder<VK>],[KL,JsonDecoder<VL>],[KM,JsonDecoder<VM>],[KN,JsonDecoder<VN>],[KO,JsonDecoder<VO>],[KP,JsonDecoder<VP>],[KQ,JsonDecoder<VQ>],[KR,JsonDecoder<VR>],[KS,JsonDecoder<VS>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped20<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>],[KG,JsonDecoder<VG>],[KH,JsonDecoder<VH>],[KI,JsonDecoder<VI>],[KJ,JsonDecoder<VJ>],[KK,JsonDecoder<VK>],[KL,JsonDecoder<VL>],[KM,JsonDecoder<VM>],[KN,JsonDecoder<VN>],[KO,JsonDecoder<VO>],[KP,JsonDecoder<VP>],[KQ,JsonDecoder<VQ>],[KR,JsonDecoder<VR>],[KS,JsonDecoder<VS>],[KT,JsonDecoder<VT>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped21<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>],[KG,JsonDecoder<VG>],[KH,JsonDecoder<VH>],[KI,JsonDecoder<VI>],[KJ,JsonDecoder<VJ>],[KK,JsonDecoder<VK>],[KL,JsonDecoder<VL>],[KM,JsonDecoder<VM>],[KN,JsonDecoder<VN>],[KO,JsonDecoder<VO>],[KP,JsonDecoder<VP>],[KQ,JsonDecoder<VQ>],[KR,JsonDecoder<VR>],[KS,JsonDecoder<VS>],[KT,JsonDecoder<VT>],[KU,JsonDecoder<VU>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped22<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>],[KG,JsonDecoder<VG>],[KH,JsonDecoder<VH>],[KI,JsonDecoder<VI>],[KJ,JsonDecoder<VJ>],[KK,JsonDecoder<VK>],[KL,JsonDecoder<VL>],[KM,JsonDecoder<VM>],[KN,JsonDecoder<VN>],[KO,JsonDecoder<VO>],[KP,JsonDecoder<VP>],[KQ,JsonDecoder<VQ>],[KR,JsonDecoder<VR>],[KS,JsonDecoder<VS>],[KT,JsonDecoder<VT>],[KU,JsonDecoder<VU>],[KV,JsonDecoder<VV>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped23<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>],[KG,JsonDecoder<VG>],[KH,JsonDecoder<VH>],[KI,JsonDecoder<VI>],[KJ,JsonDecoder<VJ>],[KK,JsonDecoder<VK>],[KL,JsonDecoder<VL>],[KM,JsonDecoder<VM>],[KN,JsonDecoder<VN>],[KO,JsonDecoder<VO>],[KP,JsonDecoder<VP>],[KQ,JsonDecoder<VQ>],[KR,JsonDecoder<VR>],[KS,JsonDecoder<VS>],[KT,JsonDecoder<VT>],[KU,JsonDecoder<VU>],[KV,JsonDecoder<VV>],[KW,JsonDecoder<VW>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped24<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>],[KG,JsonDecoder<VG>],[KH,JsonDecoder<VH>],[KI,JsonDecoder<VI>],[KJ,JsonDecoder<VJ>],[KK,JsonDecoder<VK>],[KL,JsonDecoder<VL>],[KM,JsonDecoder<VM>],[KN,JsonDecoder<VN>],[KO,JsonDecoder<VO>],[KP,JsonDecoder<VP>],[KQ,JsonDecoder<VQ>],[KR,JsonDecoder<VR>],[KS,JsonDecoder<VS>],[KT,JsonDecoder<VT>],[KU,JsonDecoder<VU>],[KV,JsonDecoder<VV>],[KW,JsonDecoder<VW>],[KX,JsonDecoder<VX>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped25<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX,KY extends __K,VY>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>],[KG,JsonDecoder<VG>],[KH,JsonDecoder<VH>],[KI,JsonDecoder<VI>],[KJ,JsonDecoder<VJ>],[KK,JsonDecoder<VK>],[KL,JsonDecoder<VL>],[KM,JsonDecoder<VM>],[KN,JsonDecoder<VN>],[KO,JsonDecoder<VO>],[KP,JsonDecoder<VP>],[KQ,JsonDecoder<VQ>],[KR,JsonDecoder<VR>],[KS,JsonDecoder<VS>],[KT,JsonDecoder<VT>],[KU,JsonDecoder<VU>],[KV,JsonDecoder<VV>],[KW,JsonDecoder<VW>],[KX,JsonDecoder<VX>],[KY,JsonDecoder<VY>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>&__V<KY,VY>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped26<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX,KY extends __K,VY,KZ extends __K,VZ>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>],[KG,JsonDecoder<VG>],[KH,JsonDecoder<VH>],[KI,JsonDecoder<VI>],[KJ,JsonDecoder<VJ>],[KK,JsonDecoder<VK>],[KL,JsonDecoder<VL>],[KM,JsonDecoder<VM>],[KN,JsonDecoder<VN>],[KO,JsonDecoder<VO>],[KP,JsonDecoder<VP>],[KQ,JsonDecoder<VQ>],[KR,JsonDecoder<VR>],[KS,JsonDecoder<VS>],[KT,JsonDecoder<VT>],[KU,JsonDecoder<VU>],[KV,JsonDecoder<VV>],[KW,JsonDecoder<VW>],[KX,JsonDecoder<VX>],[KY,JsonDecoder<VY>],[KZ,JsonDecoder<VZ>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>&__V<KY,VY>&__V<KZ,VZ>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped27<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX,KY extends __K,VY,KZ extends __K,VZ,KAA extends __K,VAA>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>],[KG,JsonDecoder<VG>],[KH,JsonDecoder<VH>],[KI,JsonDecoder<VI>],[KJ,JsonDecoder<VJ>],[KK,JsonDecoder<VK>],[KL,JsonDecoder<VL>],[KM,JsonDecoder<VM>],[KN,JsonDecoder<VN>],[KO,JsonDecoder<VO>],[KP,JsonDecoder<VP>],[KQ,JsonDecoder<VQ>],[KR,JsonDecoder<VR>],[KS,JsonDecoder<VS>],[KT,JsonDecoder<VT>],[KU,JsonDecoder<VU>],[KV,JsonDecoder<VV>],[KW,JsonDecoder<VW>],[KX,JsonDecoder<VX>],[KY,JsonDecoder<VY>],[KZ,JsonDecoder<VZ>],[KAA,JsonDecoder<VAA>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>&__V<KY,VY>&__V<KZ,VZ>&__V<KAA,VAA>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped28<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX,KY extends __K,VY,KZ extends __K,VZ,KAA extends __K,VAA,KAB extends __K,VAB>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>],[KG,JsonDecoder<VG>],[KH,JsonDecoder<VH>],[KI,JsonDecoder<VI>],[KJ,JsonDecoder<VJ>],[KK,JsonDecoder<VK>],[KL,JsonDecoder<VL>],[KM,JsonDecoder<VM>],[KN,JsonDecoder<VN>],[KO,JsonDecoder<VO>],[KP,JsonDecoder<VP>],[KQ,JsonDecoder<VQ>],[KR,JsonDecoder<VR>],[KS,JsonDecoder<VS>],[KT,JsonDecoder<VT>],[KU,JsonDecoder<VU>],[KV,JsonDecoder<VV>],[KW,JsonDecoder<VW>],[KX,JsonDecoder<VX>],[KY,JsonDecoder<VY>],[KZ,JsonDecoder<VZ>],[KAA,JsonDecoder<VAA>],[KAB,JsonDecoder<VAB>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>&__V<KY,VY>&__V<KZ,VZ>&__V<KAA,VAA>&__V<KAB,VAB>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped29<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX,KY extends __K,VY,KZ extends __K,VZ,KAA extends __K,VAA,KAB extends __K,VAB,KAC extends __K,VAC>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>],[KG,JsonDecoder<VG>],[KH,JsonDecoder<VH>],[KI,JsonDecoder<VI>],[KJ,JsonDecoder<VJ>],[KK,JsonDecoder<VK>],[KL,JsonDecoder<VL>],[KM,JsonDecoder<VM>],[KN,JsonDecoder<VN>],[KO,JsonDecoder<VO>],[KP,JsonDecoder<VP>],[KQ,JsonDecoder<VQ>],[KR,JsonDecoder<VR>],[KS,JsonDecoder<VS>],[KT,JsonDecoder<VT>],[KU,JsonDecoder<VU>],[KV,JsonDecoder<VV>],[KW,JsonDecoder<VW>],[KX,JsonDecoder<VX>],[KY,JsonDecoder<VY>],[KZ,JsonDecoder<VZ>],[KAA,JsonDecoder<VAA>],[KAB,JsonDecoder<VAB>],[KAC,JsonDecoder<VAC>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>&__V<KY,VY>&__V<KZ,VZ>&__V<KAA,VAA>&__V<KAB,VAB>&__V<KAC,VAC>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped30<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX,KY extends __K,VY,KZ extends __K,VZ,KAA extends __K,VAA,KAB extends __K,VAB,KAC extends __K,VAC,KAD extends __K,VAD>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>],[KG,JsonDecoder<VG>],[KH,JsonDecoder<VH>],[KI,JsonDecoder<VI>],[KJ,JsonDecoder<VJ>],[KK,JsonDecoder<VK>],[KL,JsonDecoder<VL>],[KM,JsonDecoder<VM>],[KN,JsonDecoder<VN>],[KO,JsonDecoder<VO>],[KP,JsonDecoder<VP>],[KQ,JsonDecoder<VQ>],[KR,JsonDecoder<VR>],[KS,JsonDecoder<VS>],[KT,JsonDecoder<VT>],[KU,JsonDecoder<VU>],[KV,JsonDecoder<VV>],[KW,JsonDecoder<VW>],[KX,JsonDecoder<VX>],[KY,JsonDecoder<VY>],[KZ,JsonDecoder<VZ>],[KAA,JsonDecoder<VAA>],[KAB,JsonDecoder<VAB>],[KAC,JsonDecoder<VAC>],[KAD,JsonDecoder<VAD>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>&__V<KY,VY>&__V<KZ,VZ>&__V<KAA,VAA>&__V<KAB,VAB>&__V<KAC,VAC>&__V<KAD,VAD>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped31<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX,KY extends __K,VY,KZ extends __K,VZ,KAA extends __K,VAA,KAB extends __K,VAB,KAC extends __K,VAC,KAD extends __K,VAD,KAE extends __K,VAE>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>],[KG,JsonDecoder<VG>],[KH,JsonDecoder<VH>],[KI,JsonDecoder<VI>],[KJ,JsonDecoder<VJ>],[KK,JsonDecoder<VK>],[KL,JsonDecoder<VL>],[KM,JsonDecoder<VM>],[KN,JsonDecoder<VN>],[KO,JsonDecoder<VO>],[KP,JsonDecoder<VP>],[KQ,JsonDecoder<VQ>],[KR,JsonDecoder<VR>],[KS,JsonDecoder<VS>],[KT,JsonDecoder<VT>],[KU,JsonDecoder<VU>],[KV,JsonDecoder<VV>],[KW,JsonDecoder<VW>],[KX,JsonDecoder<VX>],[KY,JsonDecoder<VY>],[KZ,JsonDecoder<VZ>],[KAA,JsonDecoder<VAA>],[KAB,JsonDecoder<VAB>],[KAC,JsonDecoder<VAC>],[KAD,JsonDecoder<VAD>],[KAE,JsonDecoder<VAE>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>&__V<KY,VY>&__V<KZ,VZ>&__V<KAA,VAA>&__V<KAB,VAB>&__V<KAC,VAC>&__V<KAD,VAD>&__V<KAE,VAE>>{return untypedMapped(d) as any;}
    // prettier-ignore
    export function mapped32<KA extends __K,VA,KB extends __K,VB,KC extends __K,VC,KD extends __K,VD,KE extends __K,VE,KF extends __K,VF,KG extends __K,VG,KH extends __K,VH,KI extends __K,VI,KJ extends __K,VJ,KK extends __K,VK,KL extends __K,VL,KM extends __K,VM,KN extends __K,VN,KO extends __K,VO,KP extends __K,VP,KQ extends __K,VQ,KR extends __K,VR,KS extends __K,VS,KT extends __K,VT,KU extends __K,VU,KV extends __K,VV,KW extends __K,VW,KX extends __K,VX,KY extends __K,VY,KZ extends __K,VZ,KAA extends __K,VAA,KAB extends __K,VAB,KAC extends __K,VAC,KAD extends __K,VAD,KAE extends __K,VAE,KAF extends __K,VAF>(d:[[KA,JsonDecoder<VA>],[KB,JsonDecoder<VB>],[KC,JsonDecoder<VC>],[KD,JsonDecoder<VD>],[KE,JsonDecoder<VE>],[KF,JsonDecoder<VF>],[KG,JsonDecoder<VG>],[KH,JsonDecoder<VH>],[KI,JsonDecoder<VI>],[KJ,JsonDecoder<VJ>],[KK,JsonDecoder<VK>],[KL,JsonDecoder<VL>],[KM,JsonDecoder<VM>],[KN,JsonDecoder<VN>],[KO,JsonDecoder<VO>],[KP,JsonDecoder<VP>],[KQ,JsonDecoder<VQ>],[KR,JsonDecoder<VR>],[KS,JsonDecoder<VS>],[KT,JsonDecoder<VT>],[KU,JsonDecoder<VU>],[KV,JsonDecoder<VV>],[KW,JsonDecoder<VW>],[KX,JsonDecoder<VX>],[KY,JsonDecoder<VY>],[KZ,JsonDecoder<VZ>],[KAA,JsonDecoder<VAA>],[KAB,JsonDecoder<VAB>],[KAC,JsonDecoder<VAC>],[KAD,JsonDecoder<VAD>],[KAE,JsonDecoder<VAE>],[KAF,JsonDecoder<VAF>]]):JsonDecoder<__V<KA,VA>&__V<KB,VB>&__V<KC,VC>&__V<KD,VD>&__V<KE,VE>&__V<KF,VF>&__V<KG,VG>&__V<KH,VH>&__V<KI,VI>&__V<KJ,VJ>&__V<KK,VK>&__V<KL,VL>&__V<KM,VM>&__V<KN,VN>&__V<KO,VO>&__V<KP,VP>&__V<KQ,VQ>&__V<KR,VR>&__V<KS,VS>&__V<KT,VT>&__V<KU,VU>&__V<KV,VV>&__V<KW,VW>&__V<KX,VX>&__V<KY,VY>&__V<KZ,VZ>&__V<KAA,VAA>&__V<KAB,VAB>&__V<KAC,VAC>&__V<KAD,VAD>&__V<KAE,VAE>&__V<KAF,VAF>>{return untypedMapped(d) as any;}
}
