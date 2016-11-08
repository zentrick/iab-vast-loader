import express from 'express'
import fsp from 'fs-promise'
import path from 'path'
import Loader from '../../src/'

describe('Loader', () => {
  const fixturesPath = path.resolve(__dirname, '../fixtures')
  const proxyFrom = 'http://demo.tremormedia.com/proddev/vast/vast_inline_linear.xml'
  const proxyTo = 'tremor-video/vast_inline_linear.xml'

  let oldFetch
  let server
  let baseUrl

  const createLoader = (file, options) => new Loader(baseUrl + file, options)

  const proxifyFetch = () => {
    oldFetch = Loader.prototype._fetch
    Loader.prototype._fetch = async function (uri) {
      if (uri === proxyFrom) {
        uri = baseUrl + proxyTo
      }
      return oldFetch.call(this, uri)
    }
  }

  const unproxifyFetch = () => {
    Loader.prototype._fetch = oldFetch
  }

  before((cb) => {
    const app = express()
    app.use(express.static(fixturesPath))
    server = app.listen(() => {
      baseUrl = 'http://localhost:' + server.address().port + '/'
      proxifyFetch()
      cb()
    })
  })

  after((cb) => {
    unproxifyFetch()
    server.close(cb)
  })

  describe('#load()', () => {
    it('loads the InLine', async () => {
      const loader = createLoader('tremor-video/vast_inline_linear.xml')
      const chain = await loader.load()
      expect(chain).to.be.an.instanceof(Array)
      expect(chain.length).to.equal(1)
    })

    it('loads the Wrapper', async () => {
      const loader = createLoader('tremor-video/vast_wrapper_linear_1.xml')
      const chain = await loader.load()
      expect(chain).to.be.an.instanceof(Array)
      expect(chain.length).to.equal(2)
    })

    it('loads the InLine as Base64', async () => {
      const file = path.join(fixturesPath, 'tremor-video/vast_inline_linear.xml')
      const base64 = (await fsp.readFile(file)).toString('base64')
      const dataUri = 'data:text/xml;base64,' + base64
      const loader = new Loader(dataUri)
      const chain = await loader.load()
      expect(chain).to.be.an.instanceof(Array)
      expect(chain.length).to.equal(1)
    })

    it('loads the InLine as XML', async () => {
      const file = path.join(fixturesPath, 'tremor-video/vast_inline_linear.xml')
      const xml = (await fsp.readFile(file, 'utf8')).replace(/\r?\n/g, '')
      const dataUri = 'data:text/xml,' + xml
      const loader = new Loader(dataUri)
      const chain = await loader.load()
      expect(chain).to.be.an.instanceof(Array)
      expect(chain.length).to.equal(1)
    })

    it('throws on tags without ads', () => {
      return expect((async () => {
        const loader = createLoader('no-ads.xml')
        await loader.load()
      })()).to.be.rejectedWith(Error, 'No ads found')
    })

    it('throws on HTTP errors', () => {
      return expect((async () => {
        const loader = createLoader('four-oh-four')
        await loader.load()
      })()).to.be.rejectedWith(Error, /404/)
    })
  })

  // TODO Test event data
  describe('#emit()', () => {
    for (const type of ['willFetch', 'didFetch', 'willParse', 'didParse']) {
      it(`emits ${type}`, async () => {
        const spy = sinon.spy()
        const loader = createLoader('tremor-video/vast_inline_linear.xml')
        loader.on(type, spy)
        await loader.load()
        expect(spy.called).to.be.true
      })
    }

    for (const type of ['willFetch', 'didFetch', 'willParse', 'didParse']) {
      it(`emits ${type} once per tag`, async () => {
        const spy = sinon.spy()
        const loader = createLoader('tremor-video/vast_wrapper_linear_1.xml')
        loader.on(type, spy)
        await loader.load()
        expect(spy.calledTwice).to.be.true
      })
    }

    it('emits error on errors', async () => {
      const spy = sinon.spy()
      const loader = createLoader('four-oh-four')
      loader.on('error', spy)
      try {
        await loader.load()
      } catch (err) {}
      expect(spy.calledOnce).to.be.true
    })
  })

  describe('maxDepth option', () => {
    it('throws when maxDepth is reached', async () => {
      return expect((async () => {
        const loader = createLoader('tremor-video/vast_wrapper_linear_1.xml', {
          maxDepth: 1
        })
        await loader.load()
      })()).to.be.rejectedWith(Error)
    })
  })

  describe('credentials option', () => {
    // TODO Inject fetch so we can make these more robust

    it('is "omit" by default', async () => {
      const loader = createLoader('tremor-video/vast_inline_linear.xml')
      const fetchOptions = loader._buildFetchOptions(
        'http://demo.tremormedia.com/proddev/vast/vast_inline_linear.xml')
      expect(fetchOptions).to.eql({ credentials: 'omit' })
    })

    it('overrides with a string value', async () => {
      const loader = createLoader('tremor-video/vast_inline_linear.xml', {
        credentials: 'include'
      })
      const fetchOptions = loader._buildFetchOptions(
        'http://demo.tremormedia.com/proddev/vast/vast_inline_linear.xml')
      expect(fetchOptions).to.eql({ credentials: 'include' })
    })

    it('overrides with a function value', async () => {
      const loader = createLoader('tremor-video/vast_inline_linear.xml', {
        credentials: (uri) => 'same-origin'
      })
      const fetchOptions = loader._buildFetchOptions(
        'http://demo.tremormedia.com/proddev/vast/vast_inline_linear.xml')
      expect(fetchOptions).to.eql({ credentials: 'same-origin' })
    })

    it('calls the function with the tag URI', async () => {
      const credentials = sinon.spy((uri) => 'same-origin')
      const loader = createLoader('tremor-video/vast_inline_linear.xml', {
        credentials
      })
      const uri = 'http://demo.tremormedia.com/proddev/vast/vast_inline_linear.xml'
      loader._buildFetchOptions(uri)
      expect(credentials).to.have.been.calledWith(uri)
    })
  })
})
