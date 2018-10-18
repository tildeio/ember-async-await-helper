# ember-async-await-helper

Awaits a promise, then yields its result to a block. 👌

## Installation

```
ember install ember-async-await-helper
```


## Usage

The `{{#async-await}}` template helper takes a promise as a positional parameter, a block to render once the promise is resolved. Once the promise is resolved, the helper yields the promise's result to the block.

```hbs
{{#async-await this.users as |users|}}
    <UserList @users={{users}} />
{{/async-await}}
```

If the passed in value is not a promise, it will be converted to one using `Promise.resolve()`.

### Loading States

Optionally, you can pass an inverse block to be displayed while the promise is pending.

```hbs
{{#async-await this.users as |users|}}
    <UserList @users={{users}} />
{{else}}
    <LoadingSpinner />
{{/async-await}}
```

### Error Handling

In general, it's a bad idea to pass a fallible promise into the template. By default, if your promise rejects, `{{#async-await}}` calls `Ember.onerror`, which should trigger your typical error handling paths, such as showing a "something went wrong..." screen and/or reporting to Bugsnag.

The default error object comes with a `reason` property set to the promise's rejection reason:

```js
Ember.onerror = function(error) {
  console.error(error.message); // => Unhandled promise rejection in {{#async-await}}: **rejection reason**

  console.error(error.reason); // => **rejection reason**
};
```

Note that after the promise rejects, the `{{#async-await}}` helper will remain in the "pending" state (i.e. the `{{else}}` block).

#### Recommended Method

In order to avoid dealing with rejections in the template, it is recommended that you wrap your promises in an async function that handles any expected error scenarios, so that the promise is (mostly) infallible:

```js
export default Component.extend({
  users: computed(async function() {
    let retries = 0;

    while (retries < 5) {
      try {
        return await fetch('/users.json');
      } catch (e) {
        if (isNetworkError(e)) {
          retries += 1;
        } else {
          // Unexpected Error! We can let this trigger the default
          // `onReject` callback. In our `Ember.onerror` handler,
          // we will transition the app into a generic error route.
          throw e;
        }
      }
    }
  })
});
```

For any non-trivial functionality, you may also want to consider using an [ember-concurrency](https://ember-concurrency.com/) task instead. [Read on](#using-with-ember-concurrency) for how to use the `{{#async-await}}` helper together with ember-concurrency.

#### Inline `onReject` callbacks

While the above method is recommended, it is also possible to pass an `onReject` callback to run when the promise rejects:

```hbs
{{#async-await this.users onReject=handleError as |users|}}
    <UserList @users={{users}} />
{{/async-await}}
```

As mentioned above,  after the promise rejects, the `{{#async-await}}` helper will remain in the "pending" state (i.e. the `{{else}}` block). Your rejection handler can retry the original operation by replacing the promise passed to the `{{#async-await}}` helper:

```js
export default Component.extend({
  // ...

  handleError(reason) {
    if (isNetworkError(reason)) {
      // retry the fetch
      this.set('users', fetch('/users.json'));
    } else {
      // show a "something went wrong" modal
      handleUnexpectedError(reason);
    }
  }
});
```

Finally, if you really want to, you can also pass `null` to silence the rejections completely:

```hbs
{{#async-await this.users onReject=null as |users|}}
    <UserList @users={{users}} />
{{/async-await}}
```

### Using with `ember-concurrency`

Did you know that `ember-concurrency` tasks (`TaskInstance`s to be exact) are also promise-like objects (they have a `.then` method on them). That means, you can await them with the `{{#async-await}}` just like any other promises!

```js
export default Component.extend({
  init() {
    this._super(...arguments);
    this.fetchUsers.perform();
  },

  users: alias('fetchUsers.last'),

  fetchUsers: task(function * () {
    let retries = 0;

    while (retries < 5) {
      try {
        return yield fetch('/users.json');
      } catch (e) {
        if (isNetworkError(e)) {
          retries += 1;
        } else {
          // this will trigger the default `onReject`
          throw e;
        }
      }
    }
  }).restartable()
});
```

With this setup, you can continue to pass `this.users` to the `{{#async-await}}` helper as you normally would:

```hbs
{{#async-await this.users as |users|}}
    <UserList @users={{users}} />
{{else}}
    <LoadingSpinner />
{{/async-await}}
```

## Contributing

### Installation

* `git clone <repository-url>`
* `cd ember-async-await-helper`
* `yarn install`

### Linting

* `yarn lint:hbs`
* `yarn lint:js`
* `yarn lint:js --fix`

### Running tests

* `ember test` – Runs the test suite on the current Ember version
* `ember test --server` – Runs the test suite in "watch mode"
* `ember try:each` – Runs the test suite against multiple Ember versions

### Running the dummy application

* `ember serve`
* Visit the dummy application at [http://localhost:4200](http://localhost:4200).

For more information on using ember-cli, visit [https://ember-cli.com/](https://ember-cli.com/).

## License

This project is licensed under the [MIT License](LICENSE.md).
