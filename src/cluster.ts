/**
 * @file Parallel tasks management with concurrent executor and load balancer
 */

import { List } from "./list"
import { parallel, Task } from "./task"
import { match, hasState, state, State, Matchable } from "./match"
import { Future, FailableFuture } from "./future"
import { None, Option, Some } from "./option"
import { Err, Ok, Result } from "./result"
import { panic } from "./panic"
import { Mutex } from "./mutex"

/**
 * State of a tasks cluster
 * @template U Type of fulfill value
 * @template E Type of fail value
 */
export type TaskClusterState<U, E> = State<"Created" | "Running" | "Paused" | "Aborted"> | State<"Fulfilled", U> | State<"Failed", E>

/**
 * Tasks cluster reducer
 * @template T Type of values yielded by the tasks
 * @template U Type of cluster's fulfill value
 */
export type TaskClusterReducer<T, U> = (data: U, newValue: T, index: number) => U

/**
 * Cluster of tasks
 * @template T Type of value yielded by the tasks
 * @template E Type of fail value
 * @template U Type of fulfill value (provided by the reducer)
 */
export class TaskCluster<T, E, U> extends Matchable<TaskClusterState<U, E>> {
    /**
     * Default number of tasks that can run simultaneously
     * A big value will allow more tasks to run at the same time, but will consume more CPU and RAM
     * A small value will preserve CPU & RAM, but will slow down the process
     * NOTE: If you the tasks perform heavy computation, you should reduce this number to little to prevent your
     *        application from freezing
     */
    public static DEFAULT_MAX_SIMULTANEOUS_TASKS = Number.MAX_SAFE_INTEGER

    /** Cluster's tasks */
    private readonly _tasks: List<[Task<T, E>, boolean]>
    /** Mutex preventing multiple tasks from ending simultaneously */
    private readonly _taskConclusionMutex: Mutex<void>
    /** Data reducer, used to avoid storing all tasks' results in a memory-consuming list */
    private readonly _reducer: TaskClusterReducer<T, U>
    /** Future completing when the cluster is done */
    private readonly _completionFuture: FailableFuture<U, E>
    /** Number of completed tasks */
    private _completed: number
    /** Result data generated by the reducer */
    private _data: U
    /** Callback to complete the completion future */
    private __completeFuture: (result: Result<U, E>) => void

    /**
     * Create a new tasks cluster
     * @param reducer Data reducer
     * @param initial Initial data to provide to the reducer on 1st call
     * @param tasks Optional list of tasks
     * @example new((prev: number, newValue: number) => prev + newValue, 0)
     */
    constructor(reducer: TaskClusterReducer<T, U>, initial: U, tasks?: List<Task<T, E>>) {
        super(state("Created"))

        this._tasks = new List()
        this._taskConclusionMutex = Mutex.void()
        this._reducer = reducer
        this._data = initial
        this._completed = 0

        this.__completeFuture = () => {} // FIX requirement to init. properties in constructor
        this._completionFuture = new FailableFuture((resolve, reject) => {
            this.__completeFuture = (result) => {
                match(result, {
                    Ok: (success) => resolve(success),
                    Err: (error) => reject(error),
                })
            }
        })

        if (tasks) {
            this.addAll(tasks)
        }
    }

    /**
     * Did the cluster ended successfully or aborted?
     */
    get completed(): boolean {
        return hasState(this, "Fulfilled", "Failed", "Aborted")
    }

    /**
     * Add a new task to the cluster
     * @param task A task
     * @param repeat The number of times the task have to be ran
     */
    add(task: Task<T, E>, repeat = 1): void {
        if (repeat > 1) {
            for (let i = 0; i < repeat; i++) {
                this.add(task)
            }

            return
        }

        // Clone the task to avoid linkage to the original one
        task = task.clone()

        // Set the task's status
        const status: [Task<T, E>, boolean] = [task, false]

        // When it completes...
        task.future().then((result) => {
            // Wait for eventual task to complete its conclusion callback...
            this._taskConclusionMutex.futureLock().success((ref) => {
                // Tasks should never yield a success value when the cluster is already completed
                if (this.completed) {
                    if (result.isOk()) {
                        panic("Internal error: co-routines cluster was marked as finished before all results were collected!")
                    }

                    return
                }

                match(result, {
                    // Success
                    Ok: (value) => {
                        // Reduce the value
                        this._data = this._reducer(this._data, value, this._completed)

                        // Mark the task as completed
                        status[1] = true

                        // If the cluster is not paused...
                        if (!hasState(this, "Paused")) {
                            // Find the first next that is not running nor completed yet
                            const firstNotRunningTask = this._tasks.find((task) => task[0].paused)

                            match(firstNotRunningTask, {
                                Some: (task) => this._runTask(task[0]),
                                None: () => {
                                    // If there isn't any, check if there is pending tasks...
                                    if (this._tasks.find((task) => !task[1]).isNone()) {
                                        // If not, the cluster is fulfilled!
                                        this._state = state("Fulfilled", this._data)
                                        this.__completeFuture(Ok(this._data))
                                    }
                                },
                            })
                        }
                    },
                    Err: (error) => {
                        // Mark the task as completed
                        status[1] = true
                        // Mark the cluster as failed
                        this._state = state("Failed", error)
                        this.__completeFuture(Err(error))
                    },
                })

                // Allow other tasks to complete themselves
                this._taskConclusionMutex.unlock(ref)
                // Include the counter of completed tasks
                this._completed++
            })
        })

        // Register the new task in the cluster
        this._tasks.push(status)
    }

    /**
     * Add a list of tasks to the cluster
     * @param tasks
     */
    addAll(tasks: List<Task<T, E>>): void {
        for (const task of tasks) {
            this.add(task)
        }
    }

    /**
     * [PRIVATE] Run a task until it completes
     * Execution will stop at the end of a step if the cluster is not marked as running anymore
     * @param task
     * @param delay
     * @private
     */
    private _runTask(task: Task<T, E>, delay?: number): void {
        parallel(async () => {
            while (!task.completed && !this.completed) {
                await task.next().promise()
            }
        }, delay)
    }

    /**
     * Run the cluster's tasks
     * @param simult Optional number of tasks to run simultaneously
     */
    run(simult?: number): FailableFuture<U, E> {
        // If the cluster is running / has completed, return the related future
        if (!hasState(this, "Created") && !hasState(this, "Paused")) {
            return this._completionFuture
        }

        // Mark the cluster as running
        this._state = state("Running")

        // Run the maximum of non-completed tasks simultaneously up to the provided limit
        const nonCompletedTasks = this._tasks.select((task) => task[0].paused, simult || TaskCluster.DEFAULT_MAX_SIMULTANEOUS_TASKS)

        // Handle the case where no task is to run
        if (!nonCompletedTasks.length) {
            this.__completeFuture(Ok(this._data))
        }

        // Tasks are ran with a little different delay to avoid them all reaching the conclusion mutex at the same time
        nonCompletedTasks.forEach((task, i) => this._runTask(task[0], i % 10))

        return this._completionFuture
    }

    /**
     * Pause the cluster
     */
    pause(): boolean {
        if (!hasState(this, "Running")) {
            // Cannot pause the cluster if it's not running
            return false
        }

        // Mark the cluster as paused
        this._state = state("Paused")
        return true
    }

    /**
     * Get the cluster's result
     */
    result(): Option<Result<U, E>> {
        return match(this, {
            Fulfilled: (success) => Some(Ok(success)),
            Failed: (error) => Some(Err(error)),
            _: () => None<Result<U, E>>(),
        })
    }

    /**
     * Get the cluster's result as a future
     */
    future(): FailableFuture<U, E> {
        return this._completionFuture
    }

    /**
     * Create a collector (stores all result values from the provided tasks)
     * @param tasks
     */
    static collector<T, E>(tasks: List<Task<T, E>>): TaskCluster<T, E, List<T>> {
        return new TaskCluster(
            (list, val) => {
                list.push(val)
                return list
            },
            new List<T>(),
            tasks
        )
    }

    /**
     * Run a task multiple times and get the results asynchronously
     * @param task
     * @param repeat
     */
    static serial<T, E>(task: Task<T, E>, repeat: number): TaskCluster<T, E, List<T>> {
        return this.collector(task.serial(repeat))
    }
}
