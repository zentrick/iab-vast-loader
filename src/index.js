import EventEmitter from 'eventemitter3'
import fetch from 'isomorphic-fetch'
import parse from 'iab-vast-parser'
import { Wrapper } from 'iab-vast-model'
import atob from './atob'

const RE_DATA_URI = /^data:.*?(;\s*base64)?,(.*)/
const DEFAULT_OPTIONS = {
  maxDepth: 10,
  credentials: 'omit'
}

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

  async load () {
    let result = null
    try {
      result = await this._load()
    } catch (error) {
      this._emit('error', { error })
      throw error
    }
    return result
  }

  async _load () {
    const uri = this._uri
    this._emit('willFetch', { uri })
    const body = await this._acquire(uri)
    this._emit('didFetch', { uri, body })
    this._emit('willParse', { uri, body })
    const vast = parse(body)
    this._emit('didParse', { uri, body, vast })
    if (vast.ads.length === 0) {
      throw new Error('No ads found')
    }
    const ad = vast.ads.get(0)
    return (ad instanceof Wrapper || ad.$type === 'Wrapper')
      ? this._loadWrapped(ad.vastAdTagURI, vast)
      : [vast]
  }

  async _loadWrapped (vastAdTagURI, vast) {
    const { maxDepth } = this._options
    if (maxDepth > 0 && this._depth + 1 >= maxDepth) {
      throw new Error(`Maximum VAST chain length of ${maxDepth} reached`)
    }
    const childLoader = new Loader(vastAdTagURI, null, this)
    const children = await childLoader.load()
    return [vast, ...children]
  }

  async _acquire (uri) {
    const that = this // Workaround for async-to-promises binding issue
    const match = RE_DATA_URI.exec(uri)
    return (match == null) ? await that._fetch(uri)
      : (match[1] != null) ? atob(match[2])
      : match[2]
  }

  async _fetch (uri) {
    const options = this._buildFetchOptions(uri)
    const response = await fetch(uri, options)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }
    return await response.text()
  }

  _buildFetchOptions (uri) {
    const { credentials } = this._options
    const type = typeof credentials
    const cred = (type === 'string') ? credentials
      : (type === 'function') ? credentials(uri)
      : 'omit'
    return { credentials: cred }
  }

  _emit (...args) {
    this._root.emit(...args)
  }
}
