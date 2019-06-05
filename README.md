# iab-vast-loader

[![npm](https://img.shields.io/npm/v/iab-vast-loader.svg)](https://www.npmjs.com/package/iab-vast-loader) [![Dependencies](https://img.shields.io/david/zentrick/iab-vast-loader.svg)](https://david-dm.org/zentrick/iab-vast-loader) [![Build Status](https://img.shields.io/circleci/project/github/zentrick/iab-vast-loader/master.svg)](https://circleci.com/gh/zentrick/iab-vast-loader) [![Coverage Status](https://img.shields.io/coveralls/zentrick/iab-vast-loader/master.svg)](https://coveralls.io/r/zentrick/iab-vast-loader) [![JavaScript Standard Style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](https://standardjs.com/)

Loads and parses IAB VAST tags, resolving wrapped tags along the way.

## Usage

```js
import { VASTLoader } from 'iab-vast-loader'

const tagUrl = 'https://example.com/vast.xml'

// Create the loader
const loader = new VASTLoader(tagUrl)

// Load the tag chain and await the resulting Promise
loader.load()
  .then(chain => {
    console.info('Loaded VAST tags:', chain)
  })
  .catch(err => {
    console.error('Error loading tag:', err)
  })
```

This should work in both Node.js version 8 and above as well as in the browser.
However, in the browser, you'll probably want to use a bundler first.

## API

```js
new VASTLoader(tagUrl[, options])
```

Creates a VAST loader.

```js
loader.load()
```

Returns a `Promise` for an array of `VAST` instances. The `VAST` class is
provided by [iab-vast-model](https://www.npmjs.com/package/iab-vast-model).

## Error Handling

In addition to `VASTLoader`, the main module also exports the `VASTLoaderError`
class, which maps errors to the VAST specification:

```js
import { VASTLoader, VASTLoaderError } from 'iab-vast-loader'

const loader = new VASTLoader(tagUrl)

loader.load()
  .catch(err => {
    if (err instanceof VASTLoaderError) {
      console.error('VAST error: ' + err.code + ' ' + err.message)
    } else {
      console.error('Unknown error: ' + err)
    }
  })
```

As with [iab-vast-model](https://www.npmjs.com/package/iab-vast-model), if
`instanceof` doesn't work for you, you may want to inspect `error.$type`
instead. This issue can occur if you load multiple versions of iab-vast-loader,
each with their own `VASTLoaderError` class.

## Options

### `maxDepth`

The maximum number of VAST documents to load within one chain. The default is
10.

### `timeout`

The maximum number of milliseconds to spend per HTTP request. The default is
10,000.

### `credentials`

Controls [CORS](https://en.wikipedia.org/wiki/Cross-origin_resource_sharing)
behavior. You can pass a string, an array of strings, or a function producing
either of those.

If you pass a string, it will be used as the value for the `credentials` option
to every request.
[Valid values](https://developer.mozilla.org/en-US/docs/Web/API/Request/credentials)
are `'omit'` (the default), `'same-origin'` and `'include'`.

If you pass an array, each of the values in the array will be tried
consecutively. For example, to first try each request with credentials and then
without, you can pass `['include', 'omit']`.

To control the behavior on a per-request basis, pass a function receiving the
request URL and returning one of the accepted values. For example:

```js
const loader = new VASTLoader(wrapperUrl, {
  credentials: uri => {
    if (uri.indexOf('.doubleclick.net/') >= 0) {
      return 'include'
    } else {
      return 'omit'
    }
  }
})
```

### `fetch`

Sets the implementation of
[`fetch`](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API), used to
make HTTP requests. In Node.js, this defaults to
[node-fetch](https://www.npmjs.com/package/node-fetch). In the browser,
[unfetch](https://www.npmjs.com/package/unfetch) is used.

## Events

A `VASTLoader` is an `EventEmitter`. To be notified about progress, you can
subscribe to the events `willFetch`, `didFetch`, `willParse`, and `didParse`
as follows:

```js
loader
  .on('willFetch', ({ uri }) => {
    console.info('Fetching', uri)
  })
  .on('didFetch', ({ uri, body }) => {
    console.info('Fetched', body.length, 'bytes from', uri)
  })
  .on('willParse', ({ uri, body }) => {
    console.info('Parsing', uri)
  })
  .on('didParse', ({ uri, body, vast }) => {
    console.info('Parsed', uri)
  })
  .load()
  .then(chain => {
    console.info('Loaded VAST tags:', chain)
  })
  .catch(err => {
    console.error('Error loading tag:', err)
  })
```

## Maintainer

[Tim De Pauw](https://github.com/timdp)

## License

MIT
