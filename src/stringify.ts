import { TaskCluster } from './cluster'
import { Dictionary } from './dictionary'
import { Either } from './either'
import { Future } from './future'
import { Iter } from './iter'
import { JsonValue } from './json'
import { List } from './list'
import { matchString } from './match'
import { MaybeUninit } from './maybeUinit'
import { O } from './objects'
import { None, Option, Some, isOption } from './option'
import { Ref } from './ref'
import { Regex } from './regex'
import { isResult } from './result'
import { Task } from './task'

export type StringifyHighlighter = (
    type: "typename" | "prefix" | "listIndex" | "listValue" | "collKey" | "collValue" | "text" | "unknown" | "punctuation" | "voidPrefixValue",
    str: string
) => string

export type StringifyNumberFormat = "b" | "d" | "o" | "x" | "X"

/**
 * Stringify a value to a human-readable string
 * @param value
 */
export function stringify(value: unknown, prettify?: boolean, numberFormat?: StringifyNumberFormat, highlighter?: StringifyHighlighter): string {
    return stringifyRaw(makeStringifyable(value, numberFormat), prettify, highlighter)
}

/**
 * Stringifyable format
 */
export type RawStringifyable =
    | { type: "text"; text: string }
    | { type: "wrapped"; typename: string; content?: RawStringifyable }
    | { type: "list"; typename: string; content: Array<{ index: number; value: RawStringifyable }> }
    | { type: "collection"; typename: string; content: Array<{ key: RawStringifyable; value: RawStringifyable }> }
    | { type: "prefixed"; typename: string; prefixed: Array<[string, Option<RawStringifyable>]> }
    | { type: "unknown"; typename: string | undefined }

/**
 * Convert a value to a stringifyable format
 * @param value
 * @param numberFormat
 */
export function makeStringifyable(value: unknown, numberFormat: StringifyNumberFormat = "d"): RawStringifyable {
    const _nested = (value: unknown) => makeStringifyable(value, numberFormat)

    if (value === null) {
        return { type: "text", text: "<null>" }
    }

    if (value === undefined) {
        return { type: "text", text: "<undefined>" }
    }

    if (isOption(value)) {
        return value.match({
            Some: (value) => ({ type: "wrapped", typename: "Some", content: _nested(value) }),
            None: () => ({ type: "wrapped", typename: "None" }),
        })
    }

    if (isResult(value)) {
        return value.match({
            Ok: (value) => ({ type: "wrapped", typename: "Ok", content: _nested(value) }),
            Err: (err) => ({ type: "wrapped", typename: "Err", content: _nested(err) }),
        })
    }

    if (value instanceof Either) {
        return value.match({
            Left: (value) => ({ type: "wrapped", typename: "Left", content: _nested(value) }),
            Right: (right) => ({ type: "wrapped", typename: "Err", content: _nested(right) }),
        })
    }

    if (value instanceof List) {
        return {
            type: "list",
            typename: "List",
            content: value.toArray().map((item, index) => ({ index, value: _nested(item) })),
        }
    }

    if (O.isArray(value)) {
        return {
            type: "list",
            typename: "Array",
            content: value.map((item, index) => ({ index, value: _nested(item) })),
        }
    }

    if (value instanceof Dictionary) {
        return {
            type: "collection",
            typename: "Dictionary",
            content: value
                .entries()
                .collectArray()
                .map(([key, value]) => ({ key: _nested(key), value: _nested(value) })),
        }
    }

    if (value instanceof RegExp) {
        return {
            type: "wrapped",
            typename: "RegExp",
            content: { type: "text", text: value.toString() },
        }
    }

    if (value instanceof Regex) {
        return {
            type: "prefixed",
            typename: "Regex",
            prefixed: [
                ["expression", Some(_nested(value.inner))],
                ["names", Some(_nested(value.names))],
            ],
        }
    }

    if (value instanceof Iter) {
        return { type: "prefixed", typename: "Iter", prefixed: [["pointer", Some(_nested(value.pointer))]] }
    }

    if (value instanceof MaybeUninit) {
        return {
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

    if (value instanceof Ref) {
        return {
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

    if (value instanceof Future) {
        return {
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

    if (value instanceof Task) {
        return {
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

    if (value instanceof JsonValue) {
        return {
            type: "prefixed",
            typename: "JsonValue",
            prefixed: [["inner", Some(_nested(value.inner()))]],
        }
    }

    if (typeof value === "string") {
        return { type: "text", text: JSON.stringify(value) }
    }

    if (O.isCollection(value)) {
        return {
            type: "collection",
            typename: "Collection",
            content: O.entries(value).map(([key, value]) => ({ key: _nested(key), value: _nested(value) })),
        }
    }

    if (typeof value === "number") {
        return {
            type: "text",
            text: matchString(numberFormat, {
                b: () => "0b" + value.toString(2),
                o: () => "0o" + value.toString(8),
                d: () => value.toString(),
                x: () => "0x" + value.toString(16).toLowerCase(),
                X: () => "0x" + value.toString(16).toUpperCase(),
            }),
        }
    }

    if ((value as any).toString) {
        if (typeof (value as any).toString === "function") {
            const stringifed = (value as any).toString()

            if (typeof stringifed === "string") {
                // Avoid vertical overflow when displaying
                const lines = stringifed.split(/\r\n|\r|\n/)
                // Avoid horizontal overflow too
                return { type: "text", text: lines[0].length > 64 ? lines[0] + "..." : lines[0] }
            } else {
                return { type: "unknown", typename: (value as any).constructor?.name }
            }
        } else {
            return { type: "unknown", typename: (value as any).constructor?.name }
        }
    } else {
        return stringifyExt(value) ?? { type: "unknown", typename: (value as any).constructor?.name }
    }
}

/**
 * Check if a stringifyable can be displayed in a single line
 * Returns `false` if the stringifyable is or contains a list or a collection of more than 1 element
 * @param stri
 */
export function isStringifyableLinear(stri: RawStringifyable): boolean {
    switch (stri.type) {
        case "text":
            return true

        case "wrapped":
            return stri.content ? isStringifyableLinear(stri.content) : true

        case "list":
            return stri.content.length >= 1 && stri.content.every(({ value }) => isStringifyableLinear(value))

        case "collection":
            return (
                stri.content.length >= 1 &&
                stri.content.every(({ key, value }) => isStringifyableLinear(value) && (typeof key === "number" ? true : isStringifyableLinear(key)))
            )

        case "prefixed":
            return stri.prefixed.every(([prefix, value]) => value.map((value) => isStringifyableLinear(value)).unwrapOr(true))

        case "unknown":
            return true
    }
}

/**
 * Check if a stringifyable is child-less so it can be displayed on a single line even in prettified mode
 * @param stri
 */
export function isStringifyableChildless(stri: RawStringifyable): boolean {
    switch (stri.type) {
        case "text":
            return true

        case "wrapped":
            return stri.content ? isStringifyableChildless(stri.content) : true

        case "list":
            return stri.content.length === 0

        case "collection":
            return stri.content.length === 0

        case "prefixed":
            return stri.prefixed.length <= 1

        case "unknown":
            return true
    }
}

/**
 * Stringify a raw stringifyable value
 * @param stri
 * @param pretty
 * @param highlighters
 */
export function stringifyRaw(stri: RawStringifyable, pretty?: boolean, highlighters: StringifyHighlighter = (_, str) => str): string {
    // pretty ??= isStringifyableLinear(stri)
    pretty = pretty ?? !isStringifyableLinear(stri)

    switch (stri.type) {
        case "text":
            return highlighters("text", stri.text)

        case "wrapped":
            return (
                highlighters("typename", stri.typename) +
                highlighters("punctuation", "(") +
                (stri.content && !isStringifyableChildless(stri) ? (pretty ? "\n  " : "") : "") +
                (stri.content
                    ? stringifyRaw(stri.content, pretty, highlighters)
                          .split(/\n/)
                          .join("\n" + (pretty ? "  " : ""))
                    : "") +
                (stri.content && !isStringifyableChildless(stri) ? (pretty ? "\n" : "") : "") +
                highlighters("punctuation", ")")
            )

        case "list":
            return (
                highlighters("typename", stri.typename) +
                " " +
                highlighters("punctuation", "[") +
                (stri.content && !isStringifyableChildless(stri) ? (pretty ? "\n  " : " ") : "") +
                (stri.content || [])
                    .map(
                        ({ index, value }) =>
                            highlighters("listIndex", index.toString()) +
                            highlighters("punctuation", ":") +
                            " " +
                            highlighters(
                                "listValue",
                                stringifyRaw(value, pretty, highlighters)
                                    .split(/\n/)
                                    .join("\n" + (pretty ? "  " : ""))
                            )
                    )
                    .join(highlighters("punctuation", ",") + (pretty && !isStringifyableChildless(stri) ? "\n  " : " ")) +
                (stri.content && !isStringifyableChildless(stri) ? (pretty ? "\n" : " ") : "") +
                highlighters("punctuation", "]")
            )

        case "collection":
            return (
                highlighters("typename", stri.typename) +
                " " +
                highlighters("punctuation", "{") +
                (stri.content && !isStringifyableChildless(stri) ? (pretty ? "\n  " : " ") : "") +
                (stri.content || [])
                    .map(
                        ({ key, value }) =>
                            highlighters(
                                "collKey",
                                stringifyRaw(key, false)
                                    .split(/\n/)
                                    .join("\n" + (pretty ? "  " : ""))
                            ) +
                            highlighters("punctuation", ":") +
                            " " +
                            highlighters(
                                "collValue",
                                stringifyRaw(value, pretty, highlighters)
                                    .split(/\n/)
                                    .join("\n" + (pretty ? "  " : ""))
                            )
                    )
                    .join(highlighters("punctuation", ",") + (pretty && !isStringifyableChildless(stri) ? "\n  " : " ")) +
                (stri.content && !isStringifyableChildless(stri) ? (pretty ? "\n" : " ") : "") +
                highlighters("punctuation", "}")
            )

        case "prefixed":
            return (
                highlighters("typename", stri.typename) +
                " " +
                highlighters("punctuation", "{") +
                (!isStringifyableChildless(stri) ? (pretty ? "\n  " : " ") : "") +
                (stri.prefixed || [])
                    .map(
                        ([prefix, value]) =>
                            highlighters("prefix", prefix) +
                            highlighters("punctuation", ":") +
                            " " +
                            value
                                .map((value) =>
                                    highlighters(
                                        "collValue",
                                        stringifyRaw(value, pretty, highlighters)
                                            .split(/\n/)
                                            .join("\n" + (pretty ? "  " : ""))
                                    )
                                )
                                .unwrapOrElse(() => highlighters("voidPrefixValue", "-"))
                    )
                    .join(highlighters("punctuation", ",") + (pretty && !isStringifyableChildless(stri) ? "\n  " : " ")) +
                (!isStringifyableChildless(stri) ? (pretty ? "\n" : " ") : "") +
                highlighters("punctuation", "}")
            )

        case "unknown":
            return highlighters("unknown", `<${stri.typename ?? "unknown type"}>`)
    }
}

/**
 * Stringify additional values to a human-readable string
 * Called if the value could not be stringifed using .stringify()
 * @param value
 */
export let stringifyExt: (value: unknown) => RawStringifyable | null = (value) => {
    // Does nothing by default
    return null
}
