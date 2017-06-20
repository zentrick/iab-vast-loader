import { vastToAd } from '../../src'
import { buildVast, buildAd } from '../lib/build-vast'
import { TestScheduler } from 'rxjs/testing/TestScheduler'
import { VASTLoaderError } from '../../src/error'

const vast = buildVast()
const ad = buildAd(vast)

const assertDeepEqual = (actual, expected) => {
  expect(actual).to.deep.equal(expected)
}

// const createInputValues = vast =>
//   Object.keys(vast)
//     .reduce((acc, prop) => ({
//       ...acc,
//       [prop]: { type: 'VAST_LOADED', vast: vast[prop].model }
//     }))

describe('#vastToAd()', () => {
  let scheduler, cold

  beforeEach(() => {
    scheduler = new TestScheduler(assertDeepEqual)
    cold = scheduler.createColdObservable.bind(scheduler)
  })

  it('should map the vast$ to an ad$', () => {
    // --a----b--d-----e------(c|)
    // --(pq)-u--(yvw)-(zrs)--(xt|)

    const input$ = cold('--a----b--d-----e------(c|)', {
      a: { type: 'VAST_LOADED', vast: vast.a.model },
      b: { type: 'VAST_LOADED', vast: vast.b.model },
      d: { type: 'VAST_LOADED', vast: vast.d.model },
      e: { type: 'VAST_LOADED', vast: vast.e.model },
      c: { type: 'VAST_LOADED', vast: vast.c.model }
    })

    const actual$ = vastToAd(input$)
    const expected = '--(pq)-u--(yvw)-(zrs)--(xt|)'
    const values = {
      p: { type: 'AD_LOADED', ad: ad.p },
      q: { type: 'AD_LOADED', ad: ad.q },
      u: { type: 'AD_LOADED', ad: ad.u },
      y: { type: 'AD_LOADED', ad: ad.y },
      v: { type: 'AD_LOADED', ad: ad.v },
      w: { type: 'AD_LOADED', ad: ad.w },
      z: { type: 'AD_LOADED', ad: ad.z },
      r: { type: 'AD_LOADED', ad: ad.r },
      s: { type: 'AD_LOADED', ad: ad.s },
      x: { type: 'AD_LOADED', ad: ad.x },
      t: { type: 'AD_LOADED', ad: ad.t }
    }
    scheduler.expectObservable(actual$).toBe(expected, values)
    scheduler.flush()
  })

  it('should correctly map VAST_LOADING_FAILED actions to AD_LOADING_FAILED actions', () => {
    // --a----b--d-----e------(c|)
    // --(pq)-u--(yvw)-(zrs)--(xt|)

    const input$ = cold('--a----b--d-----e------(c|)', {
      a: { type: 'VAST_LOADED', vast: vast.a.model },
      b: { type: 'VAST_LOADED', vast: vast.b.model },
      d: { type: 'VAST_LOADING_FAILED', error: new VASTLoaderError('900'), wrapper: vast.b.model.ads[0] },
      e: { type: 'VAST_LOADED', vast: vast.e.model },
      c: { type: 'VAST_LOADING_FAILED', error: new VASTLoaderError('900'), wrapper: vast.a.model.ads[3] }
    })

    const actual$ = vastToAd(input$)
    const expected = '--(pq)-u--(yvw)-(zrs)--(xt|)'
    const values = {
      p: { type: 'AD_LOADED', ad: ad.p },
      q: { type: 'AD_LOADED', ad: ad.q },
      u: { type: 'AD_LOADED', ad: ad.u },
      y: { type: 'AD_LOADING_FAILED', error: new VASTLoaderError('900'), wrapper: vast.b.model.ads[0] },
      v: { type: 'AD_LOADED', ad: ad.v },
      w: { type: 'AD_LOADED', ad: ad.w },
      z: { type: 'AD_LOADED', ad: ad.z },
      r: { type: 'AD_LOADED', ad: ad.r },
      s: { type: 'AD_LOADED', ad: ad.s },
      x: { type: 'AD_LOADING_FAILED', error: new VASTLoaderError('900'), wrapper: vast.a.model.ads[3] },
      t: { type: 'AD_LOADED', ad: ad.t }
    }
    scheduler.expectObservable(actual$).toBe(expected, values)
    scheduler.flush()
  })

  it('should work correctly when the root VAST fails to download', () => {
    const input$ = cold('--(a|)', {
      a: { type: 'VAST_LOADING_FAILED', error: new VASTLoaderError('900'), wrapper: null }
    })

    const actual$ = vastToAd(input$)
    const expected = '--(p|)'
    const values = {
      p: { type: 'AD_LOADING_FAILED', error: new VASTLoaderError('900'), wrapper: null }
    }

    scheduler.expectObservable(actual$).toBe(expected, values)
    scheduler.flush()
  })
})
