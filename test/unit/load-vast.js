import { VAST } from 'iab-vast-model'
import parseVast from 'iab-vast-parser'
import { loadVast } from '../../src/load-vast'
import path from 'path'
import fs from 'fs'
import express from 'express'
import VASTLoaderError from '../../src/error'

import { TestScheduler } from 'rxjs/testing/TestScheduler'
import { Observable } from 'rxjs/Observable'
import 'rxjs/add/observable/timer'
import 'rxjs/add/operator/mergeMapTo'

import times from 'lodash/times'

const fixturesPath = path.resolve(__dirname, '../fixtures')

const buildVastVars = vastPath => {
  const url = 'http://192.168.1.200:8080/' + vastPath
  const str = fs.readFileSync(path.join(fixturesPath, vastPath), 'utf8')
  const model = parseVast(str)

  return { url, str, model }
}

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

describe('#loadVast()', () => {
  let scheduler, cold

  let vastA, vastB, vastC, vastD, vastE, vastStandalone

  before(() => {
    vastA = buildVastVars('vast-a.xml')
    vastB = buildVastVars('vast-b.xml')
    vastC = buildVastVars('vast-c.xml')
    vastD = buildVastVars('vast-d.xml')
    vastE = buildVastVars('vast-e.xml')
    vastStandalone = buildVastVars('vast-standalone.xml')

    vastB.model.parent = vastA.model.ads[1]
    vastC.model.parent = vastA.model.ads[3]
    vastD.model.parent = vastB.model.ads[0]
    vastE.model.parent = vastB.model.ads[2]
  })

  beforeEach(() => {
    scheduler = new TestScheduler(assertDeepEqual)
    monkeyPatch(scheduler)
    cold = scheduler.createColdObservable.bind(scheduler)
  })

  afterEach(() => {
    restore()
  })

  it('should load a VAST document', () => {
    const httpStub = sinon.stub()

    httpStub
      .onCall(0)
      .returns(cold('---(a|)', { a: vastStandalone.str }))

    httpStub.throws()

    const fx = {
      http: fxFactory(httpStub)
    }

    const actual$ = loadVast({ url: vastStandalone.url }, fx)

    const expected = '---(a|)'
    const values = { a: { type: 'VAST_LOADED', vast: vastStandalone.model } }

    scheduler.expectObservable(actual$).toBe(expected, values)
    scheduler.flush()

    expect(httpStub.callCount).to.equal(1)
    expect(httpStub.getCall(0).args).to.deep.equal([vastStandalone.url, { method: 'GET' }])
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
      .returns(cold('---(a|)', { a: vastStandalone.str }))

    httpStub.throws()

    const fx = {
      http: fxFactory(httpStub)
    }

    const actual$ = loadVast({ url: vastStandalone.url, retryCount: 2 }, fx)

    const expected = '---------(a|)'
    const values = { a: { type: 'VAST_LOADED', vast: vastStandalone.model } }

    scheduler.expectObservable(actual$).toBe(expected, values)
    scheduler.flush()

    expect(httpStub.callCount).to.equal(3)

    times(3, i => {
      expect(httpStub.getCall(i).args).to.deep.equal([vastStandalone.url, { method: 'GET' }])
    })
  })

  it('should load a complete VAST tree', async () => {
    // --(a|)
    //   -----(b|)
    //   --(c|)
    //        --(d|)
    //        -----(e|)
    // --a----b-d--(ec|)

    const httpStub = sinon.stub()

    const vastA$ = cold('--(a|)', { a: vastA.str })
    httpStub
      .onCall(0)
      .returns(vastA$)

    const vastB$ = cold('-----(b|)', { b: vastB.str })
    httpStub
      .onCall(1)
      .returns(vastB$)

    httpStub
      .onCall(2)
      .returns(cold('--(c|)', { c: vastC.str }))

    httpStub
      .onCall(3)
      .returns(cold('--(d|)', { d: vastD.str }))

    httpStub
      .onCall(4)
      .returns(cold('-----(e|)', { e: vastE.str }))

    httpStub.throws()

    const fx = {
      http: fxFactory(httpStub)
    }

    const actual$ = loadVast({ url: vastA.url }, fx)
    const expected = '--a----b-d--(ec|)'
    const values = {
      a: { type: 'VAST_LOADED', vast: vastA.model },
      b: { type: 'VAST_LOADED', vast: vastB.model },
      c: { type: 'VAST_LOADED', vast: vastC.model },
      d: { type: 'VAST_LOADED', vast: vastD.model },
      e: { type: 'VAST_LOADED', vast: vastE.model }
    }

    scheduler.expectObservable(actual$).toBe(expected, values)
    scheduler.expectSubscriptions(vastA$.subscriptions).toBe('^-!')
    scheduler.expectSubscriptions(vastB$.subscriptions).toBe('--^----!')
    scheduler.flush()

    expect(httpStub.callCount).to.equal(5)
    expect(httpStub.getCall(0).args).to.deep.equal([vastA.url, { method: 'GET' }])
    expect(httpStub.getCall(1).args).to.deep.equal([vastB.url, { method: 'GET' }])
    expect(httpStub.getCall(2).args).to.deep.equal([vastC.url, { method: 'GET' }])
    expect(httpStub.getCall(3).args).to.deep.equal([vastD.url, { method: 'GET' }])
    expect(httpStub.getCall(4).args).to.deep.equal([vastE.url, { method: 'GET' }])
  })

  it('should timeout when loading the VAST document', () => {
    const httpStub = sinon.stub()

    httpStub
      .onCall(0)
      .returns(cold('---(a|)', { a: vastStandalone.str }))

    httpStub.throws()

    const fx = {
      http: fxFactory(httpStub)
    }

    const actual$ = loadVast({ url: vastStandalone.url, timeout: 20 }, fx)
    const expected = '--(a|)'
    const values = {
      a: { type: 'VAST_LOADING_FAILED', error: new VASTLoaderError('900'), wrapper: null }
    }

    scheduler.expectObservable(actual$).toBe(expected, values)
    scheduler.flush()

    expect(httpStub.callCount).to.equal(1)
    expect(httpStub.getCall(0).args).to.deep.equal([vastStandalone.url, { method: 'GET' }])
  })

  it('should not fetch additional documents if maxDepth is exceeded', () => {
    // --(a|)
    //   -----(b|)
    //   --(c|)
    // --a----(bc|)

    const httpStub = sinon.stub()

    httpStub
      .onCall(0)
      .returns(cold('--(a|)', { a: vastA.str }))

    httpStub
      .onCall(1)
      .returns(cold('-----(b|)', { b: vastB.str }))

    httpStub
      .onCall(2)
      .returns(cold('--(c|)', { c: vastC.str }))

    httpStub.throws()

    const fx = {
      http: fxFactory(httpStub)
    }
    const actual$ = loadVast({ url: vastA.url, maxDepth: 1 }, fx)

    const expected = '--a----(bc|)'
    const values = {
      a: { type: 'VAST_LOADED', vast: vastA.model },
      b: { type: 'VAST_LOADED', vast: vastB.model },
      c: { type: 'VAST_LOADED', vast: vastC.model }
    }

    scheduler.expectObservable(actual$).toBe(expected, values)
    scheduler.flush()

    expect(httpStub.callCount).to.equal(3)
  })
})
