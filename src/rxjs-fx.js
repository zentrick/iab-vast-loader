// @flow

import fetch from 'isomorphic-fetch'
import { Observable } from 'rxjs/Observable'
import 'rxjs/add/observable/defer'
import 'rxjs/add/operator/mergeMap'
import 'rxjs/add/observable/fromPromise'

const http = (url: string, options?: RequestOptions) =>
  Observable.defer(() => fetch(url, options))
    .mergeMap(res => res.ok ? Observable.fromPromise(res.text()) : Observable.throw(new Error('Http Failed')))

export const fx = {
  http
}
