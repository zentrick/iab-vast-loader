// @flow

import { type VAST, Wrapper } from 'iab-vast-model'
import parse from 'iab-vast-parser'
import VASTLoaderError from './error'
import { concatEager } from './concat-eager'
import fetch from 'isomorphic-fetch'

import { Observable } from 'rxjs/Observable'

// RxJS statics
import 'rxjs/add/observable/empty'
import 'rxjs/add/observable/of'
import 'rxjs/add/observable/defer'
import 'rxjs/add/observable/fromPromise'

// RxJS operators
import 'rxjs/add/operator/retry'
import 'rxjs/add/operator/timeout'
import 'rxjs/add/operator/catch'
import 'rxjs/add/operator/map'
import 'rxjs/add/operator/mergeMap'
import 'rxjs/add/operator/do'
import 'rxjs/add/operator/share'
import 'rxjs/add/operator/concatMap'
import 'rxjs/add/operator/toArray'
import 'rxjs/add/operator/toPromise'

type VastLoadedAction = { type: 'VAST_LOADED', vast: VAST }

type VastLoadingFailedAction = { type: 'VAST_LOADING_FAILED', error: any, wrapper: ?Wrapper }

export type VastLoadAction = VastLoadedAction | VastLoadingFailedAction

export const http = (url: string, options?: RequestOptions) =>
  Observable.defer(() => fetch(url, options))
    .mergeMap(res => Observable.fromPromise(res.text()))

const defaultSfx = {
  http
}

type Config = {
  url: string,
  maxDepth?: number,
  timeout?: number,
  retryCount?: number,
  withCredentials?: boolean
}

type SFX = {
  http: typeof http
}

const DEFAULT_OPTIONS = {
  maxDepth: 10,
  timeout: 10000,
  retryCount: 0,
  withCredentials: false
}

export const loadVast = (config: Config, sfx: SFX = defaultSfx): Observable<VastLoadAction> =>
  loadVastTree({
    ...DEFAULT_OPTIONS,
    ...config,
    parent: null
  }, sfx)

type LoadVastConfig = {
  url: string,
  parent: ?Wrapper,
  maxDepth: number,
  timeout: number,
  retryCount: number,
  withCredentials: boolean
}

// Traverse the tree using a preorder depth first strategy.
const loadVastTree = (config: LoadVastConfig, sfx: SFX): Observable<VastLoadAction> => {
  // We add share() because we want a multicast observable here, because
  // loadVast$ is subscribed to in multiple places and this would result in
  // multiple ajax requests for the same VAST document.
  const loadVast$ = fetchVast(config, sfx).share()

  const children$ = loadVast$
    .concatMap(output => {
      if (output.type === 'VAST_LOADING_FAILED') {
        // When the VAST failed loading, then we can't load its children of course.
        return Observable.empty()
      } else {
        const { vast } = output

        if (!vast.followAdditionalWrappers() && vast.depth > config.maxDepth) {
          // We don't fetch additional children.
          return Observable.empty()
        } else {
          // We start fetching all the children.
          const results = getWrappers(vast).map(wrapper =>
            loadVastTree({
              ...config,
              url: wrapper.vastAdTagURI,
              parent: wrapper
            }, sfx)
          )

          // We start fetching them all at once and return the results in order.
          return concatEager(results)
        }
      }
    })

  // We return a stream that will first emit an event for this VAST,
  // and then returns all the child VASTS which comes down to a
  // preorder depth first traversal.
  return concatEager([loadVast$, children$])
}

const getWrappers = (vast: VAST): Wrapper[] =>
  vast.ads
    .filter(ad => ad instanceof Wrapper)

// This function returns a stream with exact one event: a success or error event.
const fetchVast = (config: LoadVastConfig, sfx: SFX): Observable<VastLoadAction> =>
  sfx.http(config.url, { method: 'GET' })
    .retry(config.retryCount)
    .timeout(config.timeout)
    .catch(error => {
      if (config.parent == null) {
        throw new VASTLoaderError('900', error)
      } else {
        throw new VASTLoaderError('301', error)
      }
    })
    .map(parseVast)
    .catch(error => {
      if (error instanceof VASTLoaderError) {
        throw error
      } else {
        throw new VASTLoaderError('100', error)
      }
    })
    .do(vast => addParentToVast(vast, config.parent))
    .map(vast => ({
      type: 'VAST_LOADED',
      vast: vast
    }))
    .catch(error => Observable.of({
      type: 'VAST_LOADING_FAILED',
      error,
      wrapper: config.parent
    }))

const parseVast = (res: string) => parse(res)

const addParentToVast = (vast: VAST, parent: ?Wrapper) => {
  vast.parent = parent
}
