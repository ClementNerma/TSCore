import {Result, Ok, Err} from "./result";
import {hasState, MatchableType, state, State, Matchable} from "./match";
import {O} from "./objects";
import {None, Option, Some} from "./option";
import {List} from "./list";
import {Dictionary} from "./dictionary";
import {panic, unreachable} from "./panic";

export type JsonValuePrimitive =
    | null
    | boolean
    | number
    | string;

export type JsonValueType =
    | JsonValuePrimitive
    | Array<JsonValueType>
    | List<JsonValueType>
    | { [key: string]: JsonValueType }
    | Dictionary<string, JsonValueType>;

export type MatchableJsonValue =
    | State<'Null', null>
    | State<'Boolean', boolean>
    | State<'Number', number>
    | State<'String', string>
    | State<'Array', List<JsonValue>>
    | State<'Collection', Dictionary<string, JsonValue>>;

export class JsonValue extends MatchableType<MatchableJsonValue> {
    private readonly value: JsonValueType;

    constructor(value: JsonValueType) {
        super(() => {
            if (this.value === null) {
                // TODO: This cast should NOT be required
                return state('Null', this.value as null);
            } else if (this.value === true || this.value === false) {
                return state('Boolean', this.value);
            } else if (this.value.constructor === Number) {
                return state('Number', this.value as number);
            } else if (this.value.constructor === String) {
                return state('String', this.value as string);
            } else if (this.value instanceof List) {
                return state('Array', this.value.map(value => new JsonValue(value)));
            } else if (this.value instanceof Dictionary) {
                return state('Collection', this.value.mapValues(value => new JsonValue(value)));
            } else if (O.isArray(this.value)) {
                return state('Array', new List(this.value).map(value => new JsonValue(value)));
            } else if (O.isCollection(this.value)) {
                const dict = Dictionary.fromObject(this.value) as Dictionary<string, JsonValueType>;
                return state('Collection', dict.mapValues(value => new JsonValue(value)));
            } else {
                unreachable();
            }
        });

        this.value = value;
    }

    static parse(source: string): Result<JsonValue, Error> {
        return Result.fallible(() => JSON.parse(source) as JsonValueType).map(json => new JsonValue(json));
    }

    isNull(): boolean {
        return hasState(this,'Null');
    }

    isBoolean(): boolean {
        return hasState(this,'Boolean');
    }

    isNumber(): boolean {
        return hasState(this,'Number');
    }

    isString(): boolean {
        return hasState(this,'String');
    }

    isArray(size?: number): boolean {
        if (size === undefined) {
            return hasState(this,'Array');
        } else {
            return this.getStateValue('Array').map(list => list.length === size).unwrapOr(false);
        }
    }

    isCollection(): boolean {
        return hasState(this,'Collection');
    }

    as<T extends JsonValuePrimitive>(value: T): Option<T> {
        if (this._getStateValue() === value) {
            return Some(value);
        } else {
            return None();
        }
    }

    asOneOf<T extends JsonValuePrimitive>(values: Array<T>): Option<T> {
        const value = this._getStateValue();

        if (values.includes(value as any)) {
            return Some(value as T);
        } else {
            return None();
        }
    }

    asNull(): Option<null> {
        return this.getStateValue('Null');
    }

    asBoolean(): Option<boolean> {
        return this.getStateValue('Boolean');
    }

    asNumber(): Option<number> {
        return this.getStateValue('Number');
    }

    asString(): Option<string> {
        return this.getStateValue('String');
    }

    asArray(size?: number): Option<List<JsonValue>> {
        return this.getStateValue('Array').filter(list => size === undefined || list.length === size);
    }

    asCollection(): Option<Dictionary<string, JsonValue>> {
        return this.getStateValue('Collection');
    }

    asParsableNumber(base = 10): Option<number> {
        return this.match({
            Number: num => Some(num),
            String: str => {
                let parsed = parseInt(str, base);
                return Number.isNaN(parsed) ? None() : Some(parsed);
            },
            _: _ => None()
        });
    }

    decode<T>(decoder: JsonDecoder<T>): Result<T, JsonDecodingError> {
        return decoder(this);
    }

    expectToBeNull(): null {
        return this.getStateValue('Null').expect('JSON value has not "Null" type!');
    }

    expectToBeBoolean(): boolean {
        return this.getStateValue('Boolean').expect('JSON value has not "Boolean" type!');
    }

    expectToBeNumber(): number {
        return this.getStateValue('Number').expect('JSON value has not "Number" type!');
    }

    expectToBeString(): string {
        return this.getStateValue('String').expect('JSON value has not "String" type!');
    }

    expectToBeArray(): List<JsonValue> {
        return this.getStateValue('Array').expect('JSON value has not "Array" type!');
    }

    expectToBeCollection(): Dictionary<string, JsonValue> {
        return this.getStateValue('Collection').expect('JSON value has not "Collection" type!');
    }

    expectToBeParsableNumber(base?: number): number {
        return this.asParsableNumber(base).expect('JSON value is not a parsable number!');
    }

    expectToBeSpecific<T>(decoder: JsonDecoder<T>): T {
        return this.decode(decoder).expect('JSON value could not be decoded using the provided decoder!');
    }

    getIndex(index: number): Option<JsonValue> {
        return this.asArray().andThen(list => list.get(index));
    }

    get(child: string): Option<JsonValue> {
        return this.asCollection().andThen(col => col.get(child));
    }

    getNull(child: string): Option<null> {
        return this.get(child).andThen(child => child.getStateValue('Null'));
    }

    getBoolean(child: string): Option<boolean> {
        return this.get(child).andThen(child => child.getStateValue('Boolean'));
    }

    getNumber(child: string): Option<number> {
        return this.get(child).andThen(child => child.getStateValue('Number'));
    }

    getString(child: string): Option<string> {
        return this.get(child).andThen(child => child.getStateValue('String'));
    }

    getArray(child: string): Option<List<JsonValue>> {
        return this.get(child).andThen(child => child.getStateValue('Array'));
    }

    getCollection(child: string): Option<Dictionary<string, JsonValue>> {
        return this.get(child).andThen(child => child.getStateValue('Collection'));
    }

    getSpecific<T>(child: string, decoder: JsonDecoder<T>): Option<Result<T, JsonDecodingError>> {
        return this.get(child).map(child => child.decode(decoder));
    }

    expect(child: string): JsonValue {
        return this.asCollection()
            .expect("JSON value is not a collection")
            .get(child)
            .expect(`Child value ${child} was not found in collection`);
    }

    expectIndex(child: number): JsonValue {
        return this.asArray()
            .expect("JSON value is not an array")
            .get(child)
            .expect(`Child value ${child} was not found in array`);
    }

    expectToBe<T extends JsonValuePrimitive>(value: T): T {
        if (this._getStateValue() === value) {
            return value;
        } else {
            panic("JSON value is not equal to the provided value!");
        }
    }

    expectToBeOneOf<T extends JsonValuePrimitive>(values: Array<T>): T {
        const value = this._getStateValue();

        if (values.includes(value as any)) {
            return value as T;
        } else {
            panic("JSON value is not equal to any of the provided values!");
        }
    }

    expectParsableNumber(child: string, base?: number): number {
        return this.expect(child).asParsableNumber(base).expect(`Child value "${child}" is not a parsable number"`);
    }

    expectNull(child: string): null {
        return this.expect(child).getStateValue('Null').expect(`Child value "${child}" has not type "Null"`);
    }

    expectBoolean(child: string): boolean {
        return this.expect(child).getStateValue('Boolean').expect(`Child value "${child}" has not type "Boolean"`);
    }

    expectNumber(child: string): number {
        return this.expect(child).getStateValue('Number').expect(`Child value "${child}" has not type "Number"`);
    }

    expectString(child: string): string {
        return this.expect(child).getStateValue('String').expect(`Child value "${child}" has not type "String"`);
    }

    expectArray(child: string): List<JsonValue> {
        return this.expect(child).getStateValue('Array').expect(`Child value "${child}" has not type "Array"`);
    }

    expectCollection(child: string): Dictionary<string, JsonValue> {
        return this.expect(child).getStateValue('Collection').expect(`Child value "${child}" has not type "Collection"`);
    }

    expectSpecific<T>(child: string, decoder: JsonDecoder<T>): T {
        return this.expect(child).expectToBeSpecific(decoder);
    }

    has(child: string): boolean {
        return this.get(child).isSome();
    }

    hasNull(child: string): boolean {
        return this.getNull(child).isSome();
    }

    hasBoolean(child: string): boolean {
        return this.getBoolean(child).isSome();
    }

    hasNumber(child: string): boolean {
        return this.getNumber(child).isSome();
    }

    hasString(child: string): boolean {
        return this.getString(child).isSome();
    }

    hasArray(child: string): boolean {
        return this.getArray(child).isSome();
    }

    hasCollection(child: string): boolean {
        return this.getCollection(child).isSome();
    }

    // NOTE: Add a warning telling using this function is discouraged as it runs the WHOLE decoder!
    hasDecodable<T>(child: string, decoder: JsonDecoder<T>): boolean {
        return this.getSpecific(child, decoder).isSome();
    }

    stringify(indent = 0): string {
        return JSON.stringify(this.value, null, indent);
    }
}

type JsonDecoder<T> = (value: JsonValue) => Result<T, JsonDecodingError>;

export const jsonDecoders = {
    null: (value: JsonValue): Result<null, JsonDecodingError> => value.asNull().ok_or(new JsonDecodingError(state('NotNull'))),
    boolean: (value: JsonValue): Result<boolean, JsonDecodingError> => value.asBoolean().ok_or(new JsonDecodingError(state('NotBoolean'))),
    number: (value: JsonValue): Result<number, JsonDecodingError> => value.asNumber().ok_or(new JsonDecodingError(state('NotNumber'))),
    string: (value: JsonValue): Result<string, JsonDecodingError> => value.asString().ok_or(new JsonDecodingError(state('NotString'))),
    array: <T> (decoder: JsonDecoder<T>) => (value: JsonValue): Result<List<T>, JsonDecodingError> => {
        return value.asArray().map(list =>
            list.resultable((value, i) =>
                decoder(value)
                    .mapErr(err => new JsonDecodingError(state('ArrayChildDecodingError', [i, err])))
            )
        ).unwrapOr(Err(new JsonDecodingError(state('NotArray'))))
    },
    collection: <T>(decoder: JsonDecoder<T>) => (value: JsonValue): Result<Dictionary<string, T>, JsonDecodingError> => {
        return value.asCollection().map(coll =>
            coll.resultable((key, value) =>
                decoder(value)
                    .mapErr(err => new JsonDecodingError(state('CollectionChildDecodingError', [key, err])))
            )
        ).unwrapOr(Err(new JsonDecodingError(state('NotArray'))))
    },
    tuple1: <V1>(decoders: [JsonDecoder<V1>]) => (value: JsonValue): Result<[V1], JsonDecodingError> => _decodeTuple(decoders, value) as any,
    tuple2: <V1, V2>(decoders: [JsonDecoder<V1>, JsonDecoder<V2>]) => (value: JsonValue): Result<[V1, V2], JsonDecodingError> => _decodeTuple(decoders, value) as any,
    tuple3: <V1, V2, V3>(decoders: [JsonDecoder<V1>, JsonDecoder<V2>, JsonDecoder<V3>]) => (value: JsonValue): Result<[V1, V2, V3], JsonDecodingError> => _decodeTuple(decoders, value) as any,
    tuple4: <V1, V2, V3, V4>(decoders: [JsonDecoder<V1>, JsonDecoder<V2>, JsonDecoder<V3>, JsonDecoder<V4>]) => (value: JsonValue): Result<[V1, V2, V3, V4], JsonDecodingError> => _decodeTuple(decoders, value) as any,
    tuple5: <V1, V2, V3, V4, V5>(decoders: [JsonDecoder<V1>, JsonDecoder<V2>, JsonDecoder<V3>, JsonDecoder<V4>, JsonDecoder<V5>]) => (value: JsonValue): Result<[V1, V2, V3, V4, V5], JsonDecodingError> => _decodeTuple(decoders, value) as any,
    tuple6: <V1, V2, V3, V4, V5, V6>(decoders: [JsonDecoder<V1>, JsonDecoder<V2>, JsonDecoder<V3>, JsonDecoder<V4>, JsonDecoder<V5>, JsonDecoder<V6>]) => (value: JsonValue): Result<[V1, V2, V3, V4, V5, V6], JsonDecodingError> => _decodeTuple(decoders, value) as any,
    tuple7: <V1, V2, V3, V4, V5, V6, V7>(decoders: [JsonDecoder<V1>, JsonDecoder<V2>, JsonDecoder<V3>, JsonDecoder<V4>, JsonDecoder<V5>, JsonDecoder<V6>, JsonDecoder<V7>]) => (value: JsonValue): Result<[V1, V2, V3, V4, V5, V6, V7], JsonDecodingError> => _decodeTuple(decoders, value) as any,
    tuple8: <V1, V2, V3, V4, V5, V6, V7, V8>(decoders: [JsonDecoder<V1>, JsonDecoder<V2>, JsonDecoder<V3>, JsonDecoder<V4>, JsonDecoder<V5>, JsonDecoder<V6>, JsonDecoder<V7>, JsonDecoder<V8>]) => (value: JsonValue): Result<[V1, V2, V3, V4, V5, V6, V7, V8], JsonDecodingError> => _decodeTuple(decoders, value) as any,
    tuple9: <V1, V2, V3, V4, V5, V6, V7, V8, V9>(decoders: [JsonDecoder<V1>, JsonDecoder<V2>, JsonDecoder<V3>, JsonDecoder<V4>, JsonDecoder<V5>, JsonDecoder<V6>, JsonDecoder<V7>, JsonDecoder<V8>, JsonDecoder<V9>]) => (value: JsonValue): Result<[V1, V2, V3, V4, V5, V6, V7, V8, V9], JsonDecodingError> => _decodeTuple(decoders, value) as any,
    tuple10: <V1, V2, V3, V4, V5, V6, V7, V8, V9, V10>(decoders: [JsonDecoder<V1>, JsonDecoder<V2>, JsonDecoder<V3>, JsonDecoder<V4>, JsonDecoder<V5>, JsonDecoder<V6>, JsonDecoder<V7>, JsonDecoder<V8>, JsonDecoder<V9>, JsonDecoder<V10>]) => (value: JsonValue): Result<[V1, V2, V3, V4, V5, V6, V7, V8, V9, V10], JsonDecodingError> => _decodeTuple(decoders, value) as any,
    tuple11: <V1, V2, V3, V4, V5, V6, V7, V8, V9, V10, V11>(decoders: [JsonDecoder<V1>, JsonDecoder<V2>, JsonDecoder<V3>, JsonDecoder<V4>, JsonDecoder<V5>, JsonDecoder<V6>, JsonDecoder<V7>, JsonDecoder<V8>, JsonDecoder<V9>, JsonDecoder<V10>, JsonDecoder<V11>]) => (value: JsonValue): Result<[V1, V2, V3, V4, V5, V6, V7, V8, V9, V10, V11], JsonDecodingError> => _decodeTuple(decoders, value) as any,
    tuple12: <V1, V2, V3, V4, V5, V6, V7, V8, V9, V10, V11, V12>(decoders: [JsonDecoder<V1>, JsonDecoder<V2>, JsonDecoder<V3>, JsonDecoder<V4>, JsonDecoder<V5>, JsonDecoder<V6>, JsonDecoder<V7>, JsonDecoder<V8>, JsonDecoder<V9>, JsonDecoder<V10>, JsonDecoder<V11>, JsonDecoder<V12>]) => (value: JsonValue): Result<[V1, V2, V3, V4, V5, V6, V7, V8, V9, V10, V11, V12], JsonDecodingError> => _decodeTuple(decoders, value) as any,
    tuple13: <V1, V2, V3, V4, V5, V6, V7, V8, V9, V10, V11, V12, V13>(decoders: [JsonDecoder<V1>, JsonDecoder<V2>, JsonDecoder<V3>, JsonDecoder<V4>, JsonDecoder<V5>, JsonDecoder<V6>, JsonDecoder<V7>, JsonDecoder<V8>, JsonDecoder<V9>, JsonDecoder<V10>, JsonDecoder<V11>, JsonDecoder<V12>, JsonDecoder<V13>]) => (value: JsonValue): Result<[V1, V2, V3, V4, V5, V6, V7, V8, V9, V10, V11, V12, V13], JsonDecodingError> => _decodeTuple(decoders, value) as any,
    tuple14: <V1, V2, V3, V4, V5, V6, V7, V8, V9, V10, V11, V12, V13, V14>(decoders: [JsonDecoder<V1>, JsonDecoder<V2>, JsonDecoder<V3>, JsonDecoder<V4>, JsonDecoder<V5>, JsonDecoder<V6>, JsonDecoder<V7>, JsonDecoder<V8>, JsonDecoder<V9>, JsonDecoder<V10>, JsonDecoder<V11>, JsonDecoder<V12>, JsonDecoder<V13>, JsonDecoder<V14>]) => (value: JsonValue): Result<[V1, V2, V3, V4, V5, V6, V7, V8, V9, V10, V11, V12, V13, V14], JsonDecodingError> => _decodeTuple(decoders, value) as any,
    tuple15: <V1, V2, V3, V4, V5, V6, V7, V8, V9, V10, V11, V12, V13, V14, V15>(decoders: [JsonDecoder<V1>, JsonDecoder<V2>, JsonDecoder<V3>, JsonDecoder<V4>, JsonDecoder<V5>, JsonDecoder<V6>, JsonDecoder<V7>, JsonDecoder<V8>, JsonDecoder<V9>, JsonDecoder<V10>, JsonDecoder<V11>, JsonDecoder<V12>, JsonDecoder<V13>, JsonDecoder<V14>, JsonDecoder<V15>]) => (value: JsonValue): Result<[V1, V2, V3, V4, V5, V6, V7, V8, V9, V10, V11, V12, V13, V14, V15], JsonDecodingError> => _decodeTuple(decoders, value) as any,
    tuple16: <V1, V2, V3, V4, V5, V6, V7, V8, V9, V10, V11, V12, V13, V14, V15, V16>(decoders: [JsonDecoder<V1>, JsonDecoder<V2>, JsonDecoder<V3>, JsonDecoder<V4>, JsonDecoder<V5>, JsonDecoder<V6>, JsonDecoder<V7>, JsonDecoder<V8>, JsonDecoder<V9>, JsonDecoder<V10>, JsonDecoder<V11>, JsonDecoder<V12>, JsonDecoder<V13>, JsonDecoder<V14>, JsonDecoder<V15>, JsonDecoder<V16>]) => (value: JsonValue): Result<[V1, V2, V3, V4, V5, V6, V7, V8, V9, V10, V11, V12, V13, V14, V15, V16], JsonDecodingError> => _decodeTuple(decoders, value) as any,
    mapped1: <K1 extends string, V1>(m: [[K1, JsonDecoder<V1>]]) => (v: JsonValue): Result<{ [key in K1]: V1 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped2: <K1 extends string, V1, K2 extends string, V2>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped3: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped4: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped5: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped6: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped7: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6, K7 extends string, V7>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>], [K7, JsonDecoder<V7>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 } & { [key in K7]: V7 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped8: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6, K7 extends string, V7, K8 extends string, V8>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>], [K7, JsonDecoder<V7>], [K8, JsonDecoder<V8>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 } & { [key in K7]: V7 } & { [key in K8]: V8 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped9: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6, K7 extends string, V7, K8 extends string, V8, K9 extends string, V9>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>], [K7, JsonDecoder<V7>], [K8, JsonDecoder<V8>], [K9, JsonDecoder<V9>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 } & { [key in K7]: V7 } & { [key in K8]: V8 } & { [key in K9]: V9 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped10: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6, K7 extends string, V7, K8 extends string, V8, K9 extends string, V9, K10 extends string, V10>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>], [K7, JsonDecoder<V7>], [K8, JsonDecoder<V8>], [K9, JsonDecoder<V9>], [K10, JsonDecoder<V10>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 } & { [key in K7]: V7 } & { [key in K8]: V8 } & { [key in K9]: V9 } & { [key in K10]: V10 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped11: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6, K7 extends string, V7, K8 extends string, V8, K9 extends string, V9, K10 extends string, V10, K11 extends string, V11>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>], [K7, JsonDecoder<V7>], [K8, JsonDecoder<V8>], [K9, JsonDecoder<V9>], [K10, JsonDecoder<V10>], [K11, JsonDecoder<V11>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 } & { [key in K7]: V7 } & { [key in K8]: V8 } & { [key in K9]: V9 } & { [key in K10]: V10 } & { [key in K11]: V11 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped12: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6, K7 extends string, V7, K8 extends string, V8, K9 extends string, V9, K10 extends string, V10, K11 extends string, V11, K12 extends string, V12>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>], [K7, JsonDecoder<V7>], [K8, JsonDecoder<V8>], [K9, JsonDecoder<V9>], [K10, JsonDecoder<V10>], [K11, JsonDecoder<V11>], [K12, JsonDecoder<V12>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 } & { [key in K7]: V7 } & { [key in K8]: V8 } & { [key in K9]: V9 } & { [key in K10]: V10 } & { [key in K11]: V11 } & { [key in K12]: V12 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped13: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6, K7 extends string, V7, K8 extends string, V8, K9 extends string, V9, K10 extends string, V10, K11 extends string, V11, K12 extends string, V12, K13 extends string, V13>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>], [K7, JsonDecoder<V7>], [K8, JsonDecoder<V8>], [K9, JsonDecoder<V9>], [K10, JsonDecoder<V10>], [K11, JsonDecoder<V11>], [K12, JsonDecoder<V12>], [K13, JsonDecoder<V13>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 } & { [key in K7]: V7 } & { [key in K8]: V8 } & { [key in K9]: V9 } & { [key in K10]: V10 } & { [key in K11]: V11 } & { [key in K12]: V12 } & { [key in K13]: V13 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped14: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6, K7 extends string, V7, K8 extends string, V8, K9 extends string, V9, K10 extends string, V10, K11 extends string, V11, K12 extends string, V12, K13 extends string, V13, K14 extends string, V14>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>], [K7, JsonDecoder<V7>], [K8, JsonDecoder<V8>], [K9, JsonDecoder<V9>], [K10, JsonDecoder<V10>], [K11, JsonDecoder<V11>], [K12, JsonDecoder<V12>], [K13, JsonDecoder<V13>], [K14, JsonDecoder<V14>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 } & { [key in K7]: V7 } & { [key in K8]: V8 } & { [key in K9]: V9 } & { [key in K10]: V10 } & { [key in K11]: V11 } & { [key in K12]: V12 } & { [key in K13]: V13 } & { [key in K14]: V14 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped15: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6, K7 extends string, V7, K8 extends string, V8, K9 extends string, V9, K10 extends string, V10, K11 extends string, V11, K12 extends string, V12, K13 extends string, V13, K14 extends string, V14, K15 extends string, V15>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>], [K7, JsonDecoder<V7>], [K8, JsonDecoder<V8>], [K9, JsonDecoder<V9>], [K10, JsonDecoder<V10>], [K11, JsonDecoder<V11>], [K12, JsonDecoder<V12>], [K13, JsonDecoder<V13>], [K14, JsonDecoder<V14>], [K15, JsonDecoder<V15>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 } & { [key in K7]: V7 } & { [key in K8]: V8 } & { [key in K9]: V9 } & { [key in K10]: V10 } & { [key in K11]: V11 } & { [key in K12]: V12 } & { [key in K13]: V13 } & { [key in K14]: V14 } & { [key in K15]: V15 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped16: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6, K7 extends string, V7, K8 extends string, V8, K9 extends string, V9, K10 extends string, V10, K11 extends string, V11, K12 extends string, V12, K13 extends string, V13, K14 extends string, V14, K15 extends string, V15, K16 extends string, V16>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>], [K7, JsonDecoder<V7>], [K8, JsonDecoder<V8>], [K9, JsonDecoder<V9>], [K10, JsonDecoder<V10>], [K11, JsonDecoder<V11>], [K12, JsonDecoder<V12>], [K13, JsonDecoder<V13>], [K14, JsonDecoder<V14>], [K15, JsonDecoder<V15>], [K16, JsonDecoder<V16>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 } & { [key in K7]: V7 } & { [key in K8]: V8 } & { [key in K9]: V9 } & { [key in K10]: V10 } & { [key in K11]: V11 } & { [key in K12]: V12 } & { [key in K13]: V13 } & { [key in K14]: V14 } & { [key in K15]: V15 } & { [key in K16]: V16 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped17: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6, K7 extends string, V7, K8 extends string, V8, K9 extends string, V9, K10 extends string, V10, K11 extends string, V11, K12 extends string, V12, K13 extends string, V13, K14 extends string, V14, K15 extends string, V15, K16 extends string, V16, K17 extends string, V17>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>], [K7, JsonDecoder<V7>], [K8, JsonDecoder<V8>], [K9, JsonDecoder<V9>], [K10, JsonDecoder<V10>], [K11, JsonDecoder<V11>], [K12, JsonDecoder<V12>], [K13, JsonDecoder<V13>], [K14, JsonDecoder<V14>], [K15, JsonDecoder<V15>], [K16, JsonDecoder<V16>], [K17, JsonDecoder<V17>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 } & { [key in K7]: V7 } & { [key in K8]: V8 } & { [key in K9]: V9 } & { [key in K10]: V10 } & { [key in K11]: V11 } & { [key in K12]: V12 } & { [key in K13]: V13 } & { [key in K14]: V14 } & { [key in K15]: V15 } & { [key in K16]: V16 } & { [key in K17]: V17 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped18: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6, K7 extends string, V7, K8 extends string, V8, K9 extends string, V9, K10 extends string, V10, K11 extends string, V11, K12 extends string, V12, K13 extends string, V13, K14 extends string, V14, K15 extends string, V15, K16 extends string, V16, K17 extends string, V17, K18 extends string, V18>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>], [K7, JsonDecoder<V7>], [K8, JsonDecoder<V8>], [K9, JsonDecoder<V9>], [K10, JsonDecoder<V10>], [K11, JsonDecoder<V11>], [K12, JsonDecoder<V12>], [K13, JsonDecoder<V13>], [K14, JsonDecoder<V14>], [K15, JsonDecoder<V15>], [K16, JsonDecoder<V16>], [K17, JsonDecoder<V17>], [K18, JsonDecoder<V18>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 } & { [key in K7]: V7 } & { [key in K8]: V8 } & { [key in K9]: V9 } & { [key in K10]: V10 } & { [key in K11]: V11 } & { [key in K12]: V12 } & { [key in K13]: V13 } & { [key in K14]: V14 } & { [key in K15]: V15 } & { [key in K16]: V16 } & { [key in K17]: V17 } & { [key in K18]: V18 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped19: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6, K7 extends string, V7, K8 extends string, V8, K9 extends string, V9, K10 extends string, V10, K11 extends string, V11, K12 extends string, V12, K13 extends string, V13, K14 extends string, V14, K15 extends string, V15, K16 extends string, V16, K17 extends string, V17, K18 extends string, V18, K19 extends string, V19>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>], [K7, JsonDecoder<V7>], [K8, JsonDecoder<V8>], [K9, JsonDecoder<V9>], [K10, JsonDecoder<V10>], [K11, JsonDecoder<V11>], [K12, JsonDecoder<V12>], [K13, JsonDecoder<V13>], [K14, JsonDecoder<V14>], [K15, JsonDecoder<V15>], [K16, JsonDecoder<V16>], [K17, JsonDecoder<V17>], [K18, JsonDecoder<V18>], [K19, JsonDecoder<V19>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 } & { [key in K7]: V7 } & { [key in K8]: V8 } & { [key in K9]: V9 } & { [key in K10]: V10 } & { [key in K11]: V11 } & { [key in K12]: V12 } & { [key in K13]: V13 } & { [key in K14]: V14 } & { [key in K15]: V15 } & { [key in K16]: V16 } & { [key in K17]: V17 } & { [key in K18]: V18 } & { [key in K19]: V19 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped20: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6, K7 extends string, V7, K8 extends string, V8, K9 extends string, V9, K10 extends string, V10, K11 extends string, V11, K12 extends string, V12, K13 extends string, V13, K14 extends string, V14, K15 extends string, V15, K16 extends string, V16, K17 extends string, V17, K18 extends string, V18, K19 extends string, V19, K20 extends string, V20>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>], [K7, JsonDecoder<V7>], [K8, JsonDecoder<V8>], [K9, JsonDecoder<V9>], [K10, JsonDecoder<V10>], [K11, JsonDecoder<V11>], [K12, JsonDecoder<V12>], [K13, JsonDecoder<V13>], [K14, JsonDecoder<V14>], [K15, JsonDecoder<V15>], [K16, JsonDecoder<V16>], [K17, JsonDecoder<V17>], [K18, JsonDecoder<V18>], [K19, JsonDecoder<V19>], [K20, JsonDecoder<V20>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 } & { [key in K7]: V7 } & { [key in K8]: V8 } & { [key in K9]: V9 } & { [key in K10]: V10 } & { [key in K11]: V11 } & { [key in K12]: V12 } & { [key in K13]: V13 } & { [key in K14]: V14 } & { [key in K15]: V15 } & { [key in K16]: V16 } & { [key in K17]: V17 } & { [key in K18]: V18 } & { [key in K19]: V19 } & { [key in K20]: V20 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped21: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6, K7 extends string, V7, K8 extends string, V8, K9 extends string, V9, K10 extends string, V10, K11 extends string, V11, K12 extends string, V12, K13 extends string, V13, K14 extends string, V14, K15 extends string, V15, K16 extends string, V16, K17 extends string, V17, K18 extends string, V18, K19 extends string, V19, K20 extends string, V20, K21 extends string, V21>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>], [K7, JsonDecoder<V7>], [K8, JsonDecoder<V8>], [K9, JsonDecoder<V9>], [K10, JsonDecoder<V10>], [K11, JsonDecoder<V11>], [K12, JsonDecoder<V12>], [K13, JsonDecoder<V13>], [K14, JsonDecoder<V14>], [K15, JsonDecoder<V15>], [K16, JsonDecoder<V16>], [K17, JsonDecoder<V17>], [K18, JsonDecoder<V18>], [K19, JsonDecoder<V19>], [K20, JsonDecoder<V20>], [K21, JsonDecoder<V21>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 } & { [key in K7]: V7 } & { [key in K8]: V8 } & { [key in K9]: V9 } & { [key in K10]: V10 } & { [key in K11]: V11 } & { [key in K12]: V12 } & { [key in K13]: V13 } & { [key in K14]: V14 } & { [key in K15]: V15 } & { [key in K16]: V16 } & { [key in K17]: V17 } & { [key in K18]: V18 } & { [key in K19]: V19 } & { [key in K20]: V20 } & { [key in K21]: V21 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped22: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6, K7 extends string, V7, K8 extends string, V8, K9 extends string, V9, K10 extends string, V10, K11 extends string, V11, K12 extends string, V12, K13 extends string, V13, K14 extends string, V14, K15 extends string, V15, K16 extends string, V16, K17 extends string, V17, K18 extends string, V18, K19 extends string, V19, K20 extends string, V20, K21 extends string, V21, K22 extends string, V22>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>], [K7, JsonDecoder<V7>], [K8, JsonDecoder<V8>], [K9, JsonDecoder<V9>], [K10, JsonDecoder<V10>], [K11, JsonDecoder<V11>], [K12, JsonDecoder<V12>], [K13, JsonDecoder<V13>], [K14, JsonDecoder<V14>], [K15, JsonDecoder<V15>], [K16, JsonDecoder<V16>], [K17, JsonDecoder<V17>], [K18, JsonDecoder<V18>], [K19, JsonDecoder<V19>], [K20, JsonDecoder<V20>], [K21, JsonDecoder<V21>], [K22, JsonDecoder<V22>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 } & { [key in K7]: V7 } & { [key in K8]: V8 } & { [key in K9]: V9 } & { [key in K10]: V10 } & { [key in K11]: V11 } & { [key in K12]: V12 } & { [key in K13]: V13 } & { [key in K14]: V14 } & { [key in K15]: V15 } & { [key in K16]: V16 } & { [key in K17]: V17 } & { [key in K18]: V18 } & { [key in K19]: V19 } & { [key in K20]: V20 } & { [key in K21]: V21 } & { [key in K22]: V22 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped23: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6, K7 extends string, V7, K8 extends string, V8, K9 extends string, V9, K10 extends string, V10, K11 extends string, V11, K12 extends string, V12, K13 extends string, V13, K14 extends string, V14, K15 extends string, V15, K16 extends string, V16, K17 extends string, V17, K18 extends string, V18, K19 extends string, V19, K20 extends string, V20, K21 extends string, V21, K22 extends string, V22, K23 extends string, V23>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>], [K7, JsonDecoder<V7>], [K8, JsonDecoder<V8>], [K9, JsonDecoder<V9>], [K10, JsonDecoder<V10>], [K11, JsonDecoder<V11>], [K12, JsonDecoder<V12>], [K13, JsonDecoder<V13>], [K14, JsonDecoder<V14>], [K15, JsonDecoder<V15>], [K16, JsonDecoder<V16>], [K17, JsonDecoder<V17>], [K18, JsonDecoder<V18>], [K19, JsonDecoder<V19>], [K20, JsonDecoder<V20>], [K21, JsonDecoder<V21>], [K22, JsonDecoder<V22>], [K23, JsonDecoder<V23>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 } & { [key in K7]: V7 } & { [key in K8]: V8 } & { [key in K9]: V9 } & { [key in K10]: V10 } & { [key in K11]: V11 } & { [key in K12]: V12 } & { [key in K13]: V13 } & { [key in K14]: V14 } & { [key in K15]: V15 } & { [key in K16]: V16 } & { [key in K17]: V17 } & { [key in K18]: V18 } & { [key in K19]: V19 } & { [key in K20]: V20 } & { [key in K21]: V21 } & { [key in K22]: V22 } & { [key in K23]: V23 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped24: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6, K7 extends string, V7, K8 extends string, V8, K9 extends string, V9, K10 extends string, V10, K11 extends string, V11, K12 extends string, V12, K13 extends string, V13, K14 extends string, V14, K15 extends string, V15, K16 extends string, V16, K17 extends string, V17, K18 extends string, V18, K19 extends string, V19, K20 extends string, V20, K21 extends string, V21, K22 extends string, V22, K23 extends string, V23, K24 extends string, V24>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>], [K7, JsonDecoder<V7>], [K8, JsonDecoder<V8>], [K9, JsonDecoder<V9>], [K10, JsonDecoder<V10>], [K11, JsonDecoder<V11>], [K12, JsonDecoder<V12>], [K13, JsonDecoder<V13>], [K14, JsonDecoder<V14>], [K15, JsonDecoder<V15>], [K16, JsonDecoder<V16>], [K17, JsonDecoder<V17>], [K18, JsonDecoder<V18>], [K19, JsonDecoder<V19>], [K20, JsonDecoder<V20>], [K21, JsonDecoder<V21>], [K22, JsonDecoder<V22>], [K23, JsonDecoder<V23>], [K24, JsonDecoder<V24>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 } & { [key in K7]: V7 } & { [key in K8]: V8 } & { [key in K9]: V9 } & { [key in K10]: V10 } & { [key in K11]: V11 } & { [key in K12]: V12 } & { [key in K13]: V13 } & { [key in K14]: V14 } & { [key in K15]: V15 } & { [key in K16]: V16 } & { [key in K17]: V17 } & { [key in K18]: V18 } & { [key in K19]: V19 } & { [key in K20]: V20 } & { [key in K21]: V21 } & { [key in K22]: V22 } & { [key in K23]: V23 } & { [key in K24]: V24 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped25: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6, K7 extends string, V7, K8 extends string, V8, K9 extends string, V9, K10 extends string, V10, K11 extends string, V11, K12 extends string, V12, K13 extends string, V13, K14 extends string, V14, K15 extends string, V15, K16 extends string, V16, K17 extends string, V17, K18 extends string, V18, K19 extends string, V19, K20 extends string, V20, K21 extends string, V21, K22 extends string, V22, K23 extends string, V23, K24 extends string, V24, K25 extends string, V25>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>], [K7, JsonDecoder<V7>], [K8, JsonDecoder<V8>], [K9, JsonDecoder<V9>], [K10, JsonDecoder<V10>], [K11, JsonDecoder<V11>], [K12, JsonDecoder<V12>], [K13, JsonDecoder<V13>], [K14, JsonDecoder<V14>], [K15, JsonDecoder<V15>], [K16, JsonDecoder<V16>], [K17, JsonDecoder<V17>], [K18, JsonDecoder<V18>], [K19, JsonDecoder<V19>], [K20, JsonDecoder<V20>], [K21, JsonDecoder<V21>], [K22, JsonDecoder<V22>], [K23, JsonDecoder<V23>], [K24, JsonDecoder<V24>], [K25, JsonDecoder<V25>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 } & { [key in K7]: V7 } & { [key in K8]: V8 } & { [key in K9]: V9 } & { [key in K10]: V10 } & { [key in K11]: V11 } & { [key in K12]: V12 } & { [key in K13]: V13 } & { [key in K14]: V14 } & { [key in K15]: V15 } & { [key in K16]: V16 } & { [key in K17]: V17 } & { [key in K18]: V18 } & { [key in K19]: V19 } & { [key in K20]: V20 } & { [key in K21]: V21 } & { [key in K22]: V22 } & { [key in K23]: V23 } & { [key in K24]: V24 } & { [key in K25]: V25 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped26: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6, K7 extends string, V7, K8 extends string, V8, K9 extends string, V9, K10 extends string, V10, K11 extends string, V11, K12 extends string, V12, K13 extends string, V13, K14 extends string, V14, K15 extends string, V15, K16 extends string, V16, K17 extends string, V17, K18 extends string, V18, K19 extends string, V19, K20 extends string, V20, K21 extends string, V21, K22 extends string, V22, K23 extends string, V23, K24 extends string, V24, K25 extends string, V25, K26 extends string, V26>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>], [K7, JsonDecoder<V7>], [K8, JsonDecoder<V8>], [K9, JsonDecoder<V9>], [K10, JsonDecoder<V10>], [K11, JsonDecoder<V11>], [K12, JsonDecoder<V12>], [K13, JsonDecoder<V13>], [K14, JsonDecoder<V14>], [K15, JsonDecoder<V15>], [K16, JsonDecoder<V16>], [K17, JsonDecoder<V17>], [K18, JsonDecoder<V18>], [K19, JsonDecoder<V19>], [K20, JsonDecoder<V20>], [K21, JsonDecoder<V21>], [K22, JsonDecoder<V22>], [K23, JsonDecoder<V23>], [K24, JsonDecoder<V24>], [K25, JsonDecoder<V25>], [K26, JsonDecoder<V26>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 } & { [key in K7]: V7 } & { [key in K8]: V8 } & { [key in K9]: V9 } & { [key in K10]: V10 } & { [key in K11]: V11 } & { [key in K12]: V12 } & { [key in K13]: V13 } & { [key in K14]: V14 } & { [key in K15]: V15 } & { [key in K16]: V16 } & { [key in K17]: V17 } & { [key in K18]: V18 } & { [key in K19]: V19 } & { [key in K20]: V20 } & { [key in K21]: V21 } & { [key in K22]: V22 } & { [key in K23]: V23 } & { [key in K24]: V24 } & { [key in K25]: V25 } & { [key in K26]: V26 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped27: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6, K7 extends string, V7, K8 extends string, V8, K9 extends string, V9, K10 extends string, V10, K11 extends string, V11, K12 extends string, V12, K13 extends string, V13, K14 extends string, V14, K15 extends string, V15, K16 extends string, V16, K17 extends string, V17, K18 extends string, V18, K19 extends string, V19, K20 extends string, V20, K21 extends string, V21, K22 extends string, V22, K23 extends string, V23, K24 extends string, V24, K25 extends string, V25, K26 extends string, V26, K27 extends string, V27>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>], [K7, JsonDecoder<V7>], [K8, JsonDecoder<V8>], [K9, JsonDecoder<V9>], [K10, JsonDecoder<V10>], [K11, JsonDecoder<V11>], [K12, JsonDecoder<V12>], [K13, JsonDecoder<V13>], [K14, JsonDecoder<V14>], [K15, JsonDecoder<V15>], [K16, JsonDecoder<V16>], [K17, JsonDecoder<V17>], [K18, JsonDecoder<V18>], [K19, JsonDecoder<V19>], [K20, JsonDecoder<V20>], [K21, JsonDecoder<V21>], [K22, JsonDecoder<V22>], [K23, JsonDecoder<V23>], [K24, JsonDecoder<V24>], [K25, JsonDecoder<V25>], [K26, JsonDecoder<V26>], [K27, JsonDecoder<V27>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 } & { [key in K7]: V7 } & { [key in K8]: V8 } & { [key in K9]: V9 } & { [key in K10]: V10 } & { [key in K11]: V11 } & { [key in K12]: V12 } & { [key in K13]: V13 } & { [key in K14]: V14 } & { [key in K15]: V15 } & { [key in K16]: V16 } & { [key in K17]: V17 } & { [key in K18]: V18 } & { [key in K19]: V19 } & { [key in K20]: V20 } & { [key in K21]: V21 } & { [key in K22]: V22 } & { [key in K23]: V23 } & { [key in K24]: V24 } & { [key in K25]: V25 } & { [key in K26]: V26 } & { [key in K27]: V27 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped28: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6, K7 extends string, V7, K8 extends string, V8, K9 extends string, V9, K10 extends string, V10, K11 extends string, V11, K12 extends string, V12, K13 extends string, V13, K14 extends string, V14, K15 extends string, V15, K16 extends string, V16, K17 extends string, V17, K18 extends string, V18, K19 extends string, V19, K20 extends string, V20, K21 extends string, V21, K22 extends string, V22, K23 extends string, V23, K24 extends string, V24, K25 extends string, V25, K26 extends string, V26, K27 extends string, V27, K28 extends string, V28>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>], [K7, JsonDecoder<V7>], [K8, JsonDecoder<V8>], [K9, JsonDecoder<V9>], [K10, JsonDecoder<V10>], [K11, JsonDecoder<V11>], [K12, JsonDecoder<V12>], [K13, JsonDecoder<V13>], [K14, JsonDecoder<V14>], [K15, JsonDecoder<V15>], [K16, JsonDecoder<V16>], [K17, JsonDecoder<V17>], [K18, JsonDecoder<V18>], [K19, JsonDecoder<V19>], [K20, JsonDecoder<V20>], [K21, JsonDecoder<V21>], [K22, JsonDecoder<V22>], [K23, JsonDecoder<V23>], [K24, JsonDecoder<V24>], [K25, JsonDecoder<V25>], [K26, JsonDecoder<V26>], [K27, JsonDecoder<V27>], [K28, JsonDecoder<V28>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 } & { [key in K7]: V7 } & { [key in K8]: V8 } & { [key in K9]: V9 } & { [key in K10]: V10 } & { [key in K11]: V11 } & { [key in K12]: V12 } & { [key in K13]: V13 } & { [key in K14]: V14 } & { [key in K15]: V15 } & { [key in K16]: V16 } & { [key in K17]: V17 } & { [key in K18]: V18 } & { [key in K19]: V19 } & { [key in K20]: V20 } & { [key in K21]: V21 } & { [key in K22]: V22 } & { [key in K23]: V23 } & { [key in K24]: V24 } & { [key in K25]: V25 } & { [key in K26]: V26 } & { [key in K27]: V27 } & { [key in K28]: V28 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped29: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6, K7 extends string, V7, K8 extends string, V8, K9 extends string, V9, K10 extends string, V10, K11 extends string, V11, K12 extends string, V12, K13 extends string, V13, K14 extends string, V14, K15 extends string, V15, K16 extends string, V16, K17 extends string, V17, K18 extends string, V18, K19 extends string, V19, K20 extends string, V20, K21 extends string, V21, K22 extends string, V22, K23 extends string, V23, K24 extends string, V24, K25 extends string, V25, K26 extends string, V26, K27 extends string, V27, K28 extends string, V28, K29 extends string, V29>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>], [K7, JsonDecoder<V7>], [K8, JsonDecoder<V8>], [K9, JsonDecoder<V9>], [K10, JsonDecoder<V10>], [K11, JsonDecoder<V11>], [K12, JsonDecoder<V12>], [K13, JsonDecoder<V13>], [K14, JsonDecoder<V14>], [K15, JsonDecoder<V15>], [K16, JsonDecoder<V16>], [K17, JsonDecoder<V17>], [K18, JsonDecoder<V18>], [K19, JsonDecoder<V19>], [K20, JsonDecoder<V20>], [K21, JsonDecoder<V21>], [K22, JsonDecoder<V22>], [K23, JsonDecoder<V23>], [K24, JsonDecoder<V24>], [K25, JsonDecoder<V25>], [K26, JsonDecoder<V26>], [K27, JsonDecoder<V27>], [K28, JsonDecoder<V28>], [K29, JsonDecoder<V29>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 } & { [key in K7]: V7 } & { [key in K8]: V8 } & { [key in K9]: V9 } & { [key in K10]: V10 } & { [key in K11]: V11 } & { [key in K12]: V12 } & { [key in K13]: V13 } & { [key in K14]: V14 } & { [key in K15]: V15 } & { [key in K16]: V16 } & { [key in K17]: V17 } & { [key in K18]: V18 } & { [key in K19]: V19 } & { [key in K20]: V20 } & { [key in K21]: V21 } & { [key in K22]: V22 } & { [key in K23]: V23 } & { [key in K24]: V24 } & { [key in K25]: V25 } & { [key in K26]: V26 } & { [key in K27]: V27 } & { [key in K28]: V28 } & { [key in K29]: V29 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped30: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6, K7 extends string, V7, K8 extends string, V8, K9 extends string, V9, K10 extends string, V10, K11 extends string, V11, K12 extends string, V12, K13 extends string, V13, K14 extends string, V14, K15 extends string, V15, K16 extends string, V16, K17 extends string, V17, K18 extends string, V18, K19 extends string, V19, K20 extends string, V20, K21 extends string, V21, K22 extends string, V22, K23 extends string, V23, K24 extends string, V24, K25 extends string, V25, K26 extends string, V26, K27 extends string, V27, K28 extends string, V28, K29 extends string, V29, K30 extends string, V30>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>], [K7, JsonDecoder<V7>], [K8, JsonDecoder<V8>], [K9, JsonDecoder<V9>], [K10, JsonDecoder<V10>], [K11, JsonDecoder<V11>], [K12, JsonDecoder<V12>], [K13, JsonDecoder<V13>], [K14, JsonDecoder<V14>], [K15, JsonDecoder<V15>], [K16, JsonDecoder<V16>], [K17, JsonDecoder<V17>], [K18, JsonDecoder<V18>], [K19, JsonDecoder<V19>], [K20, JsonDecoder<V20>], [K21, JsonDecoder<V21>], [K22, JsonDecoder<V22>], [K23, JsonDecoder<V23>], [K24, JsonDecoder<V24>], [K25, JsonDecoder<V25>], [K26, JsonDecoder<V26>], [K27, JsonDecoder<V27>], [K28, JsonDecoder<V28>], [K29, JsonDecoder<V29>], [K30, JsonDecoder<V30>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 } & { [key in K7]: V7 } & { [key in K8]: V8 } & { [key in K9]: V9 } & { [key in K10]: V10 } & { [key in K11]: V11 } & { [key in K12]: V12 } & { [key in K13]: V13 } & { [key in K14]: V14 } & { [key in K15]: V15 } & { [key in K16]: V16 } & { [key in K17]: V17 } & { [key in K18]: V18 } & { [key in K19]: V19 } & { [key in K20]: V20 } & { [key in K21]: V21 } & { [key in K22]: V22 } & { [key in K23]: V23 } & { [key in K24]: V24 } & { [key in K25]: V25 } & { [key in K26]: V26 } & { [key in K27]: V27 } & { [key in K28]: V28 } & { [key in K29]: V29 } & { [key in K30]: V30 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped31: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6, K7 extends string, V7, K8 extends string, V8, K9 extends string, V9, K10 extends string, V10, K11 extends string, V11, K12 extends string, V12, K13 extends string, V13, K14 extends string, V14, K15 extends string, V15, K16 extends string, V16, K17 extends string, V17, K18 extends string, V18, K19 extends string, V19, K20 extends string, V20, K21 extends string, V21, K22 extends string, V22, K23 extends string, V23, K24 extends string, V24, K25 extends string, V25, K26 extends string, V26, K27 extends string, V27, K28 extends string, V28, K29 extends string, V29, K30 extends string, V30, K31 extends string, V31>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>], [K7, JsonDecoder<V7>], [K8, JsonDecoder<V8>], [K9, JsonDecoder<V9>], [K10, JsonDecoder<V10>], [K11, JsonDecoder<V11>], [K12, JsonDecoder<V12>], [K13, JsonDecoder<V13>], [K14, JsonDecoder<V14>], [K15, JsonDecoder<V15>], [K16, JsonDecoder<V16>], [K17, JsonDecoder<V17>], [K18, JsonDecoder<V18>], [K19, JsonDecoder<V19>], [K20, JsonDecoder<V20>], [K21, JsonDecoder<V21>], [K22, JsonDecoder<V22>], [K23, JsonDecoder<V23>], [K24, JsonDecoder<V24>], [K25, JsonDecoder<V25>], [K26, JsonDecoder<V26>], [K27, JsonDecoder<V27>], [K28, JsonDecoder<V28>], [K29, JsonDecoder<V29>], [K30, JsonDecoder<V30>], [K31, JsonDecoder<V31>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 } & { [key in K7]: V7 } & { [key in K8]: V8 } & { [key in K9]: V9 } & { [key in K10]: V10 } & { [key in K11]: V11 } & { [key in K12]: V12 } & { [key in K13]: V13 } & { [key in K14]: V14 } & { [key in K15]: V15 } & { [key in K16]: V16 } & { [key in K17]: V17 } & { [key in K18]: V18 } & { [key in K19]: V19 } & { [key in K20]: V20 } & { [key in K21]: V21 } & { [key in K22]: V22 } & { [key in K23]: V23 } & { [key in K24]: V24 } & { [key in K25]: V25 } & { [key in K26]: V26 } & { [key in K27]: V27 } & { [key in K28]: V28 } & { [key in K29]: V29 } & { [key in K30]: V30 } & { [key in K31]: V31 }, JsonDecodingError> => _decodeMapping(m, v) as any,
    mapped32: <K1 extends string, V1, K2 extends string, V2, K3 extends string, V3, K4 extends string, V4, K5 extends string, V5, K6 extends string, V6, K7 extends string, V7, K8 extends string, V8, K9 extends string, V9, K10 extends string, V10, K11 extends string, V11, K12 extends string, V12, K13 extends string, V13, K14 extends string, V14, K15 extends string, V15, K16 extends string, V16, K17 extends string, V17, K18 extends string, V18, K19 extends string, V19, K20 extends string, V20, K21 extends string, V21, K22 extends string, V22, K23 extends string, V23, K24 extends string, V24, K25 extends string, V25, K26 extends string, V26, K27 extends string, V27, K28 extends string, V28, K29 extends string, V29, K30 extends string, V30, K31 extends string, V31, K32 extends string, V32>(m: [[K1, JsonDecoder<V1>], [K2, JsonDecoder<V2>], [K3, JsonDecoder<V3>], [K4, JsonDecoder<V4>], [K5, JsonDecoder<V5>], [K6, JsonDecoder<V6>], [K7, JsonDecoder<V7>], [K8, JsonDecoder<V8>], [K9, JsonDecoder<V9>], [K10, JsonDecoder<V10>], [K11, JsonDecoder<V11>], [K12, JsonDecoder<V12>], [K13, JsonDecoder<V13>], [K14, JsonDecoder<V14>], [K15, JsonDecoder<V15>], [K16, JsonDecoder<V16>], [K17, JsonDecoder<V17>], [K18, JsonDecoder<V18>], [K19, JsonDecoder<V19>], [K20, JsonDecoder<V20>], [K21, JsonDecoder<V21>], [K22, JsonDecoder<V22>], [K23, JsonDecoder<V23>], [K24, JsonDecoder<V24>], [K25, JsonDecoder<V25>], [K26, JsonDecoder<V26>], [K27, JsonDecoder<V27>], [K28, JsonDecoder<V28>], [K29, JsonDecoder<V29>], [K30, JsonDecoder<V30>], [K31, JsonDecoder<V31>], [K32, JsonDecoder<V32>]]) => (v: JsonValue): Result<{ [key in K1]: V1 } & { [key in K2]: V2 } & { [key in K3]: V3 } & { [key in K4]: V4 } & { [key in K5]: V5 } & { [key in K6]: V6 } & { [key in K7]: V7 } & { [key in K8]: V8 } & { [key in K9]: V9 } & { [key in K10]: V10 } & { [key in K11]: V11 } & { [key in K12]: V12 } & { [key in K13]: V13 } & { [key in K14]: V14 } & { [key in K15]: V15 } & { [key in K16]: V16 } & { [key in K17]: V17 } & { [key in K18]: V18 } & { [key in K19]: V19 } & { [key in K20]: V20 } & { [key in K21]: V21 } & { [key in K22]: V22 } & { [key in K23]: V23 } & { [key in K24]: V24 } & { [key in K25]: V25 } & { [key in K26]: V26 } & { [key in K27]: V27 } & { [key in K28]: V28 } & { [key in K29]: V29 } & { [key in K30]: V30 } & { [key in K31]: V31 } & { [key in K32]: V32 }, JsonDecodingError> => _decodeMapping(m, v) as any,
};

export class JsonDecodingError extends Matchable<
    | State<"NotNull">
    | State<"NotBoolean">
    | State<"NotNumber">
    | State<"NotString">
    | State<"NotArray">
    | State<"NotCollection">
    | State<"MissingArrayEntry", number>
    | State<"MissingCollectionField", string>
    | State<"ArrayChildDecodingError", [number, JsonDecodingError]>
    | State<"CollectionChildDecodingError", [string, JsonDecodingError]>
> {
    unindentedLines(): string[] {
        return this.match({
            NotNull: () => [ "Value was expected to be null" ],
            NotBoolean: () => [ "Value was expected to be a boolean" ],
            NotNumber: () => [ "Value was expected to be a number" ],
            NotString: () => [ "Value was expected to be a string" ],
            NotArray: () => [ "Value was expected ot be an array" ],
            NotCollection: () => [ "Value was expected to be a collection" ],
            MissingArrayEntry: index => [ `Expected item n°${index + 1} in array was not found` ],
            MissingCollectionField: field => [ `Expected field "${field}" in collection was not found` ],
            ArrayChildDecodingError: err => [ `Failed to decode array item n°${err[0] + 1}` ].concat(err[1].unindentedLines()),
            CollectionChildDecodingError: err => [ `Failed to decode collection field "${err[0]}"` ].concat(err[1].unindentedLines())
        });
    }

    stringify(): string {
        let out = [];
        let i = 0;
        
        for (const line of this.unindentedLines()) {
            out.push('\t'.repeat(i ++) + line);
        }

        return out.join('\n');
    }
};

function _decodeTuple(decoders: JsonDecoder<any>[], value: JsonValue): Result<unknown, JsonDecodingError> {
    return value.asArray().map(list => {
        let out = [];
        let i = 0;

        let arr = list.toArray();

        if (arr.length < decoders.length) {
            return Err(new JsonDecodingError(state('MissingArrayEntry', decoders.length)));
        }

        for (const decoder of decoders) {
            let decoded = decoder(list.get(i ++).unwrap());

            if (decoded.isErr()) {
                return Err(new JsonDecodingError(state('ArrayChildDecodingError', [i - 1, decoded.unwrap()])));
            }

            out.push(decoded.unwrap());
        }

        return Ok(out);
    })
        .unwrapOr(Err(new JsonDecodingError(state('NotCollection'))));
}

function _decodeMapping(mappings: [string, JsonDecoder<any>][], value: JsonValue): Result<unknown, JsonDecodingError> {
    return value.asCollection().map(dict => {
        let out = {};

        for (const [field, decoder] of mappings) {
            const encoded = dict.get(field);

            if (encoded.isNone()) {
                return Err(new JsonDecodingError(state('MissingCollectionField', field)));
            }

            let decoded = decoder(encoded.unwrap());

            if (decoded.isErr()) {
                return Err(new JsonDecodingError(state('CollectionChildDecodingError', [field, decoded.unwrap()])));
            }

            out[field as any] = decoded.unwrap();
        }

        return Ok(out);
    })
        .unwrapOr(Err(new JsonDecodingError(state('NotCollection'))));
}
