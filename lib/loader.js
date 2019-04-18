import EventEmitter from 'eventemitter3'
import parse from 'iab-vast-parser'
import { Wrapper } from 'iab-vast-model'
import { VASTLoaderError } from './loader-error'
import { HTTPError } from './http-error'

const RE_DATA_URI = /^data:(.*?)(;\s*base64)?,(.*)/

const DEFAULT_OPTIONS = {
  maxDepth: 10,
  credentials: 'omit',
  timeout: 10000,
  noSingleAdPods: false
}

class VASTLoader extends EventEmitter {
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
      this._fetch =
        this._options.fetch != null ? this._options.fetch : VASTLoader.fetch
    }
  }

  load () {
    return this._load(this._uri).catch(error => {
      this._emit('error', { error })
      throw error
    })
  }

  _load (uri) {
    return Promise.resolve()
      .then(() => {
        this._emit('willFetch', { uri })
        const match = RE_DATA_URI.exec(uri)
        return match == null
          ? this._fetchUri(uri)
          : this._parseDataUri(match[3], match[1], match[2] != null)
      })
      .then(({ body, headers }) => {
        this._emit('didFetch', { uri, body, headers })
        this._emit('willParse', { uri, body, headers })
        const vast = parse(body, {
          noSingleAdPods: this._options.noSingleAdPods
        })
        vast.uri = uri
        this._emit('didParse', { uri, body, headers, vast })
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
    return { data: isBase64 ? VASTLoader.atob(data) : decodeURIComponent(data) }
  }

  _loadWrapped (vastAdTagURI, vast) {
    return Promise.resolve()
      .then(() => {
        const { maxDepth } = this._options
        if (maxDepth > 0 && this._depth + 1 >= maxDepth) {
          throw new VASTLoaderError(302, null, vastAdTagURI)
        }
        const childLoader = new VASTLoader(vastAdTagURI, null, this)
        return childLoader.load()
      })
      .then(children => [vast, ...children])
  }

  _fetchUri (uri) {
    const fetching = this._fetchWithCredentials(uri)
    const timingOut = this._createTimeouter(fetching, uri)
    return Promise.race([fetching, timingOut])
      .then(response => {
        timingOut.cancel()
        return response
      })
      .catch(err => {
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
      Promise.reject(new Error())
    )
  }

  _tryFetch (uri, credentials) {
    return this._root
      ._fetch(uri, { credentials })
      .then(response => {
        if (!response.ok) {
          const httpError = new HTTPError(response.status, response.statusText)
          throw new VASTLoaderError(301, httpError, uri)
        } else {
          return Promise.all([response.text(), response.headers])
        }
      })
      .then(([body, headers]) => ({
        body,
        headers
      }))
      .catch(error => {
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

export { VASTLoader }
