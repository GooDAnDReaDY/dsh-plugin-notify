# Notification plugin testing

The package tests exercise the published host bundle directly. They verify the
private package/host identity, the `turn/end` notification path, webhook JSON
delivery, and `excludeSessionPrefixes` suppression. The isolated DSH test
profile additionally verifies package installation, service health, bundle
loading, and cleanup while preserving its permanent lanmode plugin.

The client owns the English and Chinese dictionaries. Russian strings are
provided by `dsh-russian-lang`; the plugin must not register the `ru` locale
itself. Loading both packages must complete without a duplicate-locale error
and without a failed web-boot entry.

Run:

```sh
npm install --no-package-lock --ignore-scripts
npm test
```

Real external IM delivery requires a user-owned webhook and is not part of the
automated test suite; the request contract is tested against a local receiver.
