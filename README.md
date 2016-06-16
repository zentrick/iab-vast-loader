# iab-vast-loader

[![npm](https://img.shields.io/npm/v/iab-vast-loader.svg)](https://www.npmjs.com/package/iab-vast-loader) [![Dependencies](https://img.shields.io/david/zentrick/iab-vast-loader.svg)](https://david-dm.org/zentrick/iab-vast-loader) [![Build Status](https://img.shields.io/travis/zentrick/iab-vast-loader/master.svg)](https://travis-ci.org/zentrick/iab-vast-loader) [![Coverage Status](https://img.shields.io/coveralls/zentrick/iab-vast-loader/master.svg)](https://coveralls.io/r/zentrick/iab-vast-loader) [![JavaScript Standard Style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](https://github.com/feross/standard)

Loads and parses IAB VAST tags, resolving wrapped tags along the way.

## Usage

```js
import VASTLoader from 'iab-vast-loader'

const tagUrl = 'https://example.com/vast.xml'

// Create the loader
const loader = new VASTLoader(tagUrl)

// Load the tag chain and await the resulting Promise
loader.load()
  .then((chain) => {
    console.info('Loaded VAST tags:', chain)
  })
  .catch((err) => {
    console.error('Error loading tag:', err)
  })
```

## API

```js
new VASTLoader(tagUrl[, options])
```

Currently, one `option` is supported: the `maxDepth` key allows you to specify
the maximum number of VAST documents to load within one chain. The default
value is 10.

```js
loader.load()
```

Returns a `Promise` for an array of `VAST` instances. The `VAST` class is
provided by [iab-vast-model](https://github.com/zentrick/iab-vast-model).

## Events

A `VASTLoader` is an `EventEmitter`. To be notified about progress, you can
subscribe to the events `willFetch`, `didFetch`, `willParse`, and `didParse`
as follows:

```js
loader
  .on('willFetch', ({uri}) => {
    console.info('Fetching', uri)
  })
  .on('didFetch', ({uri, body}) => {
    console.info('Fetched', body.length, 'bytes from', uri)
  })
  .on('willParse', ({uri, body}) => {
    console.info('Parsing', uri)
  })
  .on('willParse', ({uri, body, vast}) => {
    console.info('Parsed', uri)
  })
  .load()
  .then((chain) => {
    console.info('Loaded VAST tags:', chain)
  })
  .catch((err) => {
    console.error('Error loading tag:', err)
  })
```

## Maintainer

[Tim De Pauw](https://github.com/timdp)

## License

MIT
