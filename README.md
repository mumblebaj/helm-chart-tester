# Helm Chart Tester

`helm-chart-tester` is a local Node.js CLI tool to validate Helm charts and Kubernetes manifests locally without requiring a Kubernetes or OpenShift cluster.

## Requirements

### For Helm mode (default)
- Node.js 18+
- Helm installed and available on `PATH`
  - On Windows, install Helm with `winget install Helm.Helm`

### For YAML file mode (--yaml-file)
- Node.js 18+
- **No Helm required**

## Install

```bash
npm install
npm link
```

## Usage

```bash
chart-test <chart-path> [options]
```

### Options

- `-f, --values <files...>`: Optional values files to pass to Helm (Helm mode only)
- `--target <target>`: `kubernetes` or `openshift` (default: `kubernetes`)
- `-o, --output <dir>`: Output directory for generated reports (default: `reports`)
- `--yaml-file`: Treat input as pre-rendered YAML file; skips Helm commands

## Examples

### Helm Mode (requires Helm installed)

Validate a Helm chart with Kubernetes target:

```bash
chart-test test-charts/openshift-checks --target kubernetes
```

Validate a Helm chart with OpenShift target and values file:

```bash
chart-test test-charts/openshift-checks -f test-charts/openshift-checks/values.yaml --target openshift
```

Validate the intentionally broken test chart:

```bash
chart-test test-charts/bad-chart --target kubernetes
```

### YAML File Mode (no Helm required)

Validate a pre-rendered YAML manifest:

```bash
chart-test test-fixtures/valid-deployment.yaml --yaml-file --target kubernetes
```

Validate a pre-rendered YAML file for OpenShift compatibility:

```bash
chart-test test-fixtures/invalid-deployment.yaml --yaml-file --target openshift
```

Validate a multi-document YAML file:

```bash
chart-test test-fixtures/deprecated-and-ingress.yaml --yaml-file --target openshift
```
Validate all YAML files in a directory and resolve cross-file references:

```bash
node bin/chart-test test-cron --yaml-file --target openshift
```

> Note: `--yaml-file` mode reads all `*.yaml` and `*.yml` files recursively under the given path. It validates references such as ServiceAccount, ConfigMap, Secret, PersistentVolumeClaim and Service names across all loaded documents.
## What It Does

### Helm Mode
1. `helm dependency build`
2. `helm lint`
3. `helm template`
4. Parse rendered YAML
5. Run compatibility checks

### YAML File Mode
1. Load pre-rendered YAML file
2. Parse YAML documents
3. Run compatibility checks

Both modes:
- Capture stdout/stderr
- Parse rendered YAML documents
- Run OpenShift compatibility validation
- Write Markdown and JSON reports to `./reports`

## OpenShift Compatibility Checks

The tool validates for issues such as:

- **Privileged containers**: Containers running with `securityContext.privileged: true`
- **hostPath volumes**: Use of `volumes[].hostPath`, which is unsafe for OpenShift
- **Hardcoded runAsUser**: Containers with explicit `securityContext.runAsUser` that may break OpenShift security context constraints
- **Missing resource requests/limits**: Containers without `resources.requests` or `resources.limits` (error on OpenShift, warning on Kubernetes)
- **Kubernetes Ingress on OpenShift**: Ingress resources when `--target openshift`
- **Missing ServiceAccount**: Pod templates without `serviceAccountName`
- **Deprecated apiVersions**: Use of deprecated Kubernetes API versions (e.g., `extensions/v1beta1`)
- **Latest image tags**: Containers using `image:latest` or untagged images

Alerts are classified as warnings or errors based on severity.

## Test Fixtures

### Helm Charts
- `test-charts/bad-chart/`: Chart with template syntax errors
- `test-charts/openshift-checks/`: Chart that triggers OpenShift validation alerts

### YAML Files (for `--yaml-file` mode)
- `test-fixtures/valid-deployment.yaml`: Valid Deployment and Service
- `test-fixtures/invalid-deployment.yaml`: Deployment with privileged container, hostPath volume, and latest tag
- `test-fixtures/deprecated-and-ingress.yaml`: Kubernetes Ingress and deprecated apiVersion

## Running Tests

Run all test fixtures to verify validation works correctly:

```bash
npm test
```

This runs `test/run-fixtures.js`, which tests various scenarios including:
- Valid Kubernetes/OpenShift manifests
- Security violations (privileged containers, hostPath volumes)
- Resource constraint violations
- Deprecated API versions
- Kubernetes Ingress on OpenShift

## Reports

Reports are generated in the `./reports` directory (customizable with `-o/--output`):

- **Markdown report** (`chart-test-report-*.md`): Human-readable format with check results, validation alerts, and resource kinds
- **JSON report** (`chart-test-report-*.json`): Machine-readable format with full details and alert metadata
