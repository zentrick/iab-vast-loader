# iab-vast-loader

[![npm](https://img.shields.io/npm/v/iab-vast-loader.svg)](https://www.npmjs.com/package/iab-vast-loader) [![Dependencies](https://img.shields.io/david/zentrick/iab-vast-loader.svg)](https://david-dm.org/zentrick/iab-vast-loader) [![Build Status](https://img.shields.io/circleci/project/github/zentrick/iab-vast-loader/master.svg)](https://circleci.com/gh/zentrick/iab-vast-loader) [![Coverage Status](https://img.shields.io/coveralls/zentrick/iab-vast-loader/master.svg)](https://coveralls.io/r/zentrick/iab-vast-loader) [![JavaScript Standard Style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)

Loads IAB VAST tag trees using a preorder depth first strategy. The package is statically typed using [Flow](https://flow.org). [Observable streams](http://npmjs.com/package/rxjs) are used to update the consumer in time with new VAST documents.

This package exposes two functions: `loadVast()` and `vastToAd()`.

`loadVast()` is responsible for actually loading the VAST tree, it returns a stream of VAST objects, which allows you to react on failures and offers you the choice to continue listening for subsequent VAST documents in the tree. It also delivers you a new VAST document right away (preserving preorder depth first traversal semantics), instead of waiting for the whole tree to be fetched.

It also gives you a `vastToAd()` function to map the stream of VAST objects to a stream of Ad objects (both Wrapper and InLine), also in preorder depth first order. This gives you the right abstraction on which you can easily build further upon, using the RxJS `filter()` operator to for example only return `InLine` elements.

## Usage

```js
import { loadVast } from 'iab-vast-loader'

const vast$ = loadVast({
  url: 'https://example.com/vast.xml'
})

// Load the VAST tree and log all the VAST tags in the tree.
vast$
  .subscribe({
    next: action => {
      switch (action.type) {
        case 'VAST_LOADED':
          console.info('Loaded next VAST tag: ', action.vast)
          break;
        case 'VAST_LOADING_FAILED':
          console.info('Loading next VAST tag failed: ', action.error, action.wrapper)
          break;
      }
    },
    complete: () => {
      console.info('Finished loading the complete VAST tree')
    }
  })

// When interested in Ad events
const ad$ = vastToAd(vast$)

ad$
  .subscribe({
    next: action => {
      switch (action.type) {
        case 'AD_LOADED':
          console.info('Loaded next Ad: ', action.ad)
          break;
        case 'AD_LOADING_FAILED'
          console.info('Loading next Ad failed: ', action.error, action.wrapper)
          break;
      }
    },
    complete: () => {
      console.info('Finished loading the complete VAST tree')
    }
  })
```

## API

### `#loadVast()`

```js
type LoadVast = (config: Config) => Observable<VastLoadAction>
```

`loadVast` creates a stream of `VastLoadAction` objects. In a fully reactive codebase, this stream will be composed within another stream. If this library is used at the boundary, then you need to subscribe yourself like this:

```js
import { loadVast } from 'iab-vast-loader'
const vast$ = loadVast(config)

loadVast$.subscribe({
  next: value => { },
  complete: () => { }
})
```

#### Configuration

`loadVast` accepts the following `Config` object:

```js
type Config = {
  url: string,
  maxDepth?: number,
  timeout?: number,
  retryCount?: number,
  credentials: Credentials
}
```

An overview of its properties:

- `url`: The url that points to the root VAST document of the VAST document tree that we need to fetch.
- `maxDepth`: The maximum number of VAST documents to load within one chain. The default is
`10`.
- `timeout`: The maximum number of milliseconds to spend per HTTP request. The default is
`10000`.
- `retryCount`: The amount of times it will retry fetching a VAST document in case of failure. The default is `0`.
- `credentials`: The credentials value defines if cookies will be sent with the request. You should pass a [`CredentialsType`](https://developer.mozilla.org/en-US/docs/Web/API/Request/credentials) string (`'omit'`, `'same-origin'` or `'include'`) or a function which calculcates the `CredentialsType` using the passed url. You can also pass an array of these values: in this case it will try the first credentials strategy, when this call fails it will go on with the next, until a strategy succeeds. If none of the credentials strategies succeed, it will result in a `VAST_LOADING_FAILED` action. Notice that passing an empty array doesn't make sense, because it will always result in a `VAST_LOADING_FAILED` action.

  With Flow, we can describe this more formally:

  ```js
  type Credentials = CredentialsTypeOrFn | CredentialsTypeOrFn[]
  type CredentialsTypeOrFn = CredentialsType | (url: string) => CredentialsType
  type CredentialsType = 'omit' | 'same-origin' | 'include'
  ```

  You can use this option to control the behavior on a per-request basis. For example:

  ```js
  const loadVast$ = loadVast({
    url: 'https://example.com/vast.xml',
    credentials: [
      url => uri.indexOf('.doubleclick.net/') !== 0 ? 'include' : 'omit'
    ]
  })
  ```

  The default is `'omit'`.

#### Output

The output of loadVast is a stream of `VastLoadAction` objects:

```js
type VastLoadedAction = {
  type: 'VAST_LOADED',
  vast: VAST
}

type VastLoadingFailedAction = {
  type: 'VAST_LOADING_FAILED',
  error: VASTLoaderError,
  wrapper: ?Wrapper
}

type VastLoadAction = VastLoadedAction | VastLoadingFailedAction
```

The `VAST` and `Wrapper` types are provided by [iab-vast-model](https://www.npmjs.com/package/iab-vast-model).

### `#vastToAd()`

```js
import { loadVast, vastToAd } from 'iab-vast-loader'
const vast$ = loadVast(config)
const ad$ = vastToAd(vast$)
```

`vastToAd` maps a stream of `VastLoadAction` objects to `AdLoadAction` objects. You can subscribe on this stream directly, or indirectly using RxJS operators, just like `loadVast`.

#### Output

The output of `vastToAd` is a stream of `AdLoadAction` objects:

```js
type AdLoadedAction = {
  type: 'AD_LOADED',
  ad: Ad
}

type AdLoadingFailedAction = {
  type: 'AD_LOADING_FAILED',
  error: VASTLoaderError,
  wrapper: ?Wrapper
}

type AdLoadAction = AdLoadedAction | AdLoadingFailedAction
```

The `Ad` and `Wrapper` types are provided by [iab-vast-model](https://www.npmjs.com/package/iab-vast-model).

## Error Handling

In case the libary fails to load the next VAST document, it will emit a `VAST_LOADING_FAILED` action. You can react to this, by unsubscribing using the `takeUntil` operator, or you can continue listening for other values of another subtree of the VAST document tree. We don't push the stream into error state, because we want to enable the consumer to use subsequent VAST documents from the tree, after one subtree failed to fetch.

In addition to the default export `VASTLoader`, the main module also exports
the `VASTLoaderError` class, which maps errors to the VAST specification. You can get the VAST error code using its `code` property, and the cause using its `cause` property.

As with [iab-vast-model](https://www.npmjs.com/package/iab-vast-model), if
`instanceof` doesn't work for you, you may want to inspect `error.$type`
instead. This issue can occur if you load multiple versions of iab-vast-loader,
each with their own `VASTLoaderError` class.

## Maintainers

- [Tim De Pauw](https://github.com/timdp)
- [Laurent De Smet](https://github.com/laurentdesmet)

## License

MIT
