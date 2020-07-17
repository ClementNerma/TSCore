/**
 * @file Asynchronous and abortable multi-steps tasks
 */

import { TaskCluster, TaskClusterReducer } from './cluster'
import { panic } from './console'
import { FailableFuture, Future } from './future'
import { List } from './list'
import { Matchable, State, hasState, match, state } from './match'
import { None, Option, Some } from './option'
import { Err, Ok, Result } from './result'

/**
 * State of a task
 * @template T Type of fulfill value
 * @template E Type of fail value
 */
export type TaskState<T, E> = State<"Created" | "Pending" | "RunningStep"> | State<"Fulfilled", T> | State<"Failed", E>

/**
 * Task iterator
 * @template T Type of fulfill value
 * @template E Type of fail value
 */
export type TaskIterator<T, E> = AsyncIterableIterator<void | Result<T, E>>

/**
 * Task
 * @template T Type of fulfill value
 * @template E Type of fail value
 */
export class Task<T, E> extends Matchable<TaskState<T, E>> {
    /** Task's core function (returning the task's iterator */
    private readonly _core: () => TaskIterator<T, E>
    /** Task's content (iterator) */
    private readonly _iter: TaskIterator<T, E>
    /** Completion future that resolves when the task completes */
    private readonly _completionFuture: FailableFuture<T, E>
    /** Time during which the task was running */
    private _elapsed: number
    /** Mark the task as completed */
    private __completeFuture: (result: Result<T, E>) => void

    /**
     * Create a new task
     * @param core Core function (returning an iterator)
     * @example new Task(function* () { yield Ok(2); })
     */
    constructor(core: () => TaskIterator<T, E>) {
        super(state("Created"))

        this._core = core
        this._iter = core()
        this.__completeFuture = () => {} // FIX requirement to init. properties in constructor
        this._completionFuture = new FailableFuture((_, __, complete) => (this.__completeFuture = (result) => complete(result)))
        this._elapsed = 0
        this._state = state("Created")
    }

    /**
     * Is the task completed?
     */
    get completed(): boolean {
        return match(this, {
            Fulfilled: () => true,
            Failed: () => true,
            _: () => false,
        })
    }

    /**
     * Is the task paused (including "not started")?
     */
    get paused(): boolean {
        return match(this, {
            Created: () => true,
            Pending: () => true,
            _: () => false,
        })
    }

    /**
     * Get the time consumed by the task so far
     */
    get elapsed(): number {
        return this._elapsed
    }

    /**
     * Get the task's state
     * @private
     */
    _getMatchableState(): TaskState<T, E> {
        return this._state
    }

    /**
     * Start the task
     * @returns A future resolving when the first step ended
     */
    start(): Future<Option<Result<T, E>>> {
        if (hasState(this, "Created")) {
            this._state = state("Pending")
            return this.next()
        } else {
            return panic("Cannot start a task twice")
        }
    }

    /**
     * Run the task's next step
     * @param startImplicitly Start the task if it did not start yet
     * @returns A future resolving when the step ended
     */
    next(startImplicitly = true): Future<Option<Result<T, E>>> {
        return new Future(async (resolve) => {
            if (startImplicitly && hasState(this, "Created")) {
                this._state = state("Pending")
            } else if (!hasState(this, "Pending")) {
                panic("Cannot run next step as the task is not pending!")
            }

            // Mark the task as running a step
            this._state = state("RunningStep")

            // Get the current timestamp
            const now = Date.now()

            // Get the step's result value
            const { done, value } = await this._iter.next()

            // Measure elapsed time
            this._elapsed += Date.now() - now

            // If a value was yielded, complete the task
            if (value) {
                this._state = match(value, {
                    Ok: (success) => state("Fulfilled", success),
                    Err: (error) => state("Failed", error),
                })

                this.__completeFuture(value)

                return resolve(Some(value))
            }

            // Tasks cannot end without yielding a result value
            if (done) {
                return panic("Task completed without yielding a success or error value!")
            }

            // The task did not complete nor is done - mark the task as pending
            this._state = state("Pending")

            return resolve(None())
        })
    }

    /**
     * Perform all remaining steps of the task
     */
    complete(): FailableFuture<T, E> {
        return new FailableFuture(async (_, __, complete) => {
            while (!this.completed) {
                await this.next().promise()
            }

            this._completionFuture.then(complete)
        })
    }

    /**
     * Get a future that resolves when the task is completed
     */
    future(): FailableFuture<T, E> {
        return this._completionFuture
    }

    /**
     * Get the task's result
     */
    result(): Option<Result<T, E>> {
        return match(this, {
            Fulfilled: (success) => Some(Ok(success)),
            Failed: (error) => Some(Err(error)),
            _: () => None<Result<T, E>>(),
        })
    }

    /**
     * Clone the task
     */
    clone(): Task<T, E> {
        return new Task(this._core)
    }

    /**
     * Create a list containing multiple identical tasks
     * @param repeat
     */
    serial(repeat: number): List<Task<T, E>> {
        return List.gen(repeat, () => this.clone())
    }

    /**
     * Create a cluster from this task
     * @param options
     */
    clusterize<U>(options: { repeat: number; reducer: TaskClusterReducer<T, U>; initial: U }): TaskCluster<T, E, U> {
        const cluster = new TaskCluster<T, E, U>(options.reducer, options.initial)
        cluster.add(this, options.repeat)
        return cluster
    }

    /**
     * Create a task from a one-step callback
     * @param callback
     */
    static straight<T, E>(callback: () => Result<T, E>): Task<T, E> {
        return new Task(async function* (): TaskIterator<T, E> {
            return callback()
        })
    }

    /**
     * Create a task from a one-step asynchronous callback
     * @param callback
     */
    static async<T, E>(callback: () => FailableFuture<T, E>): Task<T, E> {
        return new Task(async function* (): TaskIterator<T, E> {
            return await callback().promise()
        })
    }
}

/**
 * Run a function in parallel of the current one
 * @param core
 * @param timeout
 */
export function parallel(core: () => void, timeout = 1): void {
    setTimeout(core, timeout)
}

// Force declaration of setTimeout
declare const setTimeout: (callback: () => void, timeout: number) => number
