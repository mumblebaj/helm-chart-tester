function isDeprecatedApiVersion(apiVersion) {
  const deprecatedVersions = new Set([
    'extensions/v1beta1',
    'apps/v1beta1',
    'apps/v1beta2',
    'networking.k8s.io/v1beta1',
    'batch/v1beta1',
    'batch/v1beta2',
    'rbac.authorization.k8s.io/v1beta1',
    'policy/v1beta1',
    'authentication.k8s.io/v1beta1',
    'apiextensions.k8s.io/v1beta1',
  ]);
  return deprecatedVersions.has(apiVersion);
}

function normalizePodSpec(document) {
  if (!document || typeof document !== 'object') {
    return null;
  }

  if (document.kind === 'Pod') {
    return document.spec || null;
  }

  if (document.spec && document.spec.template && document.spec.template.spec) {
    return document.spec.template.spec;
  }

  return null;
}

function imageUsesLatestTag(image) {
  if (!image || typeof image !== 'string') {
    return false;
  }

  const parts = image.split('/').pop().split(':');
  if (parts.length === 1) {
    return true;
  }

  return parts[1] === 'latest' || parts[1] === '';
}

function buildAlert({ severity, rule, message, kind, name }) {
  return {
    severity,
    rule,
    message,
    resource: {
      kind: kind || 'Unknown',
      name: name || 'Unknown',
    },
  };
}

function checkPodSpec(doc, target, kind, name) {
  const alerts = [];
  const podSpec = normalizePodSpec(doc);
  if (!podSpec) {
    return alerts;
  }

  const volumes = Array.isArray(podSpec.volumes) ? podSpec.volumes : [];
  volumes.forEach((volume) => {
    if (volume && volume.hostPath) {
      alerts.push(buildAlert({
        severity: 'error',
        rule: 'hostPath-volume',
        message: `Volume '${volume.name}' uses hostPath, which is not allowed for OpenShift compatibility.`,
        kind,
        name,
      }));
    }
  });

  if (!podSpec.serviceAccountName) {
    alerts.push(buildAlert({
      severity: 'warning',
      rule: 'missing-serviceaccount',
      message: 'Pod template is missing a ServiceAccount name.',
      kind,
      name,
    }));
  }

  const containers = Array.isArray(podSpec.containers) ? podSpec.containers : [];
  containers.forEach((container) => {
    const containerName = container.name || '<unnamed>';
    const securityContext = container.securityContext || {};
    const podSecurityContext = podSpec.securityContext || {};
    const privileged = securityContext.privileged || podSecurityContext.privileged;
    const runAsUser = securityContext.runAsUser || podSecurityContext.runAsUser;

    if (privileged) {
      alerts.push(buildAlert({
        severity: 'error',
        rule: 'privileged-container',
        message: `Container '${containerName}' is running privileged, which is unsafe for OpenShift.`,
        kind,
        name,
      }));
    }

    if (runAsUser !== undefined && runAsUser !== null) {
      alerts.push(buildAlert({
        severity: 'warning',
        rule: 'hardcoded-runAsUser',
        message: `Container '${containerName}' specifies runAsUser=${runAsUser}, which may break OpenShift security context constraints.`,
        kind,
        name,
      }));
    }

    if (imageUsesLatestTag(container.image)) {
      alerts.push(buildAlert({
        severity: 'warning',
        rule: 'latest-image-tag',
        message: `Container '${containerName}' uses the latest image tag, which is not recommended.`,
        kind,
        name,
      }));
    }

    const resources = container.resources || {};
    const hasRequests = resources.requests && Object.keys(resources.requests).length > 0;
    const hasLimits = resources.limits && Object.keys(resources.limits).length > 0;
    if (!hasRequests || !hasLimits) {
      const severity = target === 'openshift' ? 'error' : 'warning';
      alerts.push(buildAlert({
        severity,
        rule: 'missing-resources',
        message: `Container '${containerName}' is missing resource requests and/or limits.`,
        kind,
        name,
      }));
    }
  });

  return alerts;
}

function validateRenderedDocuments(documents, target = 'kubernetes') {
  const alerts = [];
  documents.forEach((doc) => {
    if (!doc || typeof doc !== 'object') {
      return;
    }

    const kind = doc.kind || 'Unknown';
    const name = doc.metadata && doc.metadata.name ? doc.metadata.name : 'Unknown';
    const apiVersion = doc.apiVersion;

    if (isDeprecatedApiVersion(apiVersion)) {
      alerts.push(buildAlert({
        severity: 'warning',
        rule: 'deprecated-apiVersion',
        message: `Resource ${kind}/${name} uses deprecated apiVersion '${apiVersion}'.`,
        kind,
        name,
      }));
    }

    if (target === 'openshift' && kind === 'Ingress') {
      alerts.push(buildAlert({
        severity: 'error',
        rule: 'kubernetes-ingress-on-openshift',
        message: 'Kubernetes Ingress resources are not compatible with OpenShift in this validation mode.',
        kind,
        name,
      }));
    }

    if (['Pod', 'Deployment', 'DaemonSet', 'StatefulSet', 'ReplicaSet', 'Job', 'CronJob'].includes(kind)) {
      alerts.push(...checkPodSpec(doc, target, kind, name));
    }
  });

  return alerts;
}

module.exports = {
  validateRenderedDocuments,
};
