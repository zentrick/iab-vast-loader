import EventEmitter from 'eventemitter3'
import fetch from 'isomorphic-fetch'
import parse from 'iab-vast-parser'
import { Wrapper } from 'iab-vast-model'
import VASTLoaderError from './loader-error'
import HTTPError from './http-error'
import atob from './atob'

const RE_DATA_URI = /^data:(.*?)(;\s*base64)?,(.*)/
const DEFAULT_OPTIONS = {
  maxDepth: 10,
  credentials: 'omit',
  timeout: 10000,
  noSingleAdPods: false,
  fetch
}

export { VASTLoaderError, HTTPError }

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
        const vast = parse(body, {
          noSingleAdPods: this._options.noSingleAdPods
        })
        vast.uri = uri
        this._emit('didParse', { uri, body, vast })
        if (vast.ads.length > 0) {
          const ad = vast.ads.get(0)
          if (ad instanceof Wrapper || ad.$type === 'Wrapper') {
            return this._loadWrapped(ad.vastAdTagURI, vast)
          }
        } else if (this._depth > 1) {
          let err = new VASTLoaderError(303, null, uri)
          err.data = uri
          throw err
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
    const fetching = this._fetchWithCredentials(uri)
    const timingOut = this._createTimeouter(fetching, uri)
    return Promise.race([fetching, timingOut])
      .then((response) => {
        timingOut.cancel()
        return response
      })
      .catch((err) => {
        timingOut.cancel()
        if (this._depth > 1) {
          throw new VASTLoaderError(301, null, uri)
        } else {
          throw err
        }
      })
  }

  _fetchWithCredentials (uri) {
    let { credentials } = this._options
    if (typeof credentials === 'function') {
      credentials = credentials(uri)
    }
    if (!Array.isArray(credentials)) {
      credentials = [credentials]
    }
    return credentials.reduce(
      (prev, cred) => prev.catch(() => this._tryFetch(uri, cred)),
      Promise.reject(new Error()))
  }

  _tryFetch (uri, credentials) {
    const { fetch } = this._options
    let headers
    return fetch(uri, { credentials })
      .then((response) => {
        if (!response.ok) {
          const httpError = new HTTPError(response.status, response.statusText)
          throw new VASTLoaderError(301, httpError, uri)
        } else {
          headers = response.headers
          return response.text()
        }
      })
      .then((body) => ({ headers, body }))
      .catch((error) => {
        this._emit('fetchError', { uri, credentials, error })
        throw error
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

  _emit (...args) {
    this._root.emit(...args)
  }
}
