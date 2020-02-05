import {Result} from "./result";
import {hasState, Matchable, MatchableType, state, State} from "./match";
import {Collection, O} from "./objects";
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
                return state('Null', this.value);
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

    stringify(indent = 0): string {
        return JSON.stringify(this.value, null, indent);
    }
}
