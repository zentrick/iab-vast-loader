import EventEmitter from 'eventemitter3'
import fetch from 'isomorphic-fetch'
import parse from 'iab-vast-parser'
import { Wrapper } from 'iab-vast-model'
import VASTLoaderError from './error'
import atob from './atob'

const RE_DATA_URI = /^data:(.*?)(;\s*base64)?,(.*)/
const DEFAULT_OPTIONS = {
  maxDepth: 10,
  credentials: 'omit',
  timeout: 10000
}

export { VASTLoaderError }

export default class Loader extends EventEmitter {
  constructor (uri, options, parent) {
    super()
    this._uri = uri
    if (parent != null) {
      this._root = parent._root
      this._options = this._root._options
      this._depth = parent._depth + 1
    } else {
      this._root = this
      this._options = Object.assign({}, DEFAULT_OPTIONS, options)
      this._depth = 1
    }
    this._fetchOptions = this._buildFetchOptions(uri)
  }

  load () {
    return this._load(this._uri)
      .catch((error) => {
        this._emit('error', { error })
        throw error
      })
  }

  _load (uri) {
    return Promise.resolve()
      .then(() => {
        this._emit('willFetch', { uri })
        const match = RE_DATA_URI.exec(uri)
        return (match == null) ? this._fetchUri(uri)
          : this._parseDataUri(match[3], match[1], (match[2] != null))
      })
      .then(({ headers, body }) => {
        this._emit('didFetch', { uri, headers, body })
        this._emit('willParse', { uri, body })
        const vast = parse(body)
        this._emit('didParse', { uri, body, vast })
        if (vast.ads.length > 0) {
          const ad = vast.ads.get(0)
          if (ad instanceof Wrapper || ad.$type === 'Wrapper') {
            return this._loadWrapped(ad.vastAdTagURI, vast)
          }
        } else if (this._depth > 1) {
          throw new VASTLoaderError(303, null, uri)
        }
        return [vast]
      })
  }

  _parseDataUri (data, mimeType, isBase64) {
    const headers = new Headers({ 'Content-Type': mimeType })
    const body = isBase64 ? atob(data) : decodeURIComponent(data)
    return { headers, body }
  }

  _loadWrapped (vastAdTagURI, vast) {
    return Promise.resolve()
      .then(() => {
        const { maxDepth } = this._options
        if (maxDepth > 0 && this._depth + 1 >= maxDepth) {
          throw new VASTLoaderError(302, null, vastAdTagURI)
        }
        const childLoader = new Loader(vastAdTagURI, null, this)
        return childLoader.load()
      })
      .then((children) => ([vast, ...children]))
  }

  _fetchUri (uri) {
    const fetching = fetch(uri, this._fetchOptions)
    const timingOut = this._createTimeouter(fetching, uri)
    let headers
    return Promise.race([fetching, timingOut])
      .then((response) => {
        timingOut.cancel()
        if (!response.ok) {
          // TODO Convert response to HTTPError
          throw new VASTLoaderError(900, response, uri)
        }
        headers = response.headers
        return response.text()
      })
      .then((body) => ({ headers, body }))
      .catch((err) => {
        timingOut.cancel()
        if (this._depth > 1) {
          throw new VASTLoaderError(301, null, uri)
        } else {
          throw err
        }
      })
  }

  _createTimeouter (fetching, uri) {
    const ms = this._options.timeout
    let timeout = null
    const timingOut = new Promise((resolve, reject) => {
      timeout = setTimeout(() => {
        reject(new VASTLoaderError(301, null, uri))
      }, ms)
    })
    timingOut.cancel = () => {
      if (timeout != null) {
        clearTimeout(timeout)
        timeout = null
      }
    }
    return timingOut
  }

  _buildFetchOptions (uri) {
    const { credentials } = this._options
    switch (typeof credentials) {
      case 'string': return { credentials }
      case 'function': return { credentials: credentials(uri) }
      default: throw new Error(`Invalid credentials option: ${credentials}`)
    }
  }

  _emit (...args) {
    this._root.emit(...args)
  }
}
