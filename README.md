# iab-vast-loader

[![npm](https://img.shields.io/npm/v/iab-vast-loader.svg)](https://www.npmjs.com/package/iab-vast-loader) [![Dependencies](https://img.shields.io/david/zentrick/iab-vast-loader.svg)](https://david-dm.org/zentrick/iab-vast-loader) [![Build Status](https://img.shields.io/circleci/project/github/zentrick/iab-vast-loader/master.svg)](https://circleci.com/gh/zentrick/iab-vast-loader) [![Coverage Status](https://img.shields.io/coveralls/zentrick/iab-vast-loader/master.svg)](https://coveralls.io/r/zentrick/iab-vast-loader) [![JavaScript Standard Style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)

Loads IAB VAST tag trees using a preorder depth first strategy. The package is statically typed using [Flow](https://flow.org). [Observable streams](http://npmjs.com/package/rxjs) are used to update the consumer in time with new VAST documents.

This is a major rewrite from the [earlier version](https://github.com/zentrick/iab-vast-loader/tree/v0.8.0) of this package that asynchronously fetches the complete VAST document tree. The previous version of this package used JS Promises and waited for the complete VAST tree to be fetched. One failing VAST document within the tree, made it fail completely. The new implementation allows you to react on failures and offers you the choice to continue listening for subsequent VAST documents in the tree. It also delivers you a newly VAST document right away (preserving preorder depth first traversal semantics), instead of waiting for the whole tree to be fetched.

## Usage

```js
import { loadVast } from 'iab-vast-loader'

const loadVast$ = loadVast({
  url: 'https://example.com/vast.xml'
})

// Load the VAST tree and log all the VAST tags in the tree.
loadVast$
  .subscribe({
    next: action => {
      switch(action.type) {
        case 'VAST_LOADED':
          console.info('Loaded next VAST tag: ', action.vast)
          break;
        case 'VAST_LOADING_FAILED':
          console.info('Loading next VAST tag failed', action.wrapper)
          break;
      }
    },
    complete: () => {
      console.info('Finished loading the complete VAST tree')
    }
  })
```

## API

```js
const loadVast$ = loadVast(config)
```

Creates a stream with VastLoadAction objects. In a fully reactive codebase, this stream will be composed within another stream. If this library is used at the boundary, then you need to subscribe yourself like this:

```js
loadVast$.subscribe({
  next: value => { },
  complete: () => { }
})
```

The stream returned consists of VastLoadAction objects:

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

export type VastLoadAction = VastLoadedAction | VastLoadingFailedAction
```

The `VAST` class is provided by the new, typed version of [iab-vast-model](https://www.npmjs.com/package/iab-vast-model).

## Error Handling

In case the libary fails to load the next VAST document, it will emit a `VAST_LOADING_FAILED` action. You can react to this, by unsubscribing using the `takeUntil` operator, or you can continue listening for other values of another subtree of the VAST document tree. We don't push the stream into error state, because we want to enable the consumer to use subsequent VAST documents from the tree, after one subtree failed to fetch.

In addition to the default export `VASTLoader`, the main module also exports
the `VASTLoaderError` class, which maps errors to the VAST specification. You can get the VAST error code using its `code` property, and the cause using its `cause` property.

As with [iab-vast-model](https://www.npmjs.com/package/iab-vast-model), if
`instanceof` doesn't work for you, you may want to inspect `error.$type`
instead. This issue can occur if you load multiple versions of iab-vast-loader,
each with their own `VASTLoaderError` class.

## Configuration

### `url: string`

The url that points to the root VAST document of the VAST document tree that we need to fetch.

### `maxDepth?: number`

The maximum number of VAST documents to load within one chain. The default is
10.

### `timeout?: number`

The maximum number of milliseconds to spend per HTTP request. The default is
10,000.

### `retryCount?: number`

The amount of times it will retry fetching a VAST document in case of failure. The default is 0.

### `credentials: Credentials`

```js
type Credentials = (CredentialsType | (url: string) => CredentialsType)[]
type CredentialsType = 'omit' | 'same-origin' | 'include'
```

Controls [CORS](https://en.wikipedia.org/wiki/Cross-origin_resource_sharing)
behavior. You should pass an array of CredentialsType or functions that return a [CredentialsType value]((https://developer.mozilla.org/en-US/docs/Web/API/Request/credentials)), which is either `'omit'`, `'same-origin'` or `'include'`.

You can use this option to control the behavior on a per-request basis. For example:

```js
const loadVast$ = loadVast({
  url: 'https://example.com/vast.xml',
  credentials: [
    url => uri.indexOf('.doubleclick.net/') !== 0 ? 'include' : 'omit'
  ]
})
```

You can also pass multiple CORS strategies with the array. The implementation will race the different strategies in parallel, and will use the first request that succeeds. If none of the CORS strategies succeed, it will result in a `VAST_LOADING_FAILED` action. Notice that passing an empty array doesn't make sense, because it will make your request to fail always.

The default value is: `['omit']`

## Maintainers

- [Tim De Pauw](https://github.com/timdp)
- [Laurent De Smet](https://github.com/laurentdesmet)

## License

MIT
