# Deploying the widget service

A short operations guide. Every image is described, every link names its
destination, the heading outline never skips a level, and both tables have
named header columns — `a11ymark check examples/clean.md` exits 0.

![Terminal running the deploy script with a green success banner](img/deploy-success.png)

## Prerequisites

Install the CLI as described in the [installation guide](install.md), then
verify your credentials against the [staging environment checklist](staging.md).

| Requirement | Minimum version | Notes |
|---|---|---|
| Node.js | 22.13 | LTS recommended |
| Docker | 27.0 | rootless mode works |

## Rolling out

### Canary stage

Route 5% of traffic to the new build and watch the dashboard.

[![Grafana dashboard for the canary rollout](img/canary.png)](https://example.test/grafana)

### Full rollout

Promote the canary once error rates stay flat for 30 minutes. The exact
thresholds are documented in the [rollout policy](policy.md).

## Rolling back

Run `widget deploy --rollback`; the previous release is kept warm.

| Step | Command | Expected result |
|---|---|---|
| 1 | `widget deploy --rollback` | previous build serving |
| 2 | `widget status` | version matches last release |

Questions? Email <mailto:ops@example.test> or read the
[incident response runbook](runbook.md).
