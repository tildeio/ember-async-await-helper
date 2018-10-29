import { VERSION } from '@ember/version';
import Component from '@ember/component';
import { bind } from '@ember/runloop';
import Ember from 'ember';
import RSVP from 'rsvp';
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
    if (typeof Ember.onerror === 'function') {
      Ember.onerror(error);
    } else {
      console.assert(false, error); // eslint-disable-line no-console
    }
  }
}

let hashProto;

if (VERSION.startsWith('2.')) {
  // Glimmer in older version of Ember does some weird things in creating an empty "hash",
  // so we have to jump through some hoops to get the correct prototype.
  hashProto = Object.getPrototypeOf(Ember.__loader.require('@glimmer/util').dict());
} else {
  // The `hash` helper creates an object with `Object.create(null)` which will have no
  // prototype.
  hashProto = null;
}

function isHash(value) {
  return typeof value === 'object' && Object.getPrototypeOf(value) === hashProto;
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
    The promise or hash of promises to await on (passed as a positional argument).

    @public
    @property argument
    @type any
    @required
  */
  argument: UNINITIALIZED(),

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
    The most-recently awaited argument.

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
    this.didReceiveArgument(this.argument);
  },

  didReceiveArgument(argument) {
    if (argument === this.awaited) { return; }

    this.setProperties({
      awaited: argument,
      isPending: true,
      isSettled: false,
      isResolved: false,
      isRejected: false,
      resolvedValue: UNINITIALIZED(),
      rejectReason: UNINITIALIZED()
    });

    let target = isHash(argument) ? RSVP.hash(argument) : argument;

    Promise.resolve(target).then(
      bind(this, this.didResolve, argument),
      bind(this, this.didReject, argument)
    );
  },

  didResolve(resolvedArgument, value) {
    if (this.shouldIgnorePromise(resolvedArgument)) { return; }

    this.setProperties({
      isPending: false,
      isSettled: true,
      isResolved: true,
      isRejected: false,
      resolvedValue: value,
      rejectReason: UNINITIALIZED()
    });
  },

  didReject(rejectedArgument, reason) {
    if (this.shouldIgnorePromise(rejectedArgument)) { return; }

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

  shouldIgnorePromise(argument) {
    return this.isDestroyed || this.isDestroying || this.argument !== argument;
  }
}).reopenClass({
  positionalParams: ['argument']
});
