# Summary

<!-- What changed and why. -->

## Validation

Mark only what was actually run. Leave the rest unchecked and list them under
"Not covered" so reviewers can see the gap.

- [ ] `npm run release:check`
- [ ] `npm run wrapper:check`
- [ ] `npm run doctor`
- [ ] `npm run build:web`
- [ ] `npm run tauri build`

## Not covered

<!--
State explicitly what was not validated and why. "Nothing" is a valid answer.
Manual desktop checks count as not covered unless they were performed against
a built app.
-->

## Vendor bumps only

Delete this section for changes that do not touch `vendor/cyberchef`.

- [ ] Upstream range reviewed against `docs/WRAPPER_CUSTOMIZATIONS.md`
- [ ] Wrapper touchpoints still resolve (modal ids, `window.app` APIs, font variable)
- [ ] `vendor/cyberchef.vendor.json` matches `vendor/cyberchef/package.json`
- [ ] Manual desktop checks from `docs/UPDATING.md` performed, or listed above as not covered

## New checks only

Delete this section if this PR adds no new check.

- [ ] The check was proven able to fail by mutating what it guards, then restoring
