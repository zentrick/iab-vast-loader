// @flow

import { Observable } from 'rxjs/Observable'
import { type VAST, type Ad, Wrapper } from 'iab-vast-model'
import { type VastLoadAction } from './load-vast'
import { type VASTLoaderError } from './error'

type AdLoadedAction = { type: 'AD_LOADED', ad: Ad }

type AdLoadingFailedAction = { type: 'AD_LOADING_FAILED', error: VASTLoaderError, wrapper: ?Wrapper }

type AdLoadAction = AdLoadedAction | AdLoadingFailedAction

// This function returns a depth first preorder stream of inline elements of the VAST chain.
export const vastToAd = (vast$: Observable<VastLoadAction>): Observable<AdLoadAction> =>
  vast$
    .concatMap(action => {
      if (action.type === 'VAST_LOADED') {
        // VAST_LOADED
        const { vast } = action

        const ads = walkAdsUntilNextWrapper(vast, 0)

        return Observable.from(ads)
          .map(ad => ({
            type: 'AD_LOADED',
            ad
          }))
      } else {
        // VAST_LOADING_FAILED
        const { wrapper, error } = action

        const wrapperLoadingFailedAction = {
          type: 'AD_LOADING_FAILED',
          error,
          wrapper
        }

        const ads = wrapper == null
          // There will not be a wrapper when it's the root VAST of the tree.
          ? []
          // Emit the inline elements after the failed VAST.
          : walkAdsUntilNextWrapper(wrapper.parent, getWrapperIndex(wrapper) + 1)

        const adLoadedActions = ads
          .map(ad => ({
            type: 'AD_LOADED',
            ad
          }))

        return Observable.from([wrapperLoadingFailedAction, ...adLoadedActions])
      }
    })

const getWrapperIndex = (wrapper: Wrapper): number =>
  wrapper.parent.ads.indexOf(wrapper)

const walkAdsUntilNextWrapper = (vast: VAST, fromIndex: number): Ad[] => {
  const adsFromIndex = vast.ads.slice(fromIndex)
  const toIndex = adsFromIndex.findIndex(ad => ad instanceof Wrapper)

  const ads = toIndex === -1
    // All the inLines until the end of the array.
    ? vast.ads.slice(fromIndex)
    // An array of inLine ads, ending with one wrapper ad.
    : vast.ads.slice(fromIndex, fromIndex + toIndex + 1)

  if (toIndex === -1) {
    // This VAST file doesn't have Wrappers anymore so we can continue walking the tree upwards.
    const { parent: wrapper } = vast

    if (wrapper == null) {
      // We're at the top of the VAST tree so we can just return.
      return ads
    } else {
      // We call the function recursively for our parent with the correct fromIndex.
      return [
        ...ads,
        ...walkAdsUntilNextWrapper(wrapper.parent, getWrapperIndex(wrapper) + 1)
      ]
    }
  } else {
    // We arrived at the next wrapper so we can end our recursion here.
    return ads
  }
}
