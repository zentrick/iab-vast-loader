// @flow

import { Observable } from 'rxjs/Observable'

export const concatEager = <T>(observables: Observable<T>[]): Observable<T> =>
  Observable.create(subscriber => {
    if (observables.length === 0) {
      subscriber.complete()
      return
    }

    let buffer = {}
    let complete = {}
    let currentIndex = 0

    const possiblyEmitBufferedValues = () => {
      if (observables.length === currentIndex) {
        subscriber.complete()
      }

      // If the current observable has buffered values, emit them all right now.
      if (buffer[currentIndex] != null) {
        buffer[currentIndex].forEach(value => subscriber.next(value))
        // These values aren't needed anymore
        buffer[currentIndex] = null
      }

      // If the current observable is already completed, go on with the next observable.
      if (complete[currentIndex]) {
        currentIndex++
        possiblyEmitBufferedValues()
      }
    }

    // We subscribe to all the observables at once, but all events are emitted
    // in order. This means we need to buffer values when a previous observable
    // is not completed yet.
    const subscriptions = observables.map((observable, index) =>
      observable.subscribe({
        next: value => {
          if (index === currentIndex) {
            // Currently, this observable is active so we emit immediately.
            subscriber.next(value)
          } else {
            // A previous observable is still emitting, so we need to buffer.
            if (buffer[index] == null) {
              buffer[index] = []
            }

            buffer[index].push(value)
          }
        },
        error: err => {
          subscriptions.forEach((subscription, index) => {
            subscription.unsubscribe()
          })
          subscriber.error(err)
        },
        complete: () => {
          complete[index] = true
          if (index === currentIndex) {
            // The currently active observable completed, so we possibly need
            // to emit buffered values or complete the resulting observable.
            currentIndex++
            possiblyEmitBufferedValues()
          }
        }
      })
    )

    const subscription = () => {
      subscriptions.forEach(subscription => subscription.unsubscribe())
    }

    return subscription
  })
