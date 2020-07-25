import { O } from './objects'
import { Regex } from './regex'
import { StringifyOptions, stringify } from './stringify'

declare const console: {
    debug(message: string): void
    log(message: string): void
    warn(message: string): void
    error(message: string): void
}

export interface TSCoreEnv {
    DEV_MODE: boolean

    format(message: string, params: unknown[], options?: FormatOptions): string
    formatExt(format: string, params: unknown[], paramCounter: number, options: FormatOptions): string | false | null
    defaultFormattingOptions: (DEV_MODE: boolean) => FormatOptions

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
    stringifyOptions: StringifyOptions
}

const _tsCoreEnv: { ref: TSCoreEnv } = {
    ref: {
        DEV_MODE: true,

        format(message, params, maybeOptions) {
            const options = maybeOptions ?? this.defaultFormattingOptions(this.DEV_MODE)
            let paramCounter = -1

            return message.replace(/{([a-zA-Z0-9_:#\?\$]*)}/g, (match, format) => {
                paramCounter++

                const supported = new Regex(/^(\d+)?([:#])?([bdoxX])?(\?)?$/, ["strParamPos", "display", "numberFormat", "pretty"]).matchNamed(format)

                if (supported.isNone()) {
                    const ext = this.formatExt(format, params, paramCounter, options)

                    if (ext === null) {
                        return match
                    }

                    if (ext === false) {
                        return options.unknownParam(paramCounter)
                    }

                    return ext
                }

                const { strParamPos, display, numberFormat, pretty } = supported.inner

                const paramPos = strParamPos ? parseInt(strParamPos) : paramCounter

                if (paramPos >= params.length) {
                    return options.unknownParam(paramPos)
                }

                if (display === "#" || !display) {
                    return stringify(params[paramCounter], {
                        ...options.stringifyOptions,
                        numberFormat: (numberFormat as any) || options.stringifyOptions.numberFormat,
                    })
                }

                return JSON.stringify(params[paramCounter], null, pretty ? 4 : 0)
            })
        },

        formatExt(format, params, paramCounter, options): string | null {
            return null
        },

        defaultFormattingOptions: (DEV_MODE) => ({
            unknownParam(position) {
                return `<<<missing parameter ${position + 1}>>>`
            },

            stringifyOptions: { prettify: DEV_MODE },
        }),

        logger(message, params) {
            // Does nothing by default
        },

        debug(message, params) {
            if (this.DEV_MODE) {
                console.debug(this.format(message, params, _tsCoreEnv.ref.defaultFormattingOptions(this.DEV_MODE)))
            }
        },

        println(message, params) {
            console.log(this.format(message, params, _tsCoreEnv.ref.defaultFormattingOptions(this.DEV_MODE)))
        },

        warn(message, params) {
            console.warn(this.format(message, params, _tsCoreEnv.ref.defaultFormattingOptions(this.DEV_MODE)))
        },

        eprintln(message, params) {
            console.error(this.format(message, params, _tsCoreEnv.ref.defaultFormattingOptions(this.DEV_MODE)))
        },

        panicWatcher(message, params) {
            // Does nothing by default
        },

        panic(message, params) {
            const formatted = this.format(message, params, _tsCoreEnv.ref.defaultFormattingOptions(this.DEV_MODE))
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
    },
}

export function setupTypeScriptCore(newEnv: Partial<TSCoreEnv> | ((previousEnv: Readonly<TSCoreEnv>) => Partial<TSCoreEnv>)): void {
    const out = { ..._tsCoreEnv.ref }

    for (const [key, value] of O.entries(newEnv instanceof Function ? newEnv(_tsCoreEnv.ref) : newEnv)) {
        // @ts-ignore
        out[key] = value
    }

    _tsCoreEnv.ref = out
}

export function format(message: string, ...params: unknown[]): string {
    return _tsCoreEnv.ref.format(message, params, _tsCoreEnv.ref.defaultFormattingOptions(_tsCoreEnv.ref.DEV_MODE))
}

export function debug(message: string, ...params: unknown[]): void {
    _tsCoreEnv.ref.logger("debug", message, params)
    return _tsCoreEnv.ref.debug(message, params)
}

export function println(message: string, ...params: unknown[]): void {
    _tsCoreEnv.ref.logger("log", message, params)
    return _tsCoreEnv.ref.println(message, params)
}

export function warn(message: string, ...params: unknown[]): void {
    _tsCoreEnv.ref.logger("warn", message, params)
    return _tsCoreEnv.ref.warn(message, params)
}

export function eprintln(message: string, ...params: unknown[]): void {
    _tsCoreEnv.ref.logger("error", message, params)
    return _tsCoreEnv.ref.eprintln(message, params)
}

export function panic(message: string, ...params: unknown[]): never {
    _tsCoreEnv.ref.logger("panic", message, params)
    _tsCoreEnv.ref.panicWatcher(message, params)
    return _tsCoreEnv.ref.panic(message, params)
}

export function unreachable(message?: string, ...params: unknown[]): never {
    message = message ?? "unreachable statement reached!"
    params = params ?? []

    _tsCoreEnv.ref.logger("unreachable", message, params)
    return _tsCoreEnv.ref.unreachable(message, params)
}

export function unimplemented(message?: string, ...params: unknown[]): never {
    message = message ?? "unreachable statement reached!"
    params = params ?? []

    _tsCoreEnv.ref.logger("unimplemented", message, params)
    return _tsCoreEnv.ref.unimplemented(message, params)
}

export function todo(message?: string, ...params: unknown[]): never {
    message = message ?? "unreachable statement reached!"
    params = params ?? []

    _tsCoreEnv.ref.logger("todo", message, params)
    return _tsCoreEnv.ref.todo(message, params)
}
