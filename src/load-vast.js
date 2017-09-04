// @flow

import { type VAST, Wrapper } from 'iab-vast-model'
import parse from 'iab-vast-parser'
import { VASTLoaderError } from './error'
import { concatEager } from './concat-eager'
import { fx } from './rxjs-fx'

import { Observable } from 'rxjs/Observable'

// RxJS statics
import 'rxjs/add/observable/empty'
import 'rxjs/add/observable/of'
import 'rxjs/add/observable/from'

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
import 'rxjs/add/operator/elementAt'

type VastLoadedAction = { type: 'VAST_LOADED', vast: VAST }

type VastLoadingFailedAction = { type: 'VAST_LOADING_FAILED', error: VASTLoaderError, wrapper: ?Wrapper }

export type VastLoadAction =
  VastLoadedAction |
  VastLoadingFailedAction

type CredentialsTypeOrFn = CredentialsType | (url: string) => CredentialsType

type Credentials = CredentialsTypeOrFn | CredentialsTypeOrFn[]

type Config = {
  url: string,
  maxDepth?: number,
  timeout?: number,
  retryCount?: number,
  credentials: Credentials
}

const DEFAULT_OPTIONS = {
  maxDepth: 10,
  timeout: 10000,
  retryCount: 0,
  credentials: 'omit'
}

export const loadVast = (config: Config): Observable<VastLoadAction> =>
  loadVastTree({
    ...DEFAULT_OPTIONS,
    ...config,
    parent: null
  })

type LoadVastConfig = {
  url: string,
  parent: ?Wrapper,
  maxDepth: number,
  timeout: number,
  retryCount: number,
  credentials: Credentials
}

// Traverse the tree using a preorder depth first strategy.
const loadVastTree = (config: LoadVastConfig): Observable<VastLoadAction> => {
  // We add share() because we want a multicast observable here, because
  // loadVast$ is subscribed to in multiple places and this would result in
  // multiple ajax requests for the same VAST document.
  const loadVast$ = fetchVast(config).share()

  const children$ = loadVast$
    .concatMap(output => {
      if (output.type === 'VAST_LOADING_FAILED') {
        // When the VAST failed loading, then we can't load its children of course.
        return Observable.empty()
      } else {
        const { vast } = output
        const wrappers = getWrappers(vast)

        if (!vast.followAdditionalWrappers() || vast.depth === config.maxDepth) {
          return Observable.from(
            wrappers.map(wrapper => ({
              type: 'VAST_LOADING_FAILED',
              wrapper,
              error: new VASTLoaderError('302')
            }))
          )
        } else {
          // We start fetching all the children.
          const results = getWrappers(vast).map(wrapper =>
            loadVastTree({
              ...config,
              url: wrapper.vastAdTagURI,
              parent: wrapper
            })
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
  // We cast to any here, because Flow is pessimistic and doesn't allow downcasting.
  // Another approach could be to add an additional map, and perform an invariant check.
  // This has however (a very minor) performance impact at runtime and it adds unnecessary complexity.
  (vast.ads.filter(ad => ad instanceof Wrapper): any)

const normalizeCredentials = (credentials: Credentials): CredentialsTypeOrFn[] => Array.isArray(credentials)
  ? credentials
  : [credentials]

// This function returns a stream with exact one event: a success or error event.
const fetchVast = (config: LoadVastConfig): Observable<VastLoadAction> =>
  Observable.from(normalizeCredentials(config.credentials))
    .map(credentials =>
      typeof credentials === 'string'
        ? credentials
        : credentials(config.url)
    )
    .concatMap(credentials =>
      fx
        .http(config.url, {
          method: 'GET',
          credentials
        })
        .retry(config.retryCount)
        .timeout(config.timeout)
        // Swallow errors.
        .catch(() => Observable.empty())
    )
    // When there are only errors, the resulting stream will be empty, which
    // will make elemetAt(0) fail, which is the expected behavior.
    .elementAt(0)
    .catch(() => {
      if (config.parent == null) {
        throw new VASTLoaderError('900')
      } else {
        throw new VASTLoaderError('301')
      }
    })
    .map(parseVast)
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

const parseVast = (res: string) => {
  try {
    return parse(res)
  } catch (err) {
    throw new VASTLoaderError('100')
  }
}

const addParentToVast = (vast: VAST, parent: ?Wrapper) => {
  vast.parent = parent
}
