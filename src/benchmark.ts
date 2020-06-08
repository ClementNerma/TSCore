/**
 * @file Micro-benchmarking library
 */

import { Collection, O } from "./objects"
import { Enum, enumStr } from "./match"
import { Err, Ok, Result } from "./result"
import { List, StringBuffer } from "./list"

import { Dictionary } from "./dictionary"
import { Future } from "./future"

/**
 * Content of a comparative benchmark
 * Keys are names, and values are the functions to benchmark
 */
export type ComparativeBenchmarkContent = Collection<() => () => unknown>

/**
 * Result of a comparative benchmark
 */
export type ComparativeBenchmarkResult = Dictionary<string, Readonly<CBSingleResult>>

/**
 * Result of a single function in a comparative benchmark
 */
interface CBSingleResult {
    /** Average time for the function */
    average: Readonly<CBAverage>
    /** Performance relatively to other functions */
    relative: Dictionary<string, number>
}

/**
 * Average time of a single function in a comparative benchmark
 */
interface CBAverage {
    /** Seconds the function takes to perform */
    seconds: number
    /** Milliseconds the function takes to perform */
    milliseconds: number
    /** Microseconds the function takes to perform */
    microseconds: number
    /** Total running time */
    _total: number
}

/**
 * Make a comparative benchmark between multiple functions
 * @param content The functions to test
 * @param timeout Time allocated for each function
 * @param waitPromises Wait for promises to complete
 */
export function comparativeBenchmark(content: ComparativeBenchmarkContent, timeout = 5000, waitPromises = true): Future<ComparativeBenchmarkResult> {
    return new Future(async (resolve) => {
        const averages = new Dictionary<string, CBAverage>()

        for (const [name, getFunc] of O.entries(content)) {
            let time = -1,
                iter = 0

            const func = getFunc()

            let startedAt = Date.now()

            while (Date.now() - startedAt < timeout) {
                waitPromises ? await func() : func()
                iter++
            }

            time = Date.now() - startedAt

            averages.set(name as string, {
                seconds: time / iter / 1000,
                milliseconds: time / iter,
                microseconds: (time * 1000) / iter,
                _total: time,
            })
        }

        resolve(
            averages.mapValues((average) => ({
                average,
                relative: averages.mapValues((otherAverage) => otherAverage.milliseconds / average.milliseconds),
            }))
        )
    })
}

/**
 * Convert the result of a comparative benchmark into a displayable table
 * @param results
 * @param numFormatter Numbers formatter
 * @param percentage Use percentages instead of multipliers
 */
export function tableFromComparativeResults(
    results: ComparativeBenchmarkResult,
    numFormatter = (num: number) => num.toFixed(2),
    percentage = false
): Result<string, Enum<"EmptyTable" | "InconsistentRowSize">> {
    const rows = results
        .keys()
        .collect()
        .map((name) => "<> " + name)
        .concatHead(["function", "ms/iter", "ops/sec"])
        .wrap()

    for (const [name, result] of results) {
        const row = new List([name, numFormatter(result.average._total) + " ms/iter", numFormatter(1000 / result.average.milliseconds) + " ops/sec"])

        for (const [otherName, relative] of result.relative) {
            if (name === otherName) {
                row.push(percentage ? "/" : "")
            } else if (relative > 1) {
                row.push(percentage ? "+ " + numFormatter((relative - 1) * 100) + "%" : numFormatter(relative) + " x faster")
            } else {
                row.push(percentage ? "- " + numFormatter(100 - 100 * relative) + "%" : numFormatter(1 / relative) + " x slower")
            }
        }

        rows.push(row)
    }

    return tablify(rows)
}

// TODO: TO OPTIMIZE!
export function tablify(rows: List<List<string>>, titleRow = true): Result<string, Enum<"EmptyTable" | "InconsistentRowSize">> {
    if (rows.length === 0) {
        return Err(enumStr("EmptyTable"))
    }

    const colSize = rows.getUnwrap(0).map((_, i) => rows.max((row) => row.getUnwrap(i).length))

    const output = new StringBuffer()

    output.push("┌")

    rows.getUnwrap(0).forEach((col, i) => {
        output.push("─".repeat(colSize.getUnwrap(i) + 2))

        if (i + 1 < rows.getUnwrap(0).length) {
            output.push("┬")
        }
    })

    output.push("┐")

    for (const [i, row] of rows.entries()) {
        if (row.length !== colSize.length) {
            return Err(enumStr("InconsistentRowSize"))
        }

        output.newLine()
        output.push("│")

        row.forEach((col, i) => {
            output.push(" ")
            output.push(" ".repeat(colSize.getUnwrap(i) - col.length))
            output.push(col)
            output.push(" │")
        })

        if (titleRow && i === 0 && rows.length > 1) {
            output.newLine()
            output.push("├")

            row.forEach((col, i) => {
                output.push("─".repeat(colSize.getUnwrap(i) + 2))

                if (i + 1 < row.length) {
                    output.push("┼")
                }
            })

            output.push("┤")
        }
    }

    output.newLine()
    output.push("└")

    rows.getUnwrap(0).forEach((col, i) => {
        output.push("─".repeat(colSize.getUnwrap(i) + 2))

        if (i + 1 < rows.getUnwrap(0).length) {
            output.push("┴")
        }
    })

    output.push("┘")

    return Ok(output.join(""))
}
