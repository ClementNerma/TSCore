/**
 * @file Future results management (based on promises)
 */

import { panic } from './console'
import { Consumers } from './list'
import { MappedMatchable, State, match, state } from './match'
import { None, Option, Some } from './option'
import { Err, Ok, Result } from './result'

/**
 * Future's pattern matching
 * @template T Type of the completion value
 */
export type FutureMatch<T> = State<"Pending"> | State<"Complete", T>

/**
 * Future
 * @template T Type of the completion value
 */
export class Future<T> extends MappedMatchable<FutureMatch<T>, Option<T>> {
    // Event listeners
    private readonly _completionHandlers: Consumers<T>

    constructor(core: (resolve: (data: T) => void) => void) {
        super(None(), () =>
            match(this._under, {
                Some: (result) => state("Complete", result),
                None: () => state("Pending"),
            })
        )

        this._completionHandlers = new Consumers()

        core((data) => this._complete(data))
    }

    private _complete(value: T): void {
        this._under.replace(value).expectNone("Tried to resolve an already-resolved future!")
        this._completionHandlers.resolve(value)
    }

    /**
     * Is the future pending?
     */
    pending(): boolean {
        return this._under.isNone()
    }

    /**
     * Is the future completed?
     */
    completed(): boolean {
        return this._under.isSome()
    }

    /**
     * Get the future's resolved value
     * @param callback
     */
    value(): Option<T> {
        return this._under.clone()
    }

    /**
     * Create a future that resolves through a callback taking this future's success value
     * @param callback
     */
    then<U>(callback: (data: T) => U): Future<U> {
        return new Future((resolve) => {
            match(this._under, {
                Some: (data) => resolve(callback(data)),
                None: () => this._completionHandlers.push((data) => resolve(callback(data))),
            })
        })
    }

    /**
     * Creates a future that resolves through an asynchronous callback taking this future's success value
     * Equivalent of .then() but using an async. callback
     * @param callback
     */
    thenAsync<U>(callback: (data: T) => Future<U>): Future<U> {
        return new Future((resolve) => {
            match(this._under, {
                Some: async (data) => resolve(await callback(data).promise()),
                None: () => this._completionHandlers.push(async (data) => resolve(await callback(data).promise())),
            })
        })
    }

    /**
     * Inspect this future's result without changing it
     * @param callback
     */
    inspect(callback: (data: T) => void): this {
        match(this._under, {
            Some: (data) => callback(data),
            None: () => this._completionHandlers.push(callback),
        })

        return this
    }

    /**
     * Get a promise that won't reject from the current future
     */
    promise(): Promise<T> {
        return new Promise((resolve) => this.then(resolve))
    }

    /**
     * Create a future object from a fallible promise
     * @param promise
     */
    static fromPromise<T>(promise: Promise<T>): Future<Result<T, unknown>> {
        return new Future((resolve) => {
            promise.then((data) => resolve(Ok(data)))
            promise.catch((err) => resolve(Err(err)))
        })
    }

    /**
     * Create a future object from a failure-free promise
     * @param promise
     */
    static fromStablePromise<T, E>(promise: Promise<Result<T, E>>): Future<Result<T, E>> {
        return new Future((resolve) => {
            promise
                .then((result) => {
                    match(result, {
                        Ok: (data) => resolve(Ok(data)),
                        Err: (err) => resolve(Err(err)),
                    })
                })
                .catch((_) => panic("Promise unexpectedly failed while a future was built upon it!"))
        })
    }

    /**
     * Create a complete future
     * @param data Success value
     */
    static complete<T>(data: T): Future<T> {
        return new Future((resolve) => resolve(data))
    }
}

/**
 * Failable future
 * @template T Type of success value
 * @template E Type of error value
 */
export class FailableFuture<T, E> extends Future<Result<T, E>> {
    constructor(core: (resolve: (data: T) => void, reject: (err: E) => void, complete: (result: Result<T, E>) => void) => void) {
        super((resolve) =>
            core(
                (data) => resolve(Ok(data)),
                (err) => resolve(Err(err)),
                (result) => resolve(result)
            )
        )
    }

    /**
     * Is the future fulfilled? (completed with an Ok() value)
     */
    fulfilled(): boolean {
        return this._under.mapOr((value) => value.isOk(), false)
    }

    /**
     * Is the future failed? (completed with an Err() value)
     * @param callback
     */
    failed(): boolean {
        return this._under.mapOr((value) => value.isErr(), false)
    }

    /**
     * Get the future's success value
     */
    ok(): Option<T> {
        return this._under.andThen((value) => value.ok())
    }

    /**
     * Get the future's error value
     */
    err(): Option<E> {
        return this._under.andThen((value) => value.err())
    }

    /**
     * Create a future that resolves through a callback taking this future's success value
     * @param callback
     */
    success<U>(callback: (data: T) => U): FailableFuture<U, E> {
        return new FailableFuture((_, __, complete) => this.then((result) => complete(result.map((data) => callback(data)))))
    }

    /**
     * Create a future that rejects through a callback taking this future's error value
     * @param callback
     */
    catch<F>(callback: (err: E) => F): FailableFuture<T, F> {
        return new FailableFuture((_, __, complete) => this.then((result) => complete(result.mapErr((err) => callback(err)))))
    }

    /**
     * Inspect this future's success value once it resolves, without changing it
     * @param callback
     */
    inspectOk(callback: (data: T) => void): this {
        this.then((result) => result.withOk(callback))
        return this
    }

    /**
     * Inspect this future's error value once it rejects, without changing it
     * @param callback
     */
    inspectErr(callback: (data: E) => void): this {
        this.then((result) => result.withErr(callback))
        return this
    }

    /**
     * Create a fulfilled future
     * @param data Success value
     */
    static resolve<T>(data: T): FailableFuture<T, any> {
        return new FailableFuture((resolve) => resolve(data))
    }

    /**
     * Create a failed future
     * @param err Error value
     */
    static reject<E>(err: E): FailableFuture<any, E> {
        return new FailableFuture<any, E>((resolve, reject) => reject(err))
    }

    /**
     * Create a failable future from a basic one
     * @param future
     */
    static fromFuture<T, E>(future: Future<Result<T, E>>): FailableFuture<T, E> {
        return new FailableFuture((_, __, complete) => future.then(complete))
    }

    /**
     * Ensure any of the provided futures fulfills
     * @param futures
     */
    static any<T, E>(futures: Array<FailableFuture<T, E>>): FailableFuture<T, E> {
        return new FailableFuture((resolve, reject) => {
            let completed = false

            futures.forEach((future) =>
                future.then((result) => {
                    if (completed) {
                        return
                    }

                    completed = true

                    match(result, {
                        Ok: (data) => resolve(data),
                        Err: (err) => reject(err),
                    })
                })
            )
        })
    }

    /**
     * Ensure every provided future fulfills
     * @param futures
     */
    static all<T, E>(futures: Array<FailableFuture<T, E>>): FailableFuture<T[], E> {
        const success = new Array<T>()
        let remaining = futures.length
        let failed = false

        return new FailableFuture((resolve, reject) =>
            futures.forEach((future) =>
                future.then((result) => {
                    if (!remaining || failed) {
                        return
                    }

                    match(result, {
                        Ok: (data) => {
                            success.push(data)

                            if (--remaining === 0) {
                                resolve(success)
                            }
                        },

                        Err: (err) => {
                            failed = true
                            reject(err)
                        },
                    })
                })
            )
        )
    }
}
