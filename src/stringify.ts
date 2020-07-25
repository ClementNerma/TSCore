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
import { isOption } from './option'
import { Ref } from './ref'
import { isResult } from './result'
import { Task } from './task'

export type StringifyHighlighter = (type: "typename" | "prefix" | "collKey" | "collValue" | "text" | "unknown" | "punctuation", str: string) => string

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
    | { type: "collection"; typename: string; content: Array<{ key: RawStringifyable; value: RawStringifyable }> }
    | { type: "prefixed"; prefix: string; value?: RawStringifyable }
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
            type: "collection",
            typename: "List",
            content: value.toArray().map((item, i) => ({ key: _nested(i), value: _nested(item) })),
        }
    }

    if (O.isArray(value)) {
        return {
            type: "collection",
            typename: "Array",
            content: value.map((item, i) => ({ key: _nested(i), value: _nested(item) })),
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

    if (value instanceof Iter) {
        return { type: "wrapped", typename: "Iter", content: { type: "prefixed", prefix: "pointer", value: _nested(value.pointer) } }
    }

    if (value instanceof MaybeUninit) {
        return {
            type: "wrapped",
            typename: "MaybeUninit",
            content: value.match({
                Init: (value) => ({ type: "prefixed", prefix: "Init", content: _nested(value) }),
                Uninit: () => ({ type: "prefixed", prefix: "Uninit" }),
            }),
        }
    }

    if (value instanceof Ref) {
        return {
            type: "wrapped",
            typename: "Ref",
            content: value.match({
                Available: (value) => ({ type: "prefixed", prefix: "Available", content: _nested(value) }),
                Destroyed: () => ({ type: "prefixed", prefix: "Destroyed" }),
            }),
        }
    }

    if (value instanceof Future) {
        return {
            type: "wrapped",
            typename: "Future",
            content: value.match({
                Pending: () => ({ type: "prefixed", prefix: "Pending" }),
                Complete: (value) => ({ type: "prefixed", prefix: "Complete", content: _nested(value) }),
            }),
        }
    }

    if (value instanceof Task) {
        return {
            type: "wrapped",
            typename: "Task",
            content: value.match({
                Created: () => ({ type: "prefixed", prefix: "Created" }),
                Pending: () => ({ type: "prefixed", prefix: "Pending" }),
                RunningStep: () => ({ type: "prefixed", prefix: "RunningStep" }),
                Fulfilled: (value) => ({ type: "prefixed", prefix: "Fulfilled", value: _nested(value) }),
                Failed: (err) => ({ type: "prefixed", prefix: "Failed", value: _nested(err) }),
            }),
        }
    }

    if (value instanceof TaskCluster) {
        return {
            type: "wrapped",
            typename: "TaskCluster",
            content: value.match({
                Created: () => ({ type: "prefixed", prefix: "Created" }),
                Running: () => ({ type: "prefixed", prefix: "Running" }),
                Paused: () => ({ type: "prefixed", prefix: "Paused" }),
                Aborted: () => ({ type: "prefixed", prefix: "Aborted" }),
                Fulfilled: (value) => ({ type: "prefixed", prefix: "Fulfilled", value: _nested(value) }),
                Failed: (err) => ({ type: "prefixed", prefix: "Failed", value: _nested(err) }),
            }),
        }
    }

    if (value instanceof JsonValue) {
        return {
            type: "wrapped",
            typename: "JsonValue",
            content: _nested(value.inner()),
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
 * Returns `false` if the stringifyable is or contains a collection of more than 1 element
 * @param stri
 */
export function isStringifyableLinear(stri: RawStringifyable): boolean {
    switch (stri.type) {
        case "text":
            return true

        case "wrapped":
            return stri.content ? isStringifyableLinear(stri.content) : true

        case "collection":
            return (
                stri.content.length >= 1 &&
                stri.content.every(({ key, value }) => isStringifyableLinear(value) && (typeof key === "number" ? true : isStringifyableLinear(key)))
            )

        case "prefixed":
            return !stri.value || typeof stri.value === "string" ? true : isStringifyableLinear(stri.value)

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

        case "collection":
            return stri.content.length === 0

        case "prefixed":
            return false

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
                highlighters("prefix", stri.prefix) +
                (stri.value ? highlighters("punctuation", ":") + " " + stringifyRaw(stri.value, pretty, highlighters) : "")
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
