import express from 'express'
import fsp from 'fs-promise'
import path from 'path'
import { default as VASTLoader, VASTLoaderError } from '../../src/'

const expectLoaderError = (error, code, message, cause) => {
  expect(error).to.be.an.instanceof(VASTLoaderError)
  expect(error.code).to.equal(code)
  expect(error.message).to.equal(message)
  if (cause != null) {
    expect(error.cause).to.include(cause)
  }
}

describe('VASTLoaderError', function () {
  describe('#code', function () {
    it('gets set from the constructor', function () {
      const error = new VASTLoaderError(301)
      expect(error.code).to.equal(301)
    })
  })

  describe('#message', function () {
    it('resolves from the code', function () {
      const error = new VASTLoaderError(301)
      expect(error.message).to.equal('Timeout.')
    })
  })

  describe('#cause', function () {
    it('gets set from the constructor', function () {
      const cause = new Error('Foo')
      const error = new VASTLoaderError(301, cause)
      expect(error.cause).to.equal(cause)
    })
  })

  describe('#$type', function () {
    it('is VASTLoaderError', function () {
      const error = new VASTLoaderError(900)
      expect(error.$type).to.equal('VASTLoaderError')
    })
  })
})

describe('VASTLoader', function () {
  const fixturesPath = path.resolve(__dirname, '../fixtures')
  const proxyPaths = {
    'http://demo.tremormedia.com/proddev/vast/vast_inline_linear.xml': 'tremor-video/vast_inline_linear.xml',
    'http://example.com/no-ads.xml': 'no-ads.xml',
    'http://example.com/invalid-ads.xml': 'invalid-ads.xml'
  }

  let fetchUriImpl
  let server
  let baseUrl
  let responseDelay

  const createLoader = (file, options) => new VASTLoader(baseUrl + file, options)

  const proxifyFetchUri = function () {
    fetchUriImpl = VASTLoader.prototype._fetchUri
    VASTLoader.prototype._fetchUri = async function () {
      const target = proxyPaths[this._uri]
      if (target == null) {
        return await fetchUriImpl.call(this)
      }
      const oldUri = this._uri
      this._uri = baseUrl + target
      try {
        return await fetchUriImpl.call(this)
      } finally {
        this._uri = oldUri
      }
    }
  }

  const unproxifyFetchUri = function () {
    VASTLoader.prototype._fetchUri = fetchUriImpl
  }

  before(function (cb) {
    const app = express()
    app.use((req, res, next) => {
      setTimeout(() => next(), responseDelay)
    })
    app.use(express.static(fixturesPath))
    server = app.listen(function () {
      baseUrl = 'http://localhost:' + server.address().port + '/'
      proxifyFetchUri()
      cb()
    })
  })

  after(function (cb) {
    unproxifyFetchUri()
    server.close(cb)
  })

  beforeEach(function () {
    responseDelay = 0
  })

  describe('#load()', function () {
    it('loads the InLine', async function () {
      const loader = createLoader('tremor-video/vast_inline_linear.xml')
      const chain = await loader.load()
      expect(chain).to.be.an.instanceof(Array)
      expect(chain.length).to.equal(1)
    })

    it('loads the Wrapper', async function () {
      const loader = createLoader('tremor-video/vast_wrapper_linear_1.xml')
      const chain = await loader.load()
      expect(chain).to.be.an.instanceof(Array)
      expect(chain.length).to.equal(2)
    })

    it('loads the InLine as Base64', async function () {
      const file = path.join(fixturesPath, 'tremor-video/vast_inline_linear.xml')
      const base64 = (await fsp.readFile(file)).toString('base64')
      const dataUri = 'data:text/xml;base64,' + base64
      const loader = new VASTLoader(dataUri)
      const chain = await loader.load()
      expect(chain).to.be.an.instanceof(Array)
      expect(chain.length).to.equal(1)
    })

    it('loads the InLine as XML', async function () {
      const file = path.join(fixturesPath, 'tremor-video/vast_inline_linear.xml')
      const xml = (await fsp.readFile(file, 'utf8')).replace(/\r?\n/g, '')
      const dataUri = 'data:text/xml,' + xml
      const loader = new VASTLoader(dataUri)
      const chain = await loader.load()
      expect(chain).to.be.an.instanceof(Array)
      expect(chain.length).to.equal(1)
    })

    it('loads the empty tag', async function () {
      const loader = createLoader('no-ads.xml')
      const chain = await loader.load()
      expect(chain.length).to.equal(1)
      expect(chain[0].ads.length).to.equal(0)
    })

    it('throws VAST 303 on empty InLine inside Wrapper', async function () {
      let error
      try {
        const loader = createLoader('no-ads-wrapper.xml')
        await loader.load()
      } catch (err) {
        error = err
      }
      expectLoaderError(error, 303, 'No Ads VAST response after one or more Wrappers.')
    })

    it('throws VAST 301 on invalid InLine inside Wrapper', async function () {
      let error
      try {
        const loader = createLoader('invalid-ads-wrapper.xml')
        await loader.load()
      } catch (err) {
        error = err
      }
      expectLoaderError(error, 301, 'Timeout.')
    })

    it('throws on HTTP errors', async function () {
      let error
      try {
        const loader = createLoader('four-oh-four')
        await loader.load()
      } catch (err) {
        error = err
      }
      expectLoaderError(error, 900, 'Undefined error.', {status: 404, statusText: 'Not Found'})
    })
  })

  // TODO Test event data
  describe('#emit()', function () {
    for (const type of ['willFetch', 'didFetch', 'willParse', 'didParse']) {
      it(`emits ${type}`, async function () {
        const spy = sinon.spy()
        const loader = createLoader('tremor-video/vast_inline_linear.xml')
        loader.on(type, spy)
        await loader.load()
        expect(spy.called).to.be.true
      })
    }

    for (const type of ['willFetch', 'didFetch', 'willParse', 'didParse']) {
      it(`emits ${type} once per tag`, async function () {
        const spy = sinon.spy()
        const loader = createLoader('tremor-video/vast_wrapper_linear_1.xml')
        loader.on(type, spy)
        await loader.load()
        expect(spy.calledTwice).to.be.true
      })
    }

    it('emits error on errors', async function () {
      const spy = sinon.spy()
      const loader = createLoader('four-oh-four')
      loader.on('error', spy)
      try {
        await loader.load()
      } catch (err) {}
      expect(spy.calledOnce).to.be.true
    })
  })

  describe('maxDepth option', function () {
    it('throws when maxDepth is reached', async function () {
      let error
      try {
        const loader = createLoader('tremor-video/vast_wrapper_linear_1.xml', {
          maxDepth: 1
        })
        await loader.load()
      } catch (err) {
        error = err
      }
      expectLoaderError(error, 302, 'Wrapper limit reached.')
    })
  })

  describe('timeout option', function () {
    it('throws when timeout is reached', async function () {
      responseDelay = 100
      let error
      try {
        const loader = createLoader('no-ads.xml', {
          timeout: 10
        })
        await loader.load()
      } catch (err) {
        error = err
      }
      expectLoaderError(error, 301, 'Timeout.')
    })
  })

  describe('credentials option', function () {
    // TODO Use something nicer than inspecting private _fetchOptions

    it('is "omit" by default', function () {
      const loader = createLoader('tremor-video/vast_inline_linear.xml')
      expect(loader._fetchOptions).to.eql({ credentials: 'omit' })
    })

    it('overrides with a string value', function () {
      const loader = createLoader('tremor-video/vast_inline_linear.xml', {
        credentials: 'include'
      })
      expect(loader._fetchOptions).to.eql({ credentials: 'include' })
    })

    it('overrides with a function value', function () {
      const loader = createLoader('tremor-video/vast_inline_linear.xml', {
        credentials: (uri) => 'same-origin'
      })
      expect(loader._fetchOptions).to.eql({ credentials: 'same-origin' })
    })

    it('calls the function with the tag URI', function () {
      const credentials = sinon.spy((uri) => 'same-origin')
      const file = 'tremor-video/vast_inline_linear.xml'
      const uri = baseUrl + file
      createLoader(file, {
        credentials
      })
      expect(credentials).to.have.been.calledWith(uri)
    })

    it('throws if neither a string nor a function provided', function () {
      expect(function () {
        createLoader('tremor-video/vast_inline_linear.xml', {
          credentials: true
        })
      }).to.throw(Error, 'Invalid credentials option: true')
    })
  })
})
