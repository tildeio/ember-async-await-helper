import Component from '@ember/component';
import { bind } from '@ember/runloop';
import Ember from 'ember';
import layout from '../templates/components/async-await';

/**
  Used for uninitialized values so that we can distinguish them from values that
  were intentionally set to `null`/`undefined` in the console.

  @private
  @method UNINITIALIZED
  @returns undefined
*/
function UNINITIALIZED() {}

function DEFAULT_REJECTION_HANDLER(reason) {
  try {
    let error = new Error(`Unhandled promise rejection in {{#async-await}}: ${reason}`);
    error.reason = reason;
    throw error;
  } catch(error) {
    Ember.onerror(error);
  }
}

/**
  This component awaits a promise (passed as a positional param), then yields
  the resolved value to the given block. Thus, the code within the block can be
  synchronous.

  Optionally, pass in an inverse block to show while the promise is resolving.

  ```
  {{#async-await this.promise as |value|}}
    <SynchronousComponent @value={{value}} />
  {{else}}
    <LoadingSpinner />
  {{/async-await}}
  ```

  @class component:async-await
  @extends Ember.Component
 */
export default Component.extend({
  tagName: '',
  layout,

  /**
    The promise to await on (passed as a positional argument).

    @public
    @property promise
    @type any
    @required
  */
  promise: UNINITIALIZED(),

  /**
    A callback to run when the promise rejects. By default, it calls
    `Ember.onerror` with an error object with its `reason` property set to the
    promise's rejection reason. You can pass a different function here to
    handle the rejection more locally. Pass `null` to silence the rejection
    completely.

    @public
    @property onReject
    @type Function | null
    @required
  */
  onReject: DEFAULT_REJECTION_HANDLER,

  /**
    The most-recently awaited promise.

    @private
    @property awaited
    @type any
  */
  awaited: UNINITIALIZED(),

  /**
    Whether the promise is pending, i.e. it has neither been resolved or
    rejected. This is the opposite of `isSettled`. Only one of `isPending`,
    `isResolved` or `isRejected` can be true at any given moment.

    @private
    @property isPending
    @type Boolean
    @default true
  */
  isPending: true,

  /**
    Whether the promise is settled, i.e. it has either been resolved or
    rejected. This is the opposite of `isPending`.

    @private
    @property isSettled
    @type Boolean
    @default false
  */
  isSettled: false,

  /**
    Whether the promise has been resolved. If `true`, the resolution value can
    be found in `resolvedValue`. Only one of `isPending`, `isResolved` or
    `isRejected` can be true at any given moment.

    @private
    @property isResolved
    @type Boolean
    @default false
  */
  isResolved: false,

  /**
    Whether the promise has been rejected. If `true`, the rejection reason can
    be found in `rejectReason`. Only one of `isPending`, `isResolved` or
    `isRejected` can be true at any given moment.

    @private
    @property isRejected
    @type Boolean
    @default false
  */
  isRejected: false,

  /**
    If the promise has been resolved, this will contain the resolved value.

    @private
    @property resolvedValue
    @type any
  */
  resolvedValue: UNINITIALIZED(),

  /**
    If the promise has been resolved, this will contain the rejection reason.

    @private
    @property rejectReason
    @type any
  */
  rejectReason: UNINITIALIZED(),

  didReceiveAttrs() {
    this._super(...arguments);
    this.didReceivePromise(this.promise);
  },

  didReceivePromise(promise) {
    if (promise === this.awaited) { return; }

    this.setProperties({
      awaited: promise,
      isPending: true,
      isSettled: false,
      isResolved: false,
      isRejected: false,
      resolvedValue: UNINITIALIZED(),
      rejectReason: UNINITIALIZED()
    });

    Promise.resolve(promise).then(
      bind(this, this.didResolve, promise),
      bind(this, this.didReject, promise)
    );
  },

  didResolve(resolvedPromise, value) {
    if (this.shouldIgnorePromise(resolvedPromise)) { return; }

    this.setProperties({
      isPending: false,
      isSettled: true,
      isResolved: true,
      isRejected: false,
      resolvedValue: value,
      rejectReason: UNINITIALIZED()
    });
  },

  didReject(rejectedPromise, reason) {
    if (this.shouldIgnorePromise(rejectedPromise)) { return; }

    this.setProperties({
      isPending: false,
      isSettled: true,
      isResolved: false,
      isRejected: true,
      resolvedValue: UNINITIALIZED(),
      rejectReason: reason
    });

    let { onReject } = this;

    if (onReject) {
      onReject(reason);
    }
  },

  shouldIgnorePromise(promise) {
    return this.isDestroyed || this.isDestroying || this.promise !== promise;
  }
}).reopenClass({
  positionalParams: ['promise']
});
