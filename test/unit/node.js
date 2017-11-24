import express from 'express'
import fetch from 'isomorphic-fetch'
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
      expect(error.message).to.equal('VAST error 301: Timeout of VAST URI provided in Wrapper element, or of VAST URI provided in a subsequent Wrapper element.')
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

  let server
  let baseUrl
  let responseDelay
  let localFetch
  let failOnCredentials

  const createLoader = (file, options) =>
    new VASTLoader(baseUrl + file, Object.assign({}, options, { fetch: localFetch }))

  before(function (cb) {
    const app = express()
    app.use((req, res, next) => {
      setTimeout(() => next(), responseDelay)
    })
    app.use(express.static(fixturesPath))
    server = app.listen(function () {
      baseUrl = 'http://localhost:' + server.address().port + '/'
      cb()
    })
  })

  after(function (cb) {
    server.close(cb)
  })

  beforeEach(function () {
    responseDelay = 0
    failOnCredentials = false
    localFetch = sinon.spy((uri, options) => {
      if (options.credentials === 'include' && failOnCredentials) {
        return Promise.reject(new Error('Credentials not allowed'))
      }
      if (uri in proxyPaths) {
        uri = baseUrl + proxyPaths[uri]
      }
      return fetch(uri, options)
    })
  })

  describe('#load()', function () {
    it('loads the InLine', async function () {
      const uri = 'tremor-video/vast_inline_linear.xml'
      const loader = createLoader(uri)
      const chain = await loader.load()
      expect(chain).to.be.an.instanceof(Array)
      expect(chain.length).to.equal(1)
      expect(chain[0].uri).to.equal(baseUrl + uri)
    })

    it('loads the Wrapper', async function () {
      const uri = 'tremor-video/vast_wrapper_linear_1.xml'
      const loader = createLoader(uri)
      const chain = await loader.load()
      expect(chain).to.be.an.instanceof(Array)
      expect(chain.length).to.equal(2)
      expect(chain[0].uri).to.equal(baseUrl + uri)
      expect(chain[1].uri).to.equal('http://demo.tremormedia.com/proddev/vast/vast_inline_linear.xml')
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
      expectLoaderError(error, 303, 'VAST error 303: No ads VAST response after one or more Wrappers. Also includes number of empty VAST responses from fallback.')
    })

    it('throws VAST 301 on invalid InLine inside Wrapper', async function () {
      let error
      try {
        const loader = createLoader('invalid-ads-wrapper.xml')
        await loader.load()
      } catch (err) {
        error = err
      }
      expectLoaderError(error, 301, 'VAST error 301: Timeout of VAST URI provided in Wrapper element, or of VAST URI provided in a subsequent Wrapper element.')
    })

    it('throws on HTTP errors', async function () {
      let error
      try {
        const loader = createLoader('four-oh-four')
        await loader.load()
      } catch (err) {
        error = err
      }
      expectLoaderError(error, 301, 'VAST error 301: Timeout of VAST URI provided in Wrapper element, or of VAST URI provided in a subsequent Wrapper element.', {status: 404, statusText: 'Not Found'})
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
        expect(spy.called).to.be.true()
      })
    }

    for (const type of ['willFetch', 'didFetch', 'willParse', 'didParse']) {
      it(`emits ${type} once per tag`, async function () {
        const spy = sinon.spy()
        const loader = createLoader('tremor-video/vast_wrapper_linear_1.xml')
        loader.on(type, spy)
        await loader.load()
        expect(spy.calledTwice).to.be.true()
      })
    }

    it('emits fetchError on fetch errors', async function () {
      const spy = sinon.spy()
      const loader = createLoader('four-oh-four')
      loader.on('fetchError', spy)
      try {
        await loader.load()
      } catch (err) {}
      expect(spy.callCount).to.equal(1)
    })

    it('emits error on errors', async function () {
      const spy = sinon.spy()
      const loader = createLoader('four-oh-four')
      loader.on('fetchError', spy)
      try {
        await loader.load()
      } catch (err) {}
      expect(spy.callCount).to.equal(1)
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
      expectLoaderError(error, 302, 'VAST error 302: Wrapper limit reached, as defined by the video player. Too many Wrapper responses have been received with no InLine response.')
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
      expectLoaderError(error, 301, 'VAST error 301: Timeout of VAST URI provided in Wrapper element, or of VAST URI provided in a subsequent Wrapper element.')
    })
  })

  describe('credentials option', function () {
    it('is "omit" by default', async function () {
      const loader = createLoader('tremor-video/vast_inline_linear.xml')
      await loader.load()
      expect(localFetch.callCount).to.equal(1)
      expect(localFetch.firstCall.args[1]).to.eql({ credentials: 'omit' })
    })

    it('overrides with a string value', async function () {
      const loader = createLoader('tremor-video/vast_inline_linear.xml', {
        credentials: 'include'
      })
      await loader.load()
      expect(localFetch.callCount).to.equal(1)
      expect(localFetch.firstCall.args[1]).to.eql({ credentials: 'include' })
    })

    it('overrides with a function value', async function () {
      const loader = createLoader('tremor-video/vast_inline_linear.xml', {
        credentials: (uri) => 'same-origin'
      })
      await loader.load()
      expect(localFetch.callCount).to.equal(1)
      expect(localFetch.firstCall.args[1]).to.eql({ credentials: 'same-origin' })
    })

    it('calls the function with the tag URI', async function () {
      const credentials = sinon.spy((uri) => 'same-origin')
      const file = 'tremor-video/vast_inline_linear.xml'
      const uri = baseUrl + file
      const loader = createLoader(file, {
        credentials
      })
      await loader.load()
      expect(localFetch.callCount).to.equal(1)
      expect(credentials).to.have.been.calledWith(uri)
    })

    it('falls through in array of values', async function () {
      failOnCredentials = true
      const loader = createLoader('tremor-video/vast_inline_linear.xml', {
        credentials: ['include', 'omit']
      }, true)
      await loader.load()
      expect(localFetch.callCount).to.equal(2)
      expect(localFetch.firstCall.args[1]).to.eql({ credentials: 'include' })
      expect(localFetch.secondCall.args[1]).to.eql({ credentials: 'omit' })
    })
  })
})
