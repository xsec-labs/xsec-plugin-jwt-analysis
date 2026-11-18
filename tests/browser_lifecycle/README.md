# JWT frontend lifecycle regression

The browser checks use the real frontend module, browser DOM and timers, HTTP,
and the plugin's SQLite Store and report functions. The loopback component
connector provides read-only JWT queries for two isolated projects. Desktop
authorization, native plugin installation, and MCP transport require separate
Host acceptance.

The five cases cover project updates, disposal after mount, disposal during a
pending mount, a project update during a pending mount, and a failed refresh.
The failure case renames the isolated database's jobs table temporarily, so
the HTTP response contains a real SQLite error. A completed observation window
checks that disposal and refresh failure stop subsequent polling.

Each case runs in a separate browser iframe, which releases the baseline's
leaked timers when the case ends. The baseline file is the committed frontend
from `f159dcda672e03a19516f7741c1dfa139a466c9b`; all five cases fail on that
revision and pass with the lifecycle change. The controller still propagates
actual request failures. A user refresh starts a new explicit attempt.

Run through the workspace's build resource controller. Its Python command is:

```sh
rtk python3 tests/browser_lifecycle/serve.py \
  --root /absolute/path/to/xsec-plugin-jwt-analysis \
  --data /Volumes/xsec-build/evidence/jwt-lifecycle/sqlite \
  --baseline /Volumes/xsec-build/evidence/jwt-lifecycle/baseline.js \
  --evidence /Volumes/xsec-build/evidence/jwt-lifecycle
```

Prepare `baseline.js` using `git show` for the exact revision above and create
the evidence directory before running. Open the printed loopback URL in a real
browser and click the run button once. The server records `browser-results.json`
and exits when every case finishes. Save a screenshot of the final page.
An incomplete case has a 20-second deadline; failed cases remain visible in
the result and are not rerun automatically.

## Host contract (wire shape and theme)

The lifecycle harness above stubs plain business objects. The Desktop host does
not: a method bound to an MCP tool returns the raw CallToolResult, and the host
pushes its theme as `--xsec-*` variables on `<html>`. `tests/frontend_host_contract/run.mjs`
runs the real frontend module in Playwright Chromium against both: the three
result shapes (structuredContent, text content only, plain object), a tool
error, missing diagnostic fields, the real light and dark host values
(`host-theme.json`, from `themeVars` in Desktop) with contrast checks under both
system colour schemes, and `color-scheme` following a live theme update.

```sh
NODE_PATH=$(npm root -g) node tests/frontend_host_contract/run.mjs
```
