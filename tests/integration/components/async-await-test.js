import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render, settled } from '@ember/test-helpers';
import { helper } from '@ember/component/helper';
import hbs from 'htmlbars-inline-precompile';
import Ember from 'ember';
import RSVP from 'rsvp';

module('Integration | Component | async-await', function (hooks) {
  setupRenderingTest(hooks);

  test('it does not produce a wrapper element', async function (assert) {
    await render(hbs`{{#async-await "unused"}}{{/async-await}}`);

    assert.dom('div', this.element).doesNotExist();
  });

  test('it can render non-promise values', async function (assert) {
    await render(hbs`
      {{#async-await "plain value" as |value|}}
        resolved {{value}}
      {{/async-await}}
    `);

    assert.dom().hasText('resolved plain value');
  });

  function ItBehavesLikePromises(label, Promise) {
    let _onerror;
    let expectRejection;

    function makePromise(label) {
      let resolve, reject;

      let promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });

      promise._label = label;

      return { promise, resolve, reject };
    }

    function makeRejectedPromise(reason) {
      let promise = Promise.reject(reason);

      promise._label = `intentionally rejected (${reason})`;

      // This silences the browser/RSVP's "unhandled rejection" errors
      promise.catch(() => {});

      return promise;
    }

    module(label, function (hooks) {
      hooks.beforeEach(function (assert) {
        _onerror = Ember.onerror;

        let failOnError = (error) => {
          assert.ok(false, `Unexpected error: ${error}`);
        };

        Ember.onerror = failOnError;

        expectRejection = async (reason, callback) => {
          let called = 0;
          let _onerror = Ember.onerror;

          try {
            Ember.onerror = (error) => {
              called++;
              assert.ok(error instanceof Error, 'it should be an error');
              assert.equal(
                typeof error.stack,
                'string',
                'it should have a stack trace'
              );
              assert.equal(
                error.message,
                `Unhandled promise rejection in {{#async-await}}: ${reason}`
              );
              assert.equal(error.reason, reason);
            };

            await callback();
            await settled();
          } finally {
            assert.equal(called, 1, 'expected exactly one rejection');
            Ember.onerror = _onerror;
          }
        };
      });

      hooks.afterEach(function () {
        Ember.onerror = _onerror;
      });

      test('it can render resolved promise', async function (assert) {
        this.set('promise', Promise.resolve('value'));

        await render(hbs`
          {{#async-await this.promise as |value|}}
            resolved {{value}}
          {{/async-await}}
        `);

        assert.dom().hasText('resolved value');
      });

      test('it can take a hash of promises as arguments', async function (assert) {
        this.set('promiseA', Promise.resolve('valueA'));
        this.set('promiseB', Promise.resolve('valueB'));
        this.set('promiseC', Promise.resolve('valueC'));

        await render(hbs`
          {{#async-await (hash a=this.promiseA b=this.promiseB c=this.promiseC) as |h|}}
            resolved {{h.a}}, {{h.b}}, {{h.c}}
          {{/async-await}}
        `);

        assert.dom().hasText('resolved valueA, valueB, valueC');
      });

      test('it can take a mixed hash as arguments', async function (assert) {
        this.set('promiseA', Promise.resolve('valueA'));
        this.set('valueB', 'valueB');
        this.set('promiseC', Promise.resolve('valueC'));

        await render(hbs`
          {{#async-await (hash a=this.promiseA b=this.valueB c=this.promiseC) as |h|}}
            resolved {{h.a}}, {{h.b}}, {{h.c}}
          {{/async-await}}
        `);

        assert.dom().hasText('resolved valueA, valueB, valueC');
      });

      test('it can take an object as the argument', async function (assert) {
        let obj = {
          toString() {
            return 'fancy object';
          },
        };

        this.set('value', obj);

        let captured;

        this.owner.register(
          'helper:capture',
          helper(function ([value]) {
            captured = value;
            return value;
          })
        );

        // Expect a straight pass-through
        await render(hbs`
          {{#async-await this.value as |v|}}
            resolved {{capture v}}
          {{/async-await}}
        `);

        assert.dom().hasText('resolved fancy object');
        assert.strictEqual(captured, obj);
      });

      test('it can render rejected promise', async function (assert) {
        this.set('promise', makeRejectedPromise('promise rejected'));

        await expectRejection('promise rejected', () =>
          render(hbs`
            {{#async-await this.promise as |value|}}
              resolved {{value}}
            {{/async-await}}
          `)
        );

        assert.dom().hasText('');
      });

      test('it can render eventually resolved promise', async function (assert) {
        let { promise, resolve } = makePromise();

        this.set('promise', promise);

        await render(hbs`
          {{#async-await this.promise as |value|}}
            resolved {{value}}
          {{/async-await}}
        `);

        assert.dom().hasText('');

        resolve('value');
        await settled();

        assert.dom().hasText('resolved value');
      });

      test('it renders the inverse block while the promise is pending', async function (assert) {
        let { promise, resolve } = makePromise();

        this.set('promise', promise);

        await render(hbs`
          {{#async-await this.promise as |value|}}
            resolved {{value}}
          {{else}}
            pending...
          {{/async-await}}
        `);

        assert.dom().hasText('pending...');

        resolve('value');
        await settled();

        assert.dom().doesNotContainText('pending...');
      });

      test('it remains in the inverse block if the promise rejects', async function (assert) {
        this.set('promise', makeRejectedPromise('promise rejected'));

        await expectRejection('promise rejected', () =>
          render(hbs`
            {{#async-await this.promise as |value|}}
              resolved {{value}}
            {{else}}
              pending...
            {{/async-await}}
          `)
        );

        assert.dom().hasText('pending...');
      });

      test('it calls Ember.onerror by default when the promise rejects', async function (assert) {
        let { promise, reject } = makePromise();

        this.set('promise', promise);

        await render(hbs`
          {{#async-await this.promise as |value|}}
            resolved {{value}}
          {{else}}
            pending...
          {{/async-await}}
        `);

        assert.dom().hasText('pending...');

        await expectRejection('promise rejected', () => {
          reject('promise rejected');
        });

        assert.dom().hasText('pending...');
      });

      test('it calls onReject when the promise rejects', async function (assert) {
        let { promise, reject } = makePromise();

        this.set('promise', promise);

        let called = 0;

        this.set('onReject', (reason) => {
          called++;
          assert.equal(reason, 'promise rejected');
        });

        await render(hbs`
          {{#async-await this.promise onReject=this.onReject as |value|}}
            resolved {{value}}
          {{else}}
            pending...
          {{/async-await}}
        `);

        assert.dom().hasText('pending...');
        assert.strictEqual(called, 0);

        reject('promise rejected');
        await settled();

        assert.dom().hasText('pending...');
        assert.equal(called, 1);
      });

      test('it silences the rejection when onReject is set to null', async function (assert) {
        let { promise, reject } = makePromise();

        this.set('promise', promise);

        await render(hbs`
          {{#async-await this.promise onReject=null as |value|}}
            resolved {{value}}
          {{else}}
            pending...
          {{/async-await}}
        `);

        assert.dom().hasText('pending...');

        reject('promise rejected');
        await settled();

        assert.dom().hasText('pending...');
      });

      test('it resets its state when the promise changes', async function (assert) {
        let { promise: first, resolve: resolveFirst } = makePromise('first');

        this.set('promise', first);

        await render(hbs`
          {{#async-await this.promise as |value|}}
            resolved {{value}}
          {{else}}
            pending...
          {{/async-await}}
        `);

        assert
          .dom()
          .hasText(
            'pending...',
            'shows inverse block while awaiting first promise'
          );

        resolveFirst('first');
        await settled();

        assert
          .dom()
          .hasText('resolved first', 'shows resolved value for first promise');

        // We will resolve this later, after switching out the promise
        let { promise: second, resolve: resolveSecond } = makePromise('second');

        this.set('promise', second);
        await settled();

        assert
          .dom()
          .hasText(
            'pending...',
            'shows inverse block while awaiting second promise'
          );

        // We will reject this later, after switching out the promise
        let { promise: third, reject: rejectThird } = makePromise('third');

        this.set('promise', third);
        await settled();

        assert
          .dom()
          .hasText(
            'pending...',
            'shows inverse block while awaiting third promise'
          );

        this.set('promise', Promise.resolve('fourth'));
        await settled();

        assert
          .dom()
          .hasText(
            'resolved fourth',
            'shows resolved value for fourth promise'
          );

        await expectRejection('rejected fifth', () => {
          this.set('promise', makeRejectedPromise('rejected fifth'));
        });

        assert
          .dom()
          .hasText(
            'pending...',
            'shows inverse block while awaiting fifth promise'
          );

        // Resolving a no-longer-relevant promise should be no-op
        resolveSecond('second');
        await settled();

        assert
          .dom()
          .hasText(
            'pending...',
            'shows inverse block even though second promise was resolved'
          );

        // Rejecting a no-longer-relevant promise should not error
        rejectThird('rejected third');
        await settled();

        assert
          .dom()
          .hasText(
            'pending...',
            'shows inverse block even though third promise was rejected'
          );

        // Recycling an already-resolved promise is the same as Promise.resolve
        this.set('promise', first);
        await settled();

        assert
          .dom()
          .hasText('resolved first', 'shows resolved value for first promise');
      });

      test('does nothing when the promise resolves if the component has been destroyed', async function (assert) {
        let { promise, resolve } = makePromise();

        this.set('promise', promise);
        this.set('shouldShow', true);

        await render(hbs`
          {{#if this.shouldShow}}
            {{#async-await this.promise onReject=null as |value|}}
              resolved {{value}}
            {{else}}
              pending...
            {{/async-await}}
          {{/if}}
        `);

        assert.dom().hasText('pending...');

        this.set('shouldShow', false);

        resolve('value');
        await settled();

        assert.dom().hasText('');
      });

      test('does nothing when the promise rejects if the component has been destroyed', async function (assert) {
        let { promise, reject } = makePromise();

        this.set('promise', promise);
        this.set('shouldShow', true);

        await render(hbs`
          {{#if this.shouldShow}}
            {{#async-await this.promise onReject=null as |value|}}
              resolved {{value}}
            {{else}}
              pending...
            {{/async-await}}
          {{/if}}
        `);

        assert.dom().hasText('pending...');

        this.set('shouldShow', false);

        reject('promise rejected');
        await settled();

        assert.dom().hasText('');
      });

      test('it does not rerender infinitely', async function (assert) {
        this.set('promise', Promise.resolve('value'));

        await render(hbs`
          {{#async-await this.promise}}
            {{#async-await this.promise}}
              {{#async-await this.promise}}
                {{#async-await this.promise}}
                  {{#async-await this.promise}}
                    {{#async-await this.promise}}
                      {{#async-await this.promise}}
                        {{#async-await this.promise}}
                          {{#async-await this.promise}}
                            {{#async-await this.promise}}
                              {{#async-await this.promise}}
                                {{#async-await this.promise as |value|}}
                                  resolved {{value}}
                                {{/async-await}}
                              {{/async-await}}
                            {{/async-await}}
                          {{/async-await}}
                        {{/async-await}}
                      {{/async-await}}
                    {{/async-await}}
                  {{/async-await}}
                {{/async-await}}
              {{/async-await}}
            {{/async-await}}
          {{/async-await}}
        `);

        assert.dom().hasText('resolved value');
      });

      module('with no Ember.onerror', function (hooks) {
        hooks.beforeEach(function (assert) {
          // NOTE: this gets reset in the outer module
          Ember.onerror = undefined;

          expectRejection = async (reason, callback) => {
            let called = 0;
            let _consoleAssert = console.assert; // eslint-disable-line no-console

            try {
              console.assert = (_boolean, error) => {
                // eslint-disable-line no-console
                called++;
                assert.ok(error instanceof Error, 'it should be an error');
                assert.equal(
                  typeof error.stack,
                  'string',
                  'it should have a stack trace'
                );
                assert.equal(
                  error.message,
                  `Unhandled promise rejection in {{#async-await}}: ${reason}`
                );
                assert.equal(error.reason, reason);
              };

              await callback();
              await settled();
            } finally {
              assert.equal(called, 1, 'expected exactly one rejection');
              console.assert = _consoleAssert; // eslint-disable-line no-console
            }
          };
        });

        test('if Ember.onerror is undefined, it console.asserts if the promise is rejecte', async function (assert) {
          this.set('promise', makeRejectedPromise('promise rejected'));

          await expectRejection('promise rejected', () =>
            render(hbs`
              {{#async-await this.promise as |value|}}
                resolved {{value}}
              {{/async-await}}
            `)
          );

          assert.dom().hasText('');
        });
      });
    });
  }

  ItBehavesLikePromises('native Promise', Promise);
  ItBehavesLikePromises('RSVP Promise', RSVP.Promise);
});
