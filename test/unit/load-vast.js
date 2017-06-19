import { loadVast } from '../../src'
import VASTLoaderError from '../../src/error'
import { buildVast } from '../lib/build-vast'
import { fx } from '../../src/rxjs-fx'

import { TestScheduler } from 'rxjs/testing/TestScheduler'
import { Observable } from 'rxjs/Observable'

import times from 'lodash/times'

let originalTimeout

const monkeyPatch = (scheduler) => {
  originalTimeout = Observable.prototype.timeout

  Observable.prototype.timeout = function (due) {
    return originalTimeout.call(this, due, scheduler)
  }
}

const restore = () => {
  Observable.prototype.timeout = originalTimeout
}

const fxFactory = mock => (...args) => Observable.defer(() => mock(...args))

const assertDeepEqual = (actual, expected) => {
  expect(actual).to.deep.equal(expected)
}

const vast = buildVast()

describe('#loadVast()', () => {
  let scheduler, cold, http

  beforeEach(() => {
    scheduler = new TestScheduler(assertDeepEqual)
    monkeyPatch(scheduler)
    cold = scheduler.createColdObservable.bind(scheduler)
    // http will be stubbed in each test so we keep a reference to the original.
    http = fx.http
  })

  afterEach(() => {
    restore()
    // We restore the original http function.
    fx.http = http
  })

  it('should load a VAST document', () => {
    const httpStub = sinon.stub()

    httpStub
      .onCall(0)
      .returns(cold('---(a|)', { a: vast.standalone.str }))

    httpStub.throws()

    fx.http = fxFactory(httpStub)

    const actual$ = loadVast({ url: vast.standalone.url })

    const expected = '---(a|)'
    const values = { a: { type: 'VAST_LOADED', vast: vast.standalone.model } }

    scheduler.expectObservable(actual$).toBe(expected, values)
    scheduler.flush()

    expect(httpStub.callCount).to.equal(1)
    expect(httpStub.getCall(0).args).to.deep.equal([vast.standalone.url, { method: 'GET', credentials: 'omit' }])
  })

  it('should load a VAST document by racing the passed credentials strategies and ignoring failed requests', () => {
    // ----(a|)
    // ---(a|)
    // --(#|)
    // ---(a|)

    const httpStub = sinon.stub()
    const credentialStub = sinon.stub()

    httpStub
      .onCall(0)
      .returns(cold('----(a|)', { a: vast.standalone.str }))

    httpStub
      .onCall(1)
      .returns(cold('---(a|)', { a: vast.standalone.str }))

    httpStub
      .onCall(2)
      .returns(cold('--(#|)', null, new Error('http failed')))

    httpStub.throws()

    credentialStub
      .onCall(0)
      .returns('include')

    credentialStub.throws()

    fx.http = fxFactory(httpStub)

    const actual$ = loadVast({
      url: vast.standalone.url,
      credentials: [
        'omit',
        'same-origin',
        credentialStub
      ]
    })

    const expected = '---(a|)'
    const values = { a: { type: 'VAST_LOADED', vast: vast.standalone.model } }

    scheduler.expectObservable(actual$).toBe(expected, values)
    scheduler.flush()

    expect(httpStub.callCount).to.equal(3)
    expect(httpStub.getCall(0).args).to.deep.equal([vast.standalone.url, { method: 'GET', credentials: 'omit' }])
    expect(httpStub.getCall(1).args).to.deep.equal([vast.standalone.url, { method: 'GET', credentials: 'same-origin' }])
    expect(httpStub.getCall(2).args).to.deep.equal([vast.standalone.url, { method: 'GET', credentials: 'include' }])

    expect(credentialStub.callCount).to.equal(1)
    expect(credentialStub.getCall(0).args).to.deep.equal([vast.standalone.url])
  })

  it('should retry loading a VAST document', () => {
    const httpStub = sinon.stub()

    httpStub
      .onCall(0)
      .returns(cold('---(#|)', null, new Error('http failed')))

    httpStub
      .onCall(1)
      .returns(cold('---(#|)', null, new Error('http failed')))

    httpStub
      .onCall(2)
      .returns(cold('---(a|)', { a: vast.standalone.str }))

    httpStub.throws()

    fx.http = fxFactory(httpStub)

    const actual$ = loadVast({ url: vast.standalone.url, retryCount: 2 })

    const expected = '---------(a|)'
    const values = { a: { type: 'VAST_LOADED', vast: vast.standalone.model } }

    scheduler.expectObservable(actual$).toBe(expected, values)
    scheduler.flush()

    expect(httpStub.callCount).to.equal(3)

    times(3, i => {
      expect(httpStub.getCall(i).args).to.deep.equal([vast.standalone.url, { method: 'GET', credentials: 'omit' }])
    })
  })

  it('should load a complete VAST tree', async () => {
    const httpStub = sinon.stub()

    const vastA$ = cold('--(a|)', { a: vast.a.str })
    httpStub
      .onCall(0)
      .returns(vastA$)

    const vastB$ = cold('-----(b|)', { b: vast.b.str })
    httpStub
      .onCall(1)
      .returns(vastB$)

    httpStub
      .onCall(2)
      .returns(cold('--(c|)', { c: vast.c.str }))

    httpStub
      .onCall(3)
      .returns(cold('--(d|)', { d: vast.d.str }))

    httpStub
      .onCall(4)
      .returns(cold('-----(e|)', { e: vast.e.str }))

    httpStub.throws()

    fx.http = fxFactory(httpStub)

    const actual$ = loadVast({ url: vast.a.url })
    const expected = '--a----b-d--(ec|)'
    const values = {
      a: { type: 'VAST_LOADED', vast: vast.a.model },
      b: { type: 'VAST_LOADED', vast: vast.b.model },
      c: { type: 'VAST_LOADED', vast: vast.c.model },
      d: { type: 'VAST_LOADED', vast: vast.d.model },
      e: { type: 'VAST_LOADED', vast: vast.e.model }
    }

    scheduler.expectObservable(actual$).toBe(expected, values)
    scheduler.expectSubscriptions(vastA$.subscriptions).toBe('^-!')
    scheduler.expectSubscriptions(vastB$.subscriptions).toBe('--^----!')
    scheduler.flush()

    expect(httpStub.callCount).to.equal(5)
    expect(httpStub.getCall(0).args).to.deep.equal([vast.a.url, { method: 'GET', credentials: 'omit' }])
    expect(httpStub.getCall(1).args).to.deep.equal([vast.b.url, { method: 'GET', credentials: 'omit' }])
    expect(httpStub.getCall(2).args).to.deep.equal([vast.c.url, { method: 'GET', credentials: 'omit' }])
    expect(httpStub.getCall(3).args).to.deep.equal([vast.d.url, { method: 'GET', credentials: 'omit' }])
    expect(httpStub.getCall(4).args).to.deep.equal([vast.e.url, { method: 'GET', credentials: 'omit' }])
  })

  it('should return a VAST_LOADING_FAILED action when the root VAST document timeouts', () => {
    const httpStub = sinon.stub()

    httpStub
      .onCall(0)
      .returns(cold('---(a|)', { a: vast.standalone.str }))

    httpStub.throws()

    fx.http = fxFactory(httpStub)

    const actual$ = loadVast({ url: vast.standalone.url, timeout: 20 })
    const expected = '--(a|)'
    const values = {
      a: { type: 'VAST_LOADING_FAILED', error: new VASTLoaderError('900'), wrapper: null }
    }

    scheduler.expectObservable(actual$).toBe(expected, values)
    scheduler.flush()

    expect(httpStub.callCount).to.equal(1)
    expect(httpStub.getCall(0).args).to.deep.equal([vast.standalone.url, { method: 'GET', credentials: 'omit' }])
  })

  describe('', () => {
    let vastBParent
    before(() => {
      // Temporarily reset the parent of vast.b
      vastBParent = vast.b.model.parent
      vast.b.model.parent = null
    })

    it('should return a VAST_LOADING_FAILED action when a non-root VAST document timeouts', () => {
      // --(b|)
      //   -----(#|)
      //   --(e|)
      // --b----(de|)

      const httpStub = sinon.stub()

      httpStub
        .onCall(0)
        .returns(cold('--(b|)', { b: vast.b.str }))

      httpStub
        .onCall(1)
        .returns(cold('-----(#|)', null, new Error('http failed')))

      httpStub
        .onCall(2)
        .returns(cold('--(e|)', { e: vast.e.str }))

      httpStub.throws()

      fx.http = fxFactory(httpStub)

      const actual$ = loadVast({ url: vast.b.url })
      const expected = '--b----(de|)'
      const values = {
        b: { type: 'VAST_LOADED', vast: vast.b.model },
        d: { type: 'VAST_LOADING_FAILED', error: new VASTLoaderError('301'), wrapper: vast.b.model.ads[0] },
        e: { type: 'VAST_LOADED', vast: vast.e.model }
      }

      scheduler.expectObservable(actual$).toBe(expected, values)
      scheduler.flush()

      expect(httpStub.callCount).to.equal(3)
      expect(httpStub.getCall(0).args).to.deep.equal([vast.b.url, { method: 'GET', credentials: 'omit' }])
      expect(httpStub.getCall(1).args).to.deep.equal([vast.d.url, { method: 'GET', credentials: 'omit' }])
      expect(httpStub.getCall(2).args).to.deep.equal([vast.e.url, { method: 'GET', credentials: 'omit' }])
    })

    after(() => {
      vast.b.model.parent = vastBParent
    })
  })

  it('should return a VAST_LOADING_FAILED action when the XML document is not valid', () => {
    const httpStub = sinon.stub()

    httpStub
      .onCall(0)
      .returns(cold('---(a|)', { a: 'malformed xml' }))

    httpStub.throws()

    fx.http = fxFactory(httpStub)

    const actual$ = loadVast({ url: vast.standalone.url })
    const expected = '---(a|)'
    const values = {
      a: { type: 'VAST_LOADING_FAILED', error: new VASTLoaderError('100'), wrapper: null }
    }

    scheduler.expectObservable(actual$).toBe(expected, values)
    scheduler.flush()

    expect(httpStub.callCount).to.equal(1)
    expect(httpStub.getCall(0).args).to.deep.equal([vast.standalone.url, { method: 'GET', credentials: 'omit' }])
  })

  it('should not fetch additional documents if maxDepth is exceeded', () => {
    // --(a|)
    //   -----(b|)
    //   --(c|)
    // --a----(bdec|)

    const httpStub = sinon.stub()

    httpStub
      .onCall(0)
      .returns(cold('--(a|)', { a: vast.a.str }))

    httpStub
      .onCall(1)
      .returns(cold('-----(b|)', { b: vast.b.str }))

    httpStub
      .onCall(2)
      .returns(cold('--(c|)', { c: vast.c.str }))

    httpStub.throws()

    fx.http = fxFactory(httpStub)
    const actual$ = loadVast({ url: vast.a.url, maxDepth: 1 })

    const expected = '--a----(bdec|)'
    const values = {
      a: { type: 'VAST_LOADED', vast: vast.a.model },
      b: { type: 'VAST_LOADED', vast: vast.b.model },
      d: { type: 'VAST_LOADING_FAILED', wrapper: vast.b.model.ads[0], error: new VASTLoaderError('302') },
      e: { type: 'VAST_LOADING_FAILED', wrapper: vast.b.model.ads[2], error: new VASTLoaderError('302') },
      c: { type: 'VAST_LOADED', vast: vast.c.model }
    }

    scheduler.expectObservable(actual$).toBe(expected, values)
    scheduler.flush()

    expect(httpStub.callCount).to.equal(3)
    expect(httpStub.getCall(0).args).to.deep.equal([vast.a.url, { method: 'GET', credentials: 'omit' }])
    expect(httpStub.getCall(1).args).to.deep.equal([vast.b.url, { method: 'GET', credentials: 'omit' }])
    expect(httpStub.getCall(2).args).to.deep.equal([vast.c.url, { method: 'GET', credentials: 'omit' }])
  })
})
