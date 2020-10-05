import { TaskCluster } from './cluster'
import { compare } from './comparison'
import { DecodingError } from './decode'
import { Dictionary, RecordDict } from './dictionary'
import { Either } from './either'
import { Future } from './future'
import { Iter } from './iter'
import { JsonValue } from './json'
import { List } from './list'
import { matchString } from './match'
import { MaybeUninit } from './maybeUinit'
import { O } from './objects'
import { None, Option, Some } from './option'
import { Ref } from './ref'
import { Regex } from './regex'
import { Result } from './result'
import { Task } from './task'

/**
 * Stringification options
 */
export interface StringifyOptions {
    /**
     * Highlight tokens during stringification (default: no highlighting)
     */
    highlighter?: (
        type:
            | "typename"
            | "prefix"
            | "listIndex"
            | "listValue"
            | "collKey"
            | "collValue"
            | "text"
            | "lineBreak"
            | "unknown"
            | "unknownWrapper"
            | "unknownTypename"
            | "punctuation"
            | "void"
            | "boolean"
            | "string"
            | "number"
            | "voidPrefixValue"
            | "errorMessage"
            | "errorStack"
            | "reference"
            | "referenceWrapper",
        str: string
    ) => string

    /**
     * Display numbers using a specific format (default: decimal)
     */
    numberFormat?: "b" | "d" | "o" | "x" | "X"

    /**
     * Display an 'Array' type before an array's content (default: false)
     */
    displayArrayTypeName?: boolean

    /**
     * Display a 'Collection' type before an array's content (default: false)
     */
    displayCollectionTypeName?: boolean

    /**
     * Display indexes in arrays (default: true)
     */
    arrayIndexes?: boolean

    /**
     * Sort collections' keys alphabetically (default: true)
     */
    sortCollectionKeys?: boolean

    /**
     * Sort record dictionaries' keys alphabetically (default: true)
     */
    sortRecordDictKeys?: boolean

    /**
     * Develop unknown values as objects (default: false)
     * Non-object unknown values won't be developed even if this option is turned on
     */
    developUnknownValues?: boolean

    /**
     * Pretty-print the value on multiple lines (default: determined depending on the value's structural size)
     */
    prettify?: boolean

    /**
     * Track references (default: true)
     * Disabling this option will increase performance but will make stringification crash with cyclic references
     */
    trackReferences?: boolean

    /**
     * Stringify unsupported types
     * @param value The value to stringify
     * @param references Referenced objects, array index is the object's reference ID
     * @param duplicateRefs Objects that are referenced at least two times in the current value
     * @returns A raw stringifyable object, or `null` if the extension doesn't know how to stringify this type
     */
    stringifyExt?: (value: unknown, references: unknown[], duplicateRefs: Set<number>) => RawStringifyableItem | null

    /**
     * How to stringify 'undefined' values (default: '<unknown>')
     */
    undefinedStr?: string

    /**
     * How to stringify 'null' values (default: '<null>')
     */
    nullStr?: string

    /**
     * Perform a full stringification even on primitive values (default: true)
     * When set to 'false', primitives values will just receive a '.toString()' call (except for 'null' and 'undefined')
     * The highlighter is also disabled
     */
    stringifyPrimitives?: boolean
}

/**
 * Stringify a value to a human-readable string
 * @param value
 * @param options
 */
export function stringify(value: unknown, options?: StringifyOptions): string {
    return stringifyRaw(makeStringifyable(value, options), options)
}

/**
 * Stringifyable format
 */
export interface RawStringifyable {
    rootItem: RawStringifyableItem
    duplicateRefs: Set<number>
}

/**
 * Stringifyable item
 */
export type RawStringifyableItem = { ref: null | number } & (
    | { type: "void"; value: null | undefined }
    | { type: "boolean"; value: boolean }
    | { type: "number"; value: number }
    | { type: "string"; value: string }
    | { type: "text"; text: string }
    | { type: "wrapped"; typename: string; content?: RawStringifyableItem }
    | { type: "list"; typename: false | string; content: Array<{ index: number; value: RawStringifyableItem }> }
    | { type: "collection"; typename: false | string; content: Array<{ key: RawStringifyableItem; value: RawStringifyableItem }>; nativeColor?: true }
    | { type: "error"; typename: string; message: string; stack: Option<string> }
    | { type: "prefixed"; typename: string; prefixed: Array<[string, Option<RawStringifyableItem>]> }
    | { type: "unknown"; typename: string | undefined }
    | { type: "unknownObj"; typename: string | undefined; content: Array<{ key: RawStringifyableItem; value: RawStringifyableItem }> }
    | { type: "reference"; id: number }
)

/**
 * Convert a value to a stringifyable format
 * @param value
 * @param numberFormat
 */
export function makeStringifyable(value: unknown, options?: StringifyOptions): RawStringifyable {
    function _nested(value: unknown): RawStringifyableItem {
        if (value === null) {
            return { ref: null, type: "void", value: null }
        }

        if (value === undefined) {
            return { ref: null, type: "void", value: undefined }
        }

        if (value === false || value === true) {
            return { ref: null, type: "boolean", value }
        }

        if (typeof value === "number") {
            return {
                ref: null,
                type: "number",
                value,
            }
        }

        if (typeof value === "string") {
            return { ref: null, type: "string", value }
        }

        if (options?.trackReferences !== false) {
            const index = refs.indexOf(value)

            if (index !== -1) {
                duplicateRefs.add(index)
                return { ref: null, type: "reference", id: index }
            }

            refs.push(value)
            ref++
        }

        if (value instanceof Symbol) {
            return {
                ref,
                type: "wrapped",
                typename: "Symbol",
                content: {
                    ref: null,
                    type: "string",
                    value: value.description ?? "",
                },
            }
        }

        if (Option.is(value)) {
            return value.match({
                Some: (value) => ({ ref, type: "wrapped", typename: "Some", content: _nested(value) }),
                None: () => ({ ref, type: "wrapped", typename: "None" }),
            })
        }

        if (Result.is(value)) {
            return value.match({
                Ok: (value) => ({ ref, type: "wrapped", typename: "Ok", content: _nested(value) }),
                Err: (err) => ({ ref, type: "wrapped", typename: "Err", content: _nested(err) }),
            })
        }

        if (value instanceof List) {
            return {
                ref,
                type: "list",
                typename: "List",
                content: value.toArray().map((item, index) => ({ index, value: _nested(item) })),
            }
        }

        if (value instanceof RecordDict) {
            return {
                ref,
                type: "collection",
                typename: "RecordDict",
                content:
                    options?.sortRecordDictKeys === false
                        ? value
                              .entries()
                              .collectArray()
                              .map(([key, value]) => ({ key: _nested(key), value: _nested(value) }))
                        : value
                              .entries()
                              .collect()
                              .sort(([a], [b]) => compare(a, b))
                              .map(([key, value]) => ({ key: _nested(key), value: _nested(value) }))
                              .toArray(),
            }
        }

        if (value instanceof Dictionary) {
            return {
                ref,
                type: "collection",
                typename: "Dictionary",
                content: value
                    .entries()
                    .collectArray()
                    .map(([key, value]) => ({ key: _nested(key), value: _nested(value) })),
            }
        }

        if (O.isArray(value)) {
            return {
                ref,
                type: "list",
                typename: false,
                content: value.map((item, index) => ({ index, value: _nested(item) })),
            }
        }

        if (O.isCollection(value)) {
            return {
                ref,
                type: "collection",
                typename: false,
                content:
                    options?.sortCollectionKeys === false
                        ? O.entries(value).map(([key, value]) => ({ key: _nested(key), value: _nested(value) }))
                        : O.entries(value)
                              .sort(([a], [b]) => compare(a, b))
                              .map(([key, value]) => ({ key: _nested(key), value: _nested(value) })),
                nativeColor: true,
            }
        }

        if (value instanceof JsonValue) {
            return {
                ref,
                type: "prefixed",
                typename: "JsonValue",
                prefixed: [["inner", Some(_nested(value.inner()))]],
            }
        }

        if (value instanceof Error) {
            return {
                ref: null,
                type: "error",
                typename: "Error",
                message: value.message,
                stack: Option.maybe(value.stack),
            }
        }

        if (value instanceof DecodingError) {
            return {
                ref,
                type: "error",
                typename: "DecodingError",
                message: value.render(),
                stack: None(),
            }
        }

        if (value instanceof Future) {
            return {
                ref,
                type: "prefixed",
                typename: "Future",
                prefixed: [
                    value.match({
                        Pending: () => ["Pending", None()],
                        Complete: (value) => ["Complete", Some(_nested(value))],
                    }),
                ],
            }
        }

        if (value instanceof RegExp) {
            return {
                ref: null,
                type: "wrapped",
                typename: "RegExp",
                content: { ref: null, type: "text", text: value.toString() },
            }
        }

        if (value instanceof Regex) {
            return {
                ref,
                type: "prefixed",
                typename: "Regex",
                prefixed: [
                    ["expression", Some(_nested(value.inner))],
                    ["names", Some(_nested(value.names))],
                ],
            }
        }

        if (value instanceof Function) {
            return {
                ref: null,
                type: "prefixed",
                typename: "Function",
                prefixed: [["name", Some(_nested(value.name))]],
            }
        }

        if (value instanceof Iter) {
            return { ref, type: "prefixed", typename: "Iter", prefixed: [["pointer", Some(_nested(value.pointer))]] }
        }

        if (value instanceof MaybeUninit) {
            return {
                ref,
                type: "prefixed",
                typename: "MaybeUninit",
                prefixed: [
                    value.match({
                        Init: (value) => ["Init", Some(_nested(value))],
                        Uninit: () => ["Uninit", None()],
                    }),
                ],
            }
        }

        if (value instanceof Either) {
            return value.match({
                Left: (value) => ({ ref, type: "wrapped", typename: "Left", content: _nested(value) }),
                Right: (right) => ({ ref, type: "wrapped", typename: "Err", content: _nested(right) }),
            })
        }

        if (value instanceof Ref) {
            return {
                ref,
                type: "prefixed",
                typename: "Ref",
                prefixed: [
                    value.match({
                        Available: (value) => ["Available", Some(_nested(value))],
                        Destroyed: () => ["Destroyed", None()],
                    }),
                ],
            }
        }

        if (value instanceof Set) {
            let index = 0
            return {
                ref,
                type: "list",
                typename: "Set",
                content: [...value.entries()].map(([value]) => ({ index: index++, value })),
            }
        }

        if (value instanceof Map) {
            return {
                ref,
                type: "collection",
                typename: "Map",
                content: [...value.entries()].map(([key, value]) => ({ key, value })),
            }
        }

        if (value instanceof Task) {
            return {
                ref,
                type: "prefixed",
                typename: "Task",
                prefixed: [
                    value.match({
                        Created: () => ["Created", None()],
                        Pending: () => ["Pending", None()],
                        RunningStep: () => ["RunningStep", None()],
                        Fulfilled: (value) => ["Fulfilled", Some(_nested(value))],
                        Failed: (err) => ["Failed", Some(_nested(err))],
                    }),
                ],
            }
        }

        if (value instanceof TaskCluster) {
            return {
                ref,
                type: "prefixed",
                typename: "TaskCluster",
                prefixed: [
                    value.match({
                        Created: () => ["Created", None()],
                        Running: () => ["Running", None()],
                        Paused: () => ["Paused", None()],
                        Aborted: () => ["Aborted", None()],
                        Fulfilled: (value) => ["Fulfilled", Some(_nested(value))],
                        Failed: (err) => ["Failed", Some(_nested(err))],
                    }),
                ],
            }
        }

        if (options?.developUnknownValues) {
            const entries = Result.fallible(() => O.entries(value as object))

            if (entries.isOk()) {
                return {
                    ref,
                    type: "unknownObj",
                    typename: (value as any)?.constructor?.name,
                    content:
                        options?.sortCollectionKeys === false
                            ? entries.data.map(([key, value]) => ({ key: _nested(key), value: _nested(value) }))
                            : entries.data.sort(([a], [b]) => compare(a, b)).map(([key, value]) => ({ key: _nested(key), value: _nested(value) })),
                }
            }
        }

        if (typeof (value as any).__tsCoreStringify === "function") {
            return (value as any).__tsCoreStringify()
        }

        return options?.stringifyExt?.(value, refs, duplicateRefs) ?? { ref, type: "unknown", typename: (value as any)?.constructor?.name }
    }

    const refs: unknown[] = []
    const duplicateRefs = new Set<number>()
    let ref = -1

    return { rootItem: _nested(value), duplicateRefs }
}

/**
 * Check if a stringifyable can be displayed in a single line
 * @param stri
 */
export function isStringifyableLinear(stri: RawStringifyableItem): boolean {
    switch (stri.type) {
        case "void":
        case "boolean":
        case "number":
        case "string":
            return true

        case "text":
            return !stri.text.includes("\n")

        case "wrapped":
            return stri.content ? isStringifyableLinear(stri.content) : true

        case "list":
            return stri.content.length >= 1 && stri.content.every(({ value }) => isStringifyableLinear(value))

        case "collection":
        case "unknownObj":
            return (
                stri.content.length >= 1 &&
                stri.content.every(({ key, value }) => isStringifyableLinear(value) && (typeof key === "number" ? true : isStringifyableLinear(key)))
            )

        case "error":
            return stri.stack.isNone()

        case "prefixed":
            return stri.prefixed.every(([prefix, value]) => value.map((value) => isStringifyableLinear(value)).unwrapOr(true))

        case "unknown":
            return true

        case "reference":
            return true
    }
}

/**
 * Check if a stringifyable is child-less so it can be displayed on a single line even in prettified mode
 * @param stri
 */
export function isStringifyableChildless(stri: RawStringifyableItem): boolean {
    switch (stri.type) {
        case "void":
        case "boolean":
        case "number":
        case "string":
            return true

        case "text":
            return !stri.text.includes("\n")

        case "wrapped":
            return stri.content ? isStringifyableChildless(stri.content) : true

        case "list":
            return stri.content.length === 0

        case "collection":
        case "unknownObj":
            return stri.content.length === 0

        case "error":
            return stri.stack.isNone()

        case "prefixed":
            return stri.prefixed.length <= 1

        case "unknown":
            return true

        case "reference":
            return true
    }
}

/**
 * Stringify a raw stringifyable value
 * @param raw
 * @param options
 */
export function stringifyRaw(raw: RawStringifyable, options?: StringifyOptions): string {
    function stringifyItem(item: RawStringifyableItem, options: StringifyOptions): string {
        if (!options?.stringifyPrimitives) {
            switch (item.type) {
                case "void":
                    return item.value === undefined ? "undefined" : "null"

                case "number":
                case "boolean":
                case "string":
                    return item.value.toString()
            }
        }

        const prettify = options?.prettify ?? !isStringifyableLinear(item)

        function _nested(item: RawStringifyableItem, addOptions?: Partial<StringifyOptions>): string {
            return stringifyItem(
                item,
                options.stringifyPrimitives
                    ? addOptions
                        ? { ...options, ...addOptions }
                        : options
                    : addOptions
                    ? { ...options, ...addOptions, stringifyPrimitives: true }
                    : { ...options, stringifyPrimitives: true }
            )
        }

        function _lines(str: string, prefixLength: number): string {
            return str.split(/\n/).join(prettify ? "\n  " + " ".repeat(prefixLength) : highlighter("lineBreak", "\\n"))
        }

        const refMarker =
            item.ref === null || !raw.duplicateRefs.has(item.ref)
                ? ""
                : highlighter("referenceWrapper", "<ref: ") + highlighter("reference", item.ref.toString()) + highlighter("referenceWrapper", ">")

        const spacedRefMarker = refMarker ? " " + refMarker + " " : ""

        switch (item.type) {
            case "void":
                return highlighter("void", item.value === undefined ? options?.undefinedStr ?? "<undefined>" : options?.nullStr ?? "<null>")

            case "boolean":
                return highlighter("boolean", item.value.toString())

            case "number":
                return highlighter(
                    "number",
                    matchString(options?.numberFormat || "d", {
                        b: () => "0b" + item.value.toString(2),
                        o: () => "0o" + item.value.toString(8),
                        d: () => item.value.toString(),
                        x: () => "0x" + item.value.toString(16).toLowerCase(),
                        X: () => "0x" + item.value.toString(16).toUpperCase(),
                    })
                )

            case "string":
                return highlighter("string", JSON.stringify(item.value))

            case "text":
                return highlighter("text", item.text)

            case "wrapped":
                return (
                    highlighter("typename", item.typename) +
                    spacedRefMarker +
                    highlighter("punctuation", "(") +
                    (item.content && !isStringifyableChildless(item) ? (prettify ? "\n  " : "") : "") +
                    (item.content ? _lines(_nested(item.content), 0) : "") +
                    (item.content && !isStringifyableChildless(item) ? (prettify ? "\n" : "") : "") +
                    highlighter("punctuation", ")")
                )

            case "list":
                const listTypename =
                    item.typename === false
                        ? options?.displayArrayTypeName
                            ? highlighter("typename", "Array")
                            : ""
                        : highlighter("typename", item.typename)

                return (
                    listTypename +
                    (listTypename ? " " : "") +
                    (refMarker ? refMarker + " " : "") +
                    highlighter("punctuation", "[") +
                    (item.content && !isStringifyableChildless(item) ? (prettify ? "\n  " : " ") : "") +
                    (item.content || [])
                        .map(
                            ({ index, value }) =>
                                (options?.arrayIndexes !== false
                                    ? highlighter("listIndex", index.toString()) + highlighter("punctuation", ":") + " "
                                    : "") + highlighter("listValue", _lines(_nested(value), 0))
                        )
                        .join(highlighter("punctuation", ",") + (prettify && !isStringifyableChildless(item) ? "\n  " : " ")) +
                    (item.content && !isStringifyableChildless(item) ? (prettify ? "\n" : " ") : "") +
                    highlighter("punctuation", "]")
                )

            case "collection":
            case "unknownObj":
                const collTypename =
                    item.type === "unknownObj"
                        ? highlighter("unknownTypename", item.typename ?? "unknown type")
                        : item.typename === false
                        ? options?.displayCollectionTypeName
                            ? highlighter("typename", "Collection")
                            : ""
                        : highlighter("typename", item.typename)

                return (
                    collTypename +
                    (collTypename ? " " : "") +
                    (refMarker ? refMarker + " " : "") +
                    highlighter("punctuation", "{") +
                    (item.content && !isStringifyableChildless(item) ? (prettify ? "\n  " : " ") : "") +
                    (item.content || [])
                        .map(
                            ({ key, value }) =>
                                highlighter(
                                    "collKey",
                                    _nested(key, {
                                        prettify: false,
                                        highlighter: undefined,
                                    })
                                ) +
                                highlighter("punctuation", ":") +
                                " " +
                                highlighter("collValue", _lines(_nested(value), 0))
                        )
                        .join(highlighter("punctuation", ",") + (prettify && !isStringifyableChildless(item) ? "\n  " : " ")) +
                    (item.content && !isStringifyableChildless(item) ? (prettify ? "\n" : " ") : "") +
                    highlighter("punctuation", "}")
                )

            case "error":
                return (
                    highlighter("typename", item.typename) +
                    spacedRefMarker +
                    highlighter("punctuation", "(") +
                    item.stack
                        .map(
                            (stack) =>
                                (prettify ? "\n  " : "") +
                                highlighter("prefix", "error: ") +
                                highlighter("errorMessage", _lines(item.message, 7)) +
                                (prettify ? (item.message.includes("\n") ? "\n" : "") + "\n  " : highlighter("punctuation", ",") + " ") +
                                highlighter("prefix", "stack: ") +
                                highlighter("errorStack", _lines(stack, 7)) +
                                (prettify ? "\n" : "") +
                                highlighter("punctuation", "}")
                        )
                        .unwrapOrElse(
                            () =>
                                highlighter("prefix", "error:") +
                                " " +
                                highlighter("errorMessage", _lines(item.message, 7)) +
                                highlighter("punctuation", ")")
                        )
                )

            case "prefixed":
                return (
                    highlighter("typename", item.typename) +
                    " " +
                    (refMarker ? refMarker + " " : "") +
                    highlighter("punctuation", "{") +
                    (!isStringifyableChildless(item) ? (prettify ? "\n  " : " ") : "") +
                    (item.prefixed || [])
                        .map(
                            ([prefix, value]) =>
                                highlighter("prefix", prefix) +
                                highlighter("punctuation", ":") +
                                " " +
                                value
                                    .map((value) => highlighter("collValue", _lines(_nested(value), 0)))
                                    .unwrapOrElse(() => highlighter("voidPrefixValue", "-"))
                        )
                        .join(highlighter("punctuation", ",") + (prettify && !isStringifyableChildless(item) ? "\n  " : " ")) +
                    (!isStringifyableChildless(item) ? (prettify ? "\n" : " ") : "") +
                    highlighter("punctuation", "}")
                )

            case "unknown":
                return (
                    highlighter("punctuation", "<") +
                    highlighter("unknownWrapper", "Instance of:") +
                    " " +
                    highlighter("unknown", item.typename ?? "unknown type") +
                    highlighter("punctuation", ">") +
                    spacedRefMarker
                )

            case "reference":
                return highlighter("referenceWrapper", "<*ref ") + highlighter("reference", item.id.toString()) + highlighter("referenceWrapper", ">")
        }
    }

    const highlighter = options?.highlighter ?? ((type, str) => str)

    return stringifyItem(raw.rootItem, options ?? {})
}

/**
 * Non-natively stringifyable type
 */
export interface TSCoreStringifyable {
    __tsCoreStringify(): RawStringifyable
}
