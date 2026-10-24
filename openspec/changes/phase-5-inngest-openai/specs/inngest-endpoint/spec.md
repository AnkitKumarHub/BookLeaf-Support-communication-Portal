# Spec Delta

## Purpose

Exposes the background classification and draft jobs to Inngest through one signed HTTP endpoint that the browser session cannot authorize.

## ADDED Requirements

### Requirement: Inngest handler is outside the API
The system MUST serve `GET`, `POST`, and `PUT` at `/api/inngest`. That path MUST NOT be under `/api/v1`. `GET /health` MUST remain `{ "server": "ok" }`. The handler MUST be registered without the access-cookie check used by `/api/v1`.

#### Scenario: Handler methods exist
- **WHEN** Inngest calls `GET`, `POST`, or `PUT` `/api/inngest`
- **THEN** the route is handled and is not rejected as an unknown path

#### Scenario: Health is unchanged
- **WHEN** a client calls `GET /health`
- **THEN** the response body is `{ "server": "ok" }`

#### Scenario: Cookie is not the credential
- **WHEN** a client calls `POST /api/inngest` with a valid access cookie and without a valid Inngest signature
- **THEN** the access cookie does not authorize the call

### Requirement: Production requests are signed
When `INNGEST_SIGNING_KEY` is set, a request that fails signature verification MUST be rejected and MUST NOT run classification or draft generation. The signing key MUST NOT be logged.

#### Scenario: Bad signature is rejected
- **WHEN** `INNGEST_SIGNING_KEY` is set and the request signature is invalid
- **THEN** the response is rejected and no ticket AI column changes

#### Scenario: Key is not logged
- **WHEN** signature verification fails
- **THEN** the error log does not contain the signing key

### Requirement: Local dev does not hardcode cloud mode
Local development MUST be able to sync functions when `INNGEST_DEV=1` and no signing key is set. The server MUST NOT force dev mode in code. With dev mode unset and no signing key, the handler MUST NOT pretend the call is authorized.

#### Scenario: Dev mode syncs without a signing key
- **WHEN** `INNGEST_DEV` is `1`, no signing key is set, and the local dev server requests `GET /api/inngest`
- **THEN** the handler responds for function sync rather than a missing-signing-key failure

#### Scenario: Cloud mode without a key fails closed
- **WHEN** `INNGEST_DEV` is unset and `INNGEST_SIGNING_KEY` is empty
- **THEN** `GET /api/inngest` does not report a successful sync
