export default class VASTTreeNode {
  constructor (vast, children = []) {
    this._vast = vast
    this._children = children
  }

  get vast () {
    return this._vast
  }

  get childNodes () {
    return this._children
  }

  get firstChild () {
    return this._children[0]
  }

  hasChildNodes () {
    return this._children.length > 0
  }
}
