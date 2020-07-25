import { O } from './objects'
import { StringifyHighlighter, StringifyNumberFormat, stringify } from './stringify'

declare const console: {
    debug(message: string): void
    log(message: string): void
    warn(message: string): void
    error(message: string): void
}

export interface TSCoreEnv {
    DEV_MODE: boolean

    format(message: string, params: unknown[], options: FormatOptions): string
    formatExt(format: string, params: unknown[], paramCounter: number): string | false | null
    defaultFormattingOptions: FormatOptions

    logger(type: "debug" | "log" | "warn" | "error" | "panic" | "unreachable" | "unimplemented" | "todo", message: string, params: unknown[]): void

    debug(message: string, params: unknown[]): void
    println(message: string, params: unknown[]): void
    warn(message: string, params: unknown[]): void
    eprintln(message: string, params: unknown[]): void

    panicWatcher(message: string, params: unknown[]): void
    panic(message: string, params: unknown[]): never
    unreachable(message: string, params: unknown[]): never
    unimplemented(message: string, params: unknown[]): never
    todo(message: string, params: unknown[]): never
}

export interface FormatOptions {
    unknownParam: (position: number) => string | never
    prettify: (DEV_MODE: boolean) => boolean
    numberFormat: StringifyNumberFormat
    highlighter: StringifyHighlighter
}

const _tsCoreEnv: TSCoreEnv = {
    DEV_MODE: true,

    format(message, params, options) {
        let paramCounter = -1

        return message.replace(/{(\d+)?([:#])?([bdoxX])?(\?)?}/g, (_, strParamPos, display, numberFormat, pretty) => {
            const paramPos = strParamPos ? parseInt(strParamPos) : ++paramCounter

            if (paramPos >= params.length) {
                return options.unknownParam(paramPos)
            }

            if (display === "#" || !display) {
                return stringify(
                    params[paramCounter],
                    display ? pretty : options.prettify(this.DEV_MODE),
                    numberFormat ?? options.numberFormat,
                    options.highlighter
                )
            }

            return JSON.stringify(params[paramCounter], null, pretty ? 4 : 0)
        })
    },

    formatExt(format, params, paramCounter): string | null {
        return null
    },

    defaultFormattingOptions: {
        unknownParam(position) {
            return `<<<missing parameter ${position + 1}>>>`
        },

        prettify: (DEV_MODE) => DEV_MODE,
        numberFormat: "d",
        highlighter: (type, str) => str,
    },

    logger(message, params) {
        // Does nothing by default
    },

    debug(message, params) {
        console.debug(this.format(message, params, _tsCoreEnv.defaultFormattingOptions))
    },

    println(message, params) {
        console.log(this.format(message, params, _tsCoreEnv.defaultFormattingOptions))
    },

    warn(message, params) {
        console.warn(this.format(message, params, _tsCoreEnv.defaultFormattingOptions))
    },

    eprintln(message, params) {
        console.error(this.format(message, params, _tsCoreEnv.defaultFormattingOptions))
    },

    panicWatcher(message, params) {
        // Does nothing by default
    },

    panic(message, params) {
        const formatted = this.format(message, params, { ..._tsCoreEnv.defaultFormattingOptions, prettify: (DEV_MODE) => DEV_MODE })
        const stack = new Error("At: panic").stack
        throw new Error("Panicked! " + formatted + (stack ? "\n" + stack : ""))
    },

    unreachable(message, params) {
        return this.panic(message, params)
    },

    unimplemented(message, params) {
        return this.panic(message, params)
    },

    todo(message, params) {
        return this.panic(message, params)
    },
}

export function setupTypeScriptCore(newEnv: Partial<TSCoreEnv> | ((previousEnv: Readonly<TSCoreEnv>) => Partial<TSCoreEnv>)): void {
    for (const [key, value] of O.entries(newEnv instanceof Function ? newEnv(_tsCoreEnv) : newEnv)) {
        // @ts-ignore
        _tsCoreEnv[key] = value
    }
}

export function format(message: string, ...params: unknown[]): string {
    return _tsCoreEnv.format(message, params, _tsCoreEnv.defaultFormattingOptions)
}

export function debug(message: string, ...params: unknown[]): void {
    _tsCoreEnv.logger("debug", message, params)
    return _tsCoreEnv.debug(message, params)
}

export function println(message: string, ...params: unknown[]): void {
    _tsCoreEnv.logger("log", message, params)
    return _tsCoreEnv.println(message, params)
}

export function warn(message: string, ...params: unknown[]): void {
    _tsCoreEnv.logger("warn", message, params)
    return _tsCoreEnv.warn(message, params)
}

export function eprintln(message: string, ...params: unknown[]): void {
    _tsCoreEnv.logger("error", message, params)
    return _tsCoreEnv.eprintln(message, params)
}

export function panic(message: string, ...params: unknown[]): never {
    _tsCoreEnv.logger("panic", message, params)
    _tsCoreEnv.panicWatcher(message, params)
    return _tsCoreEnv.panic(message, params)
}

export function unreachable(message?: string, ...params: unknown[]): never {
    message = message ?? "unreachable statement reached!"
    params = params ?? []

    _tsCoreEnv.logger("unreachable", message, params)
    return _tsCoreEnv.unreachable(message, params)
}

export function unimplemented(message?: string, ...params: unknown[]): never {
    message = message ?? "unreachable statement reached!"
    params = params ?? []

    _tsCoreEnv.logger("unimplemented", message, params)
    return _tsCoreEnv.unimplemented(message, params)
}

export function todo(message?: string, ...params: unknown[]): never {
    message = message ?? "unreachable statement reached!"
    params = params ?? []

    _tsCoreEnv.logger("todo", message, params)
    return _tsCoreEnv.todo(message, params)
}
