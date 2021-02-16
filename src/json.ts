/**
 * @file JSON parsing and decoding
 */

import { Decoder, Decoders as d, DecodingError, DecodingErrorLine } from "./decode"
import { Dictionary, RecordDict } from "./dictionary"
import { panic, unreachable } from "./env"
import { Iter } from "./iter"
import { List } from "./list"
import { AbstractMatchable, hasState, State, state } from "./match"
import { MaybeUninit } from "./maybeUinit"
import { Collection, O } from "./objects"
import { getStateValue, None, Option, Some } from "./option"
import { Err, Ok, Result } from "./result"

/**
 * Primitive JSON value
 */
export type JsonValuePrimitive = null | boolean | number | string

/**
 * Native JSON value
 */
export type NativeJsonValueType =
  | JsonValuePrimitive
  | Array<NativeJsonValueType>
  | { [key: string]: NativeJsonValueType }

/**
 * Typable JSON value
 */
export type JsonValueType =
  | JsonValuePrimitive
  | Array<JsonValueType>
  | List<JsonValueType>
  | { [key: string]: JsonValueType }
  | Dictionary<string, JsonValueType>
  | RecordDict<JsonValueType>

/**
 * State of a typed JSON value
 */
export type MatchableJsonValue =
  | State<"Null", null>
  | State<"Boolean", boolean>
  | State<"Number", number>
  | State<"String", string>
  | State<"Array", List<JsonValue>>
  | State<"Collection", RecordDict<JsonValue>>

/**
 * JSON encoding error
 */
export interface JsonEncodingError {
  /** Error message */
  error: string

  /** Value that cannot be encoded */
  faultyValue: unknown

  /** Data path to reach this value */
  path: string[]
}

/**
 * Typed JSON value
 */
export class JsonValue extends AbstractMatchable<MatchableJsonValue> {
  /** Internal value */
  private readonly _value: JsonValueType

  /**
   * Create a new JSON value from a convertable one
   */
  constructor(value: JsonValueType) {
    super(() => {
      if (this._value === null) {
        return state("Null", this._value)
      } else if (this._value === true || this._value === false) {
        return state("Boolean", this._value)
      } else if (this._value.constructor === Number) {
        return state("Number", this._value as number)
      } else if (this._value.constructor === String) {
        return state("String", this._value as string)
      } else if (this._value instanceof List) {
        return state(
          "Array",
          this._value.map((value) => new JsonValue(value))
        )
      } else if (this._value instanceof Dictionary) {
        return state(
          "Collection",
          RecordDict.cast(this._value.mapValues((value) => new JsonValue(value)))
        )
      } else if (O.isArray(this._value)) {
        return state(
          "Array",
          new List(this._value).map((value) => new JsonValue(value))
        )
      } else if (O.isCollection(this._value)) {
        const dict = RecordDict.fromCollection(this._value)
        return state("Collection", RecordDict.cast(dict.mapValues((value) => new JsonValue(value))))
      } else {
        unreachable()
      }
    })

    this._value = value
  }

  /**
   * Parse a string as JSON
   * @param source
   */
  static parse(source: string): Result<JsonValue, Error> {
    return Result.fallible(() => JSON.parse(source) as JsonValueType).map(
      (json) => new JsonValue(json)
    )
  }

  /**
   * Try to encode a value to JSON
   * Fails if the provided value contains a non-encodable JSON value
   * @param value
   */
  static tryEncode(
    value: unknown,
    path: string[] = []
  ): Result<NativeJsonValueType, JsonEncodingError> {
    const _err = (message: string, faultyValue: unknown) =>
      Err({ error: message, path, faultyValue })

    if (value === undefined) {
      return _err('Cannot encode "undefined" to JSON', undefined)
    }

    if (
      value === null ||
      value === false ||
      value === true ||
      typeof value === "number" ||
      typeof value === "string"
    ) {
      return Ok(value)
    }

    if (value instanceof List) {
      return value
        .resultable((value, i) =>
          JsonValue.tryEncode(value, path.concat([`Item n°${i + 1} of list`]))
        )
        .map((list) => list.toArray())
    }

    if (value instanceof Dictionary) {
      const out: Collection<NativeJsonValueType> = {}

      for (const [key, val] of value) {
        if (typeof key !== "string") return _err("Key from dictionary must be a string", key)

        const encodedVal = JsonValue.tryEncode(val, path.concat(["Collection key: " + key]))
        if (encodedVal.isErr()) return _err("Failed to encode key: " + encodedVal.err, key)

        out[key] = encodedVal.data
      }

      return Ok(out)
    }

    if (Option.is(value)) {
      return value.match<Result<NativeJsonValueType, JsonEncodingError>>({
        Some: (value) => JsonValue.tryEncode(value, path.concat(["Some() variant of Option<T>"])),
        None: () => Ok(null),
      })
    }

    if (Result.is(value)) {
      return value
        .mapErr((err) =>
          _err("Cannot encode Err() variants of Result<T, E> values", err).unwrapErr()
        )
        .andThen((value) =>
          JsonValue.tryEncode(value, path.concat(["Ok() variant of Result<T, E>"]))
        )
    }

    if (value instanceof Iter) {
      return value
        .collect()
        .resultable((value, i) =>
          JsonValue.tryEncode(value, path.concat([`Yield value n°${i + 1} from Iter<T>`]))
        )
        .map((list) => list.toArray())
    }

    if (value instanceof MaybeUninit) {
      return JsonValue.tryEncode(value.value(), path.concat(["MaybeUninit<T>"]))
    }

    if (O.isArray(value)) {
      return new List(value)
        .resultable((value, i) =>
          JsonValue.tryEncode(value, path.concat([`Item n°${i + 1} from array`]))
        )
        .map((list) => list.toArray())
    }

    if (O.isCollection(value)) {
      const out: Collection<NativeJsonValueType> = {}

      for (const [key, val] of O.entries(value)) {
        const encodedVal = JsonValue.tryEncode(val, path.concat(["Collection key: " + key]))
        if (encodedVal.isErr()) return _err("Failed to unwrap value of key :" + encodedVal.err, key)
        out[key] = encodedVal.data
      }

      return Ok(out)
    }

    return _err("Provided value is not a valid encodable JSON value", value)
  }

  /**
   * Try to stringify a value to JSON
   * Fails if the provided value contains a non-encodable JSON value
   * @param value
   * @param indent
   */
  static stringify(value: unknown, indent = 0): Result<string, JsonEncodingError> {
    return JsonValue.tryEncode(value).map((json) => JSON.stringify(json, null, indent))
  }

  /**
   * Get the inner value
   */
  inner(): JsonValueType {
    return this._value
  }

  /** Check if the value is null */
  isNull(): boolean {
    return hasState(this, "Null")
  }

  /** Check if the value is a boolean */
  isBoolean(): boolean {
    return hasState(this, "Boolean")
  }

  /** Check if the value is a number */
  isNumber(): boolean {
    return hasState(this, "Number")
  }

  /** Check if the value is a string */
  isString(): boolean {
    return hasState(this, "String")
  }

  /** Check if the value is an array */
  isArray(size?: number): boolean {
    if (size === undefined) {
      return hasState(this, "Array")
    } else {
      return getStateValue(this, "Array")
        .map((list) => list.length === size)
        .unwrapOr(false)
    }
  }

  /** Check if the value is a collection */
  isCollection(): boolean {
    return hasState(this, "Collection")
  }

  /** Get the value as a primitive value */
  as<T extends JsonValuePrimitive>(value: T): Option<T> {
    if (this._getStateValue() === value) {
      return Some(value)
    } else {
      return None()
    }
  }

  /** Get the value as a subset of a provided set of JSON primitives */
  asOneOf<T extends JsonValuePrimitive>(values: Array<T>): Option<T> {
    const value = this._getStateValue()

    if (values.includes(value as any)) {
      return Some(value as T)
    } else {
      return None()
    }
  }

  /** Get the value as null */
  asNull(): Option<null> {
    return getStateValue(this, "Null")
  }

  /** Get the value as a boolean */
  asBoolean(): Option<boolean> {
    return getStateValue(this, "Boolean")
  }

  /** Get the value as a number */
  asNumber(): Option<number> {
    return getStateValue(this, "Number")
  }

  /** Get the value as a string */
  asString(): Option<string> {
    return getStateValue(this, "String")
  }

  /** Get the value as a list */
  asList(size?: number): Option<List<JsonValue>> {
    return getStateValue(this, "Array").filter((list) => size === undefined || list.length === size)
  }

  /** Get the value as an array */
  asArray(size?: number): Option<Array<JsonValue>> {
    return this.asList(size).map((list) => list.toArray())
  }

  /** Get the value as a dictionary (record) */
  asDict(): Option<RecordDict<JsonValue>> {
    return getStateValue(this, "Collection")
  }

  /** Get the value as a collection */
  asCollection(): Option<Collection<JsonValue>> {
    return this.asDict().map((record) => record.toCollection())
  }

  /** Get the value as a parsed number */
  asParsedNumber(base = 10): Option<number> {
    return this.match({
      Number: (num) => Some(num),
      String: (str) => {
        let parsed = parseInt(str, base)
        return Number.isNaN(parsed) ? None() : Some(parsed)
      },
      _: (_) => None(),
    })
  }

  /** Decode the value using a JSON decoder */
  decode<T>(decoder: JsonDecoder<T>): Result<T, DecodingError> {
    return decoder(this)
  }

  /** Expect the value to be null (panics otherwise) */
  expectToBeNull(): null {
    return getStateValue(this, "Null").expect('JSON value has not "Null" type!')
  }

  /** Expect the value to be a boolean (panics otherwise) */
  expectToBeBoolean(): boolean {
    return getStateValue(this, "Boolean").expect('JSON value has not "Boolean" type!')
  }

  /** Expect the value to be a number (panics otherwise) */
  expectToBeNumber(): number {
    return getStateValue(this, "Number").expect('JSON value has not "Number" type!')
  }

  /** Expect the value to be a string (panics otherwise) */
  expectToBeString(): string {
    return getStateValue(this, "String").expect('JSON value has not "String" type!')
  }

  /** Expect the value to be an array (panics otherwise) */
  expectToBeArray(): List<JsonValue> {
    return getStateValue(this, "Array").expect('JSON value has not "Array" type!')
  }

  /** Expect the value to be a collection (panics otherwise) */
  expectToBeCollection(): RecordDict<JsonValue> {
    return getStateValue(this, "Collection").expect('JSON value has not "Collection" type!')
  }

  /** Expect the value to be a parsable number (panics otherwise) */
  expectToBeParsableNumber(base?: number): number {
    return this.asParsedNumber(base).expect("JSON value is not a parsable number!")
  }

  /** Expect the value to match a provided decoder (panics otherwise) */
  expectToBeSpecific<T>(decoder: JsonDecoder<T>): T {
    return this.decode(decoder).expect(
      "JSON value could not be decoded using the provided decoder!"
    )
  }

  /** Get an index from the value (requires it to be an array) */
  getIndex(index: number): Option<JsonValue> {
    return this.asList().andThen((list) => list.get(index))
  }

  /** Get an key from the value (requires it to be a collection) */
  get(child: string): Option<JsonValue> {
    return this.asDict().andThen((col) => col.get(child))
  }

  /** Get a 'null' child from the value (requires it to be a collection) */
  getNull(child: string): Option<null> {
    return this.get(child).andThen((child) => getStateValue(child, "Null"))
  }

  /** Get a 'boolean' child from the value (requires it to be a collection) */
  getBoolean(child: string): Option<boolean> {
    return this.get(child).andThen((child) => getStateValue(child, "Boolean"))
  }

  /** Get a 'number' child from the value (requires it to be a collection) */
  getNumber(child: string): Option<number> {
    return this.get(child).andThen((child) => getStateValue(child, "Number"))
  }

  /** Get a 'string' child from the value (requires it to be a collection) */
  getString(child: string): Option<string> {
    return this.get(child).andThen((child) => getStateValue(child, "String"))
  }

  /** Get an 'array' child as List from the value (requires it to be a collection) */
  getList(child: string): Option<List<JsonValue>> {
    return this.get(child).andThen((child) => getStateValue(child, "Array"))
  }

  /** Get an 'array child from the value (requires it to be a collection) */
  getArray(child: string): Option<Array<JsonValue>> {
    return this.getList(child).map((list) => list.toArray())
  }

  /** Get a 'collection' child as a Dictinoary from the value (requires it to be a collection) */
  getDict(child: string): Option<RecordDict<JsonValue>> {
    return this.get(child).andThen((child) => getStateValue(child, "Collection"))
  }

  /** Get a 'collection' child from the value (requires it to be a collection) */
  getCollection(child: string): Option<Collection<JsonValue>> {
    return this.getDict(child).map((record) => record.toCollection())
  }

  /** Get a child matching a custom decoder from the value (requires it to be a collection) */
  getSpecific<T>(child: string, decoder: JsonDecoder<T>): Option<Result<T, DecodingError>> {
    return this.get(child).map((child) => child.decode(decoder))
  }

  /** Expect an index to exist in the value (requires it to be a collection) */
  expectIndex(child: number): JsonValue {
    return this.asList()
      .expect("JSON value is not an array")
      .get(child)
      .expect(`Child value ${child} was not found in array`)
  }

  /** Expect a child to exist in the value (requires it to be a collection) */
  expect(child: string): JsonValue {
    return this.asDict()
      .expect("JSON value is not a collection")
      .get(child)
      .expect(`Child value ${child} was not found in collection`)
  }

  /**
   * Expect a child to exist in the value and to be the equal to the provided JSON primitive (requires the current value to be a collection)
   */
  expectToBe<T extends JsonValuePrimitive>(value: T): T {
    if (this._getStateValue() === value) {
      return value
    } else {
      panic("JSON value is not equal to the provided value!")
    }
  }

  /**
   * Expect a child to exist in the value and to be one of the provided JSON primitives (requires the current value to be a collection)
   * */
  expectToBeOneOf<T extends JsonValuePrimitive>(values: Array<T>): T {
    const value = this._getStateValue()

    if (values.includes(value as any)) {
      return value as T
    } else {
      panic("JSON value is not equal to any of the provided values!")
    }
  }

  /** Expect a child to exist in the value and to be a parsable number (requires the current value to be a collection) */
  expectParsableNumber(child: string, base?: number): number {
    return this.expect(child)
      .asParsedNumber(base)
      .expect(`Child value "${child}" is not a parsable number"`)
  }

  /** Expect a child to exist in the value and to be 'null' (requires the current value to be a collection) */
  expectNull(child: string): null {
    return getStateValue(this.expect(child), "Null").expect(
      `Child value "${child}" has not type "Null"`
    )
  }

  /** Expect a child to exist in the value and to be a boolean (requires the current value to be a collection) */
  expectBoolean(child: string): boolean {
    return getStateValue(this.expect(child), "Boolean").expect(
      `Child value "${child}" has not type "Boolean"`
    )
  }

  /** Expect a child to exist in the value and to be a number (requires the current value to be a collection) */
  expectNumber(child: string): number {
    return getStateValue(this.expect(child), "Number").expect(
      `Child value "${child}" has not type "Number"`
    )
  }

  /** Expect a child to exist in the value and to be a string (requires the current value to be a collection) */
  expectString(child: string): string {
    return getStateValue(this.expect(child), "String").expect(
      `Child value "${child}" has not type "String"`
    )
  }

  /** Expect a child to exist in the value and to be an array as a List (requires the current value to be a collection) */
  expectArray(child: string): List<JsonValue> {
    return getStateValue(this.expect(child), "Array").expect(
      `Child value "${child}" has not type "Array"`
    )
  }

  /** Expect a child to exist in the value and to be a collection as a RecordDict (requires the current value to be a collection) */
  expectCollection(child: string): RecordDict<JsonValue> {
    return getStateValue(this.expect(child), "Collection").expect(
      `Child value "${child}" has not type "Collection"`
    )
  }

  /** Expect a child to exist in the value and to match the provided decoder (requires the current value to be a collection) */
  expectSpecific<T>(child: string, decoder: JsonDecoder<T>): T {
    return this.expect(child).expectToBeSpecific(decoder)
  }

  /** Check if a child exists in the value (requires the current value to be a collection) */
  has(child: string): boolean {
    return this.get(child).isSome()
  }

  /** Check if a child exists in the value and if it is 'null' (requires the current value to be a collection) */
  hasNull(child: string): boolean {
    return this.getNull(child).isSome()
  }

  /** Check if a child exists in the value and if it is a boolean (requires the current value to be a collection) */
  hasBoolean(child: string): boolean {
    return this.getBoolean(child).isSome()
  }

  /** Check if a child exists in the value and if it is a number (requires the current value to be a collection) */
  hasNumber(child: string): boolean {
    return this.getNumber(child).isSome()
  }

  /** Check if a child exists in the value and if it is a string (requires the current value to be a collection) */
  hasString(child: string): boolean {
    return this.getString(child).isSome()
  }

  /** Check if a child exists in the value and if it is an array (requires the current value to be a collection) */
  hasArray(child: string): boolean {
    return this.getList(child).isSome()
  }

  /** Check if a child exists in the value and if it is a collection (requires the current value to be a collection) */
  hasCollection(child: string): boolean {
    return this.getDict(child).isSome()
  }

  /** Check if a child exists in the value and matches the provided decoder (requires the current value to be a collection) */
  hasDecodable<T>(child: string, decoder: JsonDecoder<T>): boolean {
    return this.getSpecific(child, decoder).isSome()
  }

  /** Convert the value to a native JSON value (usable with JSON.stringify() for instance) */
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

  /**
   * Stringify the value
   * @param indent If set to a positive value, will prettify the stringified output and use the current indentation
   */
  stringify(indent = 0): string {
    return JSON.stringify(this.toNativeJsonValue(), null, indent)
  }
}

/**
 * A JSON decoder, a decoder that decodes a typed JSON value to another type
 * @template T Target type
 */
export type JsonDecoder<T> = Decoder<JsonValue, T>

/**
 * Common JSON decoders
 */
export namespace JsonDecoders {
  /**
   * (Internal) Generate a decoding error
   */
  function _err(lines: DecodingErrorLine[]): DecodingError {
    return new DecodingError(state("CustomError", lines))
  }

  /** Parse a value to JSON */
  export function parse(value: string): Result<JsonValue, DecodingError> {
    return JsonValue.parse(value).mapErr((err) =>
      _err([
        ["s", "Failed to decode input JSON value:"],
        ["s", err.message],
      ])
    )
  }

  /** Expect a value to be a typed JSON value */
  export const json: Decoder<unknown, JsonValue> = (json) =>
    json instanceof JsonValue
      ? Ok(json)
      : Err(_err([["s", "Value was expected to be a JSON value"]]))

  /** Decode 'null' values */
  export const nil: JsonDecoder<null> = (json) =>
    json.asNull().okOr(_err([["s", "JSON value was expected to be null"]]))

  /** Decode booleans */
  export const boolean: JsonDecoder<boolean> = (json) =>
    json.asBoolean().okOr(_err([["s", "JSON value was expected to be a boolean"]]))

  /** Decode numbers */
  export const number: JsonDecoder<number> = (json) =>
    json.asNumber().okOr(_err([["s", "JSON value was expected to be a number"]]))

  /** Decode strings */
  export const string: JsonDecoder<string> = (json) =>
    json.asString().okOr(_err([["s", "JSON value was expected to be a string"]]))

  /** Decode arrays to lists */
  export const list: JsonDecoder<List<JsonValue>> = (json) => listOf((value) => Ok(value))(json)

  /** Decode arrays */
  export const array: JsonDecoder<Array<JsonValue>> = (json) => arrayOf((value) => Ok(value))(json)

  /** Decode collections to records */
  export const record: JsonDecoder<RecordDict<JsonValue>> = (json) =>
    recordOf((value) => Ok(value))(json)

  /** Decode collections */
  export const collection: JsonDecoder<Collection<JsonValue>> = (json) =>
    collectionOf((value) => Ok(value))(json)

  /** Decode arrays to lists with a custom decoder for values */
  export function listOf<T>(decoder: JsonDecoder<T>): JsonDecoder<List<T>> {
    return (value) =>
      value
        .asList()
        .map((list) =>
          list.resultable((value, i) =>
            decoder(value).mapErr((err) => new DecodingError(state("ArrayItem", [i, err])))
          )
        )
        .unwrapOr(Err(_err([["s", "JSON value was expected to be an array"]])))
  }

  /** Decode arrays with a custom decoder for values */
  export function arrayOf<T>(decoder: JsonDecoder<T>): JsonDecoder<Array<T>> {
    return (value) => listOf(decoder)(value).map((list) => list.toArray())
  }

  /** Decode collections to records with a custom decoder for values */
  export function recordOf<T>(decoder: JsonDecoder<T>): JsonDecoder<RecordDict<T>> {
    return (value) =>
      value
        .asDict()
        .map((coll) =>
          coll.resultableValues((key, value) =>
            decoder(value).mapErr((err) => new DecodingError(state("CollectionItem", [key, err])))
          )
        )
        .unwrapOr(Err(_err([["s", "JSON value was expected to be a collection"]])))
        .map((dict) => RecordDict.cast(dict))
  }

  /** Decode collections with a custom decoder for values */
  export function collectionOf<T>(decoder: JsonDecoder<T>): JsonDecoder<Collection<T>> {
    return (value) => recordOf(decoder)(value).map((record) => record.toCollection())
  }

  /** Decode arrays to untyped tuples using a decoder for each member of the tuple */
  export function untypedTuple(decoders: Array<JsonDecoder<any>>): JsonDecoder<unknown> {
    return d.then(list, (list) => {
      let out = []
      let i = 0

      if (list.length < decoders.length) {
        return Err(new DecodingError(state("MissingTupleEntry", decoders.length)))
      }

      for (const decoder of decoders) {
        let decoded = decoder(list.get(i++).unwrap())

        if (decoded.isErr()) {
          return Err(new DecodingError(state("ArrayItem", [i - 1, decoded.err])))
        }

        out.push(decoded.data)
      }

      return Ok(out)
    })
  }

  /** Decode a collection to an untyped collection using a decoder for each member of the structure */
  export function untypedMapped(
    mappings: Collection<JsonDecoder<any>>
  ): JsonDecoder<{ [key: string]: unknown }> {
    return d.then(record, (dict) => {
      const out: { [key: string]: unknown } = {}

      for (const [field, decoder] of O.entries(mappings)) {
        const value = dict.get(field)

        // HACK: Temporary fix until https://github.com/microsoft/TypeScript/issues/39733 gets fixed
        if (value.isNone()) {
          return Err(new DecodingError(state("MissingCollectionField", field)))
        }

        let decoded = decoder(value.data)

        if (decoded.isErr()) {
          return Err(new DecodingError(state("CollectionItem", [field, decoded.err])))
        }

        out[field] = decoded.data
      }

      return Ok(out)
    })
  }

  /** Decode a collection to a strongly-typed collection with a decoder for each member of the mapping */
  export function mapped<O extends object>(
    decoders: { [key in keyof O]: JsonDecoder<O[key]> }
  ): JsonDecoder<O> {
    return untypedMapped(decoders) as any
  }

  /** Decode an optional value to an Option<T> */
  export function maybe<T>(decoder: JsonDecoder<T>): JsonDecoder<Option<T>> {
    return (value) => (value.isNull() ? Ok(None()) : decoder(value).map((value) => Some(value)))
  }

  /** Decode an optional value */
  export function undefinable<T>(decoder: JsonDecoder<T>): JsonDecoder<T | undefined> {
    return (value) => (value.isNull() ? Ok(undefined) : decoder(value))
  }

  /* prettier-ignore */ export function tuple<A>(d:[JsonDecoder<A>]):JsonDecoder<[A]>;
  /* prettier-ignore */ export function tuple<A,B>(d:[JsonDecoder<A>,JsonDecoder<B>]):JsonDecoder<[A,B]>;
  /* prettier-ignore */ export function tuple<A,B,C>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>]):JsonDecoder<[A,B,C]>;
  /* prettier-ignore */ export function tuple<A,B,C,D>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>]):JsonDecoder<[A,B,C,D]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>]):JsonDecoder<[A,B,C,D,E]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>]):JsonDecoder<[A,B,C,D,E,F]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F,G>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>]):JsonDecoder<[A,B,C,D,E,F,G]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F,G,H>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>]):JsonDecoder<[A,B,C,D,E,F,G,H]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F,G,H,I>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>]):JsonDecoder<[A,B,C,D,E,F,G,H,I]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F,G,H,I,J>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F,G,H,I,J,K>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F,G,H,I,J,K,L>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F,G,H,I,J,K,L,M>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F,G,H,I,J,K,L,M,N>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>,JsonDecoder<T>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>,JsonDecoder<T>,JsonDecoder<U>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>,JsonDecoder<T>,JsonDecoder<U>,JsonDecoder<V>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>,JsonDecoder<T>,JsonDecoder<U>,JsonDecoder<V>,JsonDecoder<W>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>,JsonDecoder<T>,JsonDecoder<U>,JsonDecoder<V>,JsonDecoder<W>,JsonDecoder<X>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>,JsonDecoder<T>,JsonDecoder<U>,JsonDecoder<V>,JsonDecoder<W>,JsonDecoder<X>,JsonDecoder<Y>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>,JsonDecoder<T>,JsonDecoder<U>,JsonDecoder<V>,JsonDecoder<W>,JsonDecoder<X>,JsonDecoder<Y>,JsonDecoder<Z>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>,JsonDecoder<T>,JsonDecoder<U>,JsonDecoder<V>,JsonDecoder<W>,JsonDecoder<X>,JsonDecoder<Y>,JsonDecoder<Z>,JsonDecoder<AA>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>,JsonDecoder<T>,JsonDecoder<U>,JsonDecoder<V>,JsonDecoder<W>,JsonDecoder<X>,JsonDecoder<Y>,JsonDecoder<Z>,JsonDecoder<AA>,JsonDecoder<AB>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>,JsonDecoder<T>,JsonDecoder<U>,JsonDecoder<V>,JsonDecoder<W>,JsonDecoder<X>,JsonDecoder<Y>,JsonDecoder<Z>,JsonDecoder<AA>,JsonDecoder<AB>,JsonDecoder<AC>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC,AD>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>,JsonDecoder<T>,JsonDecoder<U>,JsonDecoder<V>,JsonDecoder<W>,JsonDecoder<X>,JsonDecoder<Y>,JsonDecoder<Z>,JsonDecoder<AA>,JsonDecoder<AB>,JsonDecoder<AC>,JsonDecoder<AD>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC,AD]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC,AD,AE>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>,JsonDecoder<T>,JsonDecoder<U>,JsonDecoder<V>,JsonDecoder<W>,JsonDecoder<X>,JsonDecoder<Y>,JsonDecoder<Z>,JsonDecoder<AA>,JsonDecoder<AB>,JsonDecoder<AC>,JsonDecoder<AD>,JsonDecoder<AE>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC,AD,AE]>;
  /* prettier-ignore */ export function tuple<A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC,AD,AE,AF>(d:[JsonDecoder<A>,JsonDecoder<B>,JsonDecoder<C>,JsonDecoder<D>,JsonDecoder<E>,JsonDecoder<F>,JsonDecoder<G>,JsonDecoder<H>,JsonDecoder<I>,JsonDecoder<J>,JsonDecoder<K>,JsonDecoder<L>,JsonDecoder<M>,JsonDecoder<N>,JsonDecoder<O>,JsonDecoder<P>,JsonDecoder<Q>,JsonDecoder<R>,JsonDecoder<S>,JsonDecoder<T>,JsonDecoder<U>,JsonDecoder<V>,JsonDecoder<W>,JsonDecoder<X>,JsonDecoder<Y>,JsonDecoder<Z>,JsonDecoder<AA>,JsonDecoder<AB>,JsonDecoder<AC>,JsonDecoder<AD>,JsonDecoder<AE>,JsonDecoder<AF>]):JsonDecoder<[A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,AA,AB,AC,AD,AE,AF]>;
  /* prettier-ignore */ export function tuple(d: Array<JsonDecoder<any>>): any {
        return untypedTuple(d) as any;
    }
}
