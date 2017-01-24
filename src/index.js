import EventEmitter from 'eventemitter3'
import fetch from 'isomorphic-fetch'
import parse from 'iab-vast-parser'
import { Wrapper } from 'iab-vast-model'
import VASTLoaderError from './error'
import atob from './atob'

const RE_DATA_URI = /^data:.*?(;\s*base64)?,(.*)/
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
    this._fetchOptions = this._buildFetchOptions()
  }

  load () {
    return this._load()
      .catch((error) => {
        this._emit('error', { error })
        throw error
      })
  }

  _load () {
    const uri = this._uri
    return Promise.resolve()
      .then(() => {
        this._emit('willFetch', { uri })
        const match = RE_DATA_URI.exec(uri)
        return (match == null) ? this._fetchUri()
          : (match[1] != null) ? atob(match[2])
          : decodeURIComponent(match[2])
      })
      .then((body) => {
        this._emit('didFetch', { uri, body })
        this._emit('willParse', { uri, body })
        const vast = parse(body)
        this._emit('didParse', { uri, body, vast })
        if (vast.ads.length > 0) {
          const ad = vast.ads.get(0)
          if (ad instanceof Wrapper || ad.$type === 'Wrapper') {
            return this._loadWrapped(ad.vastAdTagURI, vast)
          }
        } else if (this._depth > 1) {
          throw new VASTLoaderError(303)
        }
        return [vast]
      })
  }

  _loadWrapped (vastAdTagURI, vast) {
    return Promise.resolve()
      .then(() => {
        const { maxDepth } = this._options
        if (maxDepth > 0 && this._depth + 1 >= maxDepth) {
          throw new VASTLoaderError(302)
        }
        const childLoader = new Loader(vastAdTagURI, null, this)
        return childLoader.load()
      })
      .then((children) => {
        return [vast, ...children]
      })
  }

  _fetchUri () {
    const fetching = fetch(this._uri, this._fetchOptions)
    const timingOut = this._createTimeouter(fetching)
    return Promise.race([fetching, timingOut])
      .then((response) => {
        timingOut.cancel()
        if (!response.ok) {
          // TODO Convert response to HTTPError
          throw new VASTLoaderError(900, response)
        }
        return response.text()
      })
      .catch((err) => {
        timingOut.cancel()
        throw err
      })
  }

  _createTimeouter (fetching) {
    const ms = this._options.timeout
    let timeout = null
    const timingOut = new Promise((resolve, reject) => {
      timeout = setTimeout(() => {
        reject(new VASTLoaderError(301))
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

  _buildFetchOptions () {
    const { credentials } = this._options
    switch (typeof credentials) {
      case 'string': return { credentials }
      case 'function': return { credentials: credentials(this._uri) }
      default: throw new Error(`Invalid credentials option: ${credentials}`)
    }
  }

  _emit (...args) {
    this._root.emit(...args)
  }
}
