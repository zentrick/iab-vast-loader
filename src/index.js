import EventEmitter from 'eventemitter3'
import parse from 'iab-vast-parser'
import {Wrapper} from 'iab-vast-model'
import fetch from 'isomorphic-fetch'

const DEFAULT_OPTIONS = {
  maxDepth: 10
}

export default class Loader extends EventEmitter {
  constructor (uri, options, parent) {
    super()
    this._uri = uri
    if (parent != null) {
      this._root = parent._root
      this._options = this._root.options
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
      this._emit('error', {error})
      throw error
    }
    return result
  }

  async _load () {
    const uri = this._uri
    this._emit('willFetch', {uri})
    const body = await this._fetch(uri)
    this._emit('didFetch', {uri, body})
    this._emit('willParse', {uri, body})
    const vast = parse(body)
    this._emit('didParse', {uri, body, vast})
    if (vast.ads.length === 0) {
      throw new Error('No ads found')
    }
    const ad = vast.ads.get(0)
    return (ad instanceof Wrapper)
      ? this._loadWrapped(ad.vastAdTagURI, vast)
      : [vast]
  }

  async _loadWrapped (vastAdTagURI, vast) {
    const {maxDepth} = this._options
    if (maxDepth > 0 && this._depth + 1 >= maxDepth) {
      throw new Error(`Maximum VAST chain length of ${maxDepth} reached`)
    }
    const childLoader = new Loader(vastAdTagURI, null, this)
    const children = await childLoader.load()
    return [vast, ...children]
  }

  async _fetch (uri) {
    const resp = await fetch(uri)
    return await resp.text()
  }

  _emit (...args) {
    this._root.emit(...args)
  }
}
