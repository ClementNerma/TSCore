/**
 * @file Functional observable object
 */

import {List} from "./list";

/**
 * Observer
 * @template T Type of observable data
 */
export type Observer<T> = (prev: T, next: T) => boolean | void;

/**
 * Observable
 * @template T Type of observable data
 */
export class Observable<T> {
    /** Observed data */
    protected _data: T;
    /** Observers */
    protected readonly _observers: List<Observer<T>>;

    /**
     * Create an observable data
     * @param data
     */
    constructor(data: T) {
        this._data = data;
        this._observers = new List();
    }

    /**
     * Get the observable's value
     */
    get value(): T {
        return this._data;
    }

    /**
     * Set the observable's value
     * Will trigger observers
     * @param newValue
     */
    set value(newValue: T) {
        for (const observer of this._observers) {
            if (observer(this._data, newValue) === false) {
                return ;
            }
        }

        this._data = newValue;
    }

    /**
     * Observe changes
     * Callback may return `false` to prevent the value from changing
     * @param observer
     */
    observe(observer: Observer<T>): void {
        this._observers.push(observer);
    }
}
