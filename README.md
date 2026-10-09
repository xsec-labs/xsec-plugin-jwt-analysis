# XSEC JWT Analysis

`com.xsec.jwt-analysis` is a project-scoped XSEC Desktop plugin. It parses JWTs, checks empty and weak HMAC secrets, records bounded N-day variants, and keeps jobs and evidence in a private SQLite database under `PLUGIN_DATA`.

The Agent can create a job from a token, batch, authorized traffic reference, request file, or project file. Desktop supplies project identity and resolves traffic and files; the Sidecar never reads Core databases. The Skill opens the project panel, polls task progress, and leaves formal findings in XSEC Core until a candidate is confirmed.

## Tests and network scope

`passive` jobs parse claims and perform local key checks. `full` jobs send variants only when the user supplied an HTTP/1.x baseline or a Desktop-authorized flow. The default is 10 requests per minute and 100 requests per job; both rate and job limit, timeout, same-origin redirect policy, and TLS verification are configurable. Requests stop at cancellation boundaries, and each response or failed request has evidence.

The adapter uses jwt_tool 2.3.0 helpers for HMAC verification, `alg=none`, null-signature, empty-key, and ECDSA Psychic Signature variants. It includes signed claim/error/time tests, common payload-claim variants, `kid` and inline `jwk` header variants, and optional RS/HS confusion with a configured public key. `jku`/`x5u` fetches and external JWKS listeners stay `not_run`; token-controlled URLs are never fetched. The upstream `-M pb` and `-M at` CLI modes are not run directly because they include external listener probes, command-injection payloads, requests outside this plugin's limiter, and automatic `~/.jwt_tool` configuration writes.

Candidate status requires a response difference. A result becomes `vulnerable` only when the supplied canary is present in both the baseline and a successful variant response, or when jwt_tool validates a signing key against the JWT. A candidate alone is not a confirmed finding.

## MCP tools

The stdio server exposes `jwt_analysis_create`, `jwt_analysis_list`, `jwt_analysis_get`, `jwt_analysis_events`, `jwt_analysis_cancel`, `jwt_analysis_retry`, `jwt_analysis_evidence_get`, `jwt_analysis_report`, `jwt_analysis_delete`, and `jwt_analysis_diagnostics`. Create and retry are explicit operations; failed jobs never retry automatically. Evidence is redacted by default. Deletion is permanent and explicit.

## Build and verify

The frontend uses `@xsec/ui-react` 0.1.7 and `@xsec/design-tokens` 0.1.2.
Its job selector, filters, details and settings follow Desktop's theme, density,
font and reduced-motion preferences. React source is in `frontend-src/` and is
compiled into the single ESM entry declared by the existing manifest.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run check:generated
```

After installing `requirements-runtime.lock`, `npm run test:frontend` checks
frontend response validation against real SQLite jobs, local JWT analysis,
evidence, reports and Python settings. `XSEC_JWT_TEST_PYTHON` selects the test
interpreter when a shared Python environment is used.
The frontend bridge validates the JWT Sidecar's MCP result envelope before
parsing business data, and exposes tool errors through the page's error state.

Commit the generated frontend, `com.xsec.desktop/THIRD_PARTY_NOTICES.txt`, and
`com.xsec.desktop/frontend-sbom.cdx.json` with source changes. The source CI
checks these artifacts on Windows, Linux, macOS arm64 and macOS x86_64.

The workspace keeps filters during successful periodic updates. Context changes
and disposal invalidate in-flight reads; failures display an operation ID and
require an explicit reload. Details close through the shared Drawer, and report
exports are re-read from the authorized Sidecar by the Host. Native exports
use the account export directory; browser exports use a client-owned resource
and the Host renderer's download action. Settings save
through the declared Host method and confirm the persisted value before showing
success.

The build script produces a single-file executable for its current OS and architecture. `.github/workflows/build-sidecar.yml` builds and uploads separate artifacts for macOS arm64, macOS x86_64, Linux x86_64, and Windows x64. The XSEC Factory recipe names these immutable platform artifacts before packaging them at `bin/jwt-analysis-mcp[.exe]`.

```sh
python3 -m pip install -r requirements-build.lock
python3 tests/self_check.py
python3 scripts/build_sidecar.py --output dist/jwt-analysis-mcp
python3 scripts/verify_sidecar.py dist/jwt-analysis-mcp
```

The self-check uses a real Sidecar process, SQLite, jwt_tool signature verification, the bundled RockYou archive, and a loopback HTTP server. `third_party/sbom.cdx.json` records the bundled and build dependencies. License texts and source provenance are in `third_party/` and `THIRD_PARTY_NOTICES.md`.
