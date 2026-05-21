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

function getResourceKey(doc) {
  if (!doc || typeof doc !== 'object' || !doc.kind || !doc.metadata || !doc.metadata.name) {
    return null;
  }
  return `${doc.kind}/${doc.metadata.name}`;
}

function buildResourceIndex(documents) {
  const index = new Set();
  documents.forEach((doc) => {
    const key = getResourceKey(doc);
    if (key) {
      index.add(key);
    }
  });
  return index;
}

function addReference(references, kind, name, location) {
  if (!name) {
    return;
  }

  references.push({
    kind,
    name,
    location,
  });
}

function collectPodSpecReferences(podSpec, kind, name) {
  const references = [];
  if (!podSpec || typeof podSpec !== 'object') {
    return references;
  }

  if (podSpec.serviceAccountName) {
    addReference(references, 'ServiceAccount', podSpec.serviceAccountName, 'serviceAccountName');
  }

  const volumes = Array.isArray(podSpec.volumes) ? podSpec.volumes : [];
  volumes.forEach((volume) => {
    if (!volume || typeof volume !== 'object') {
      return;
    }
    if (volume.configMap && volume.configMap.name) {
      addReference(references, 'ConfigMap', volume.configMap.name, `volume ${volume.name}`);
    }
    if (volume.secret && volume.secret.secretName) {
      addReference(references, 'Secret', volume.secret.secretName, `volume ${volume.name}`);
    }
    if (volume.persistentVolumeClaim && volume.persistentVolumeClaim.claimName) {
      addReference(references, 'PersistentVolumeClaim', volume.persistentVolumeClaim.claimName, `volume ${volume.name}`);
    }
    if (volume.projected && Array.isArray(volume.projected.sources)) {
      volume.projected.sources.forEach((source) => {
        if (source.configMap && source.configMap.name) {
          addReference(references, 'ConfigMap', source.configMap.name, `projected volume ${volume.name}`);
        }
        if (source.secret && source.secret.name) {
          addReference(references, 'Secret', source.secret.name, `projected volume ${volume.name}`);
        }
      });
    }
  });

  const containers = Array.isArray(podSpec.containers) ? podSpec.containers : [];
  containers.forEach((container) => {
    if (!container || typeof container !== 'object') {
      return;
    }
    const containerName = container.name || '<unnamed>';

    const env = Array.isArray(container.env) ? container.env : [];
    env.forEach((entry) => {
      if (entry.valueFrom && entry.valueFrom.configMapKeyRef && entry.valueFrom.configMapKeyRef.name) {
        addReference(references, 'ConfigMap', entry.valueFrom.configMapKeyRef.name, `container ${containerName} env`);
      }
      if (entry.valueFrom && entry.valueFrom.secretKeyRef && entry.valueFrom.secretKeyRef.name) {
        addReference(references, 'Secret', entry.valueFrom.secretKeyRef.name, `container ${containerName} env`);
      }
    });

    const envFrom = Array.isArray(container.envFrom) ? container.envFrom : [];
    envFrom.forEach((entry) => {
      if (entry.configMapRef && entry.configMapRef.name) {
        addReference(references, 'ConfigMap', entry.configMapRef.name, `container ${containerName} envFrom`);
      }
      if (entry.secretRef && entry.secretRef.name) {
        addReference(references, 'Secret', entry.secretRef.name, `container ${containerName} envFrom`);
      }
    });
  });

  return references;
}

function collectIngressReferences(doc, kind, name) {
  const references = [];
  if (!doc.spec || typeof doc.spec !== 'object') {
    return references;
  }

  const rules = Array.isArray(doc.spec.rules) ? doc.spec.rules : [];
  rules.forEach((rule) => {
    const paths = rule.http && Array.isArray(rule.http.paths) ? rule.http.paths : [];
    paths.forEach((pathEntry) => {
      const backend = pathEntry.backend || {};
      if (backend.service && backend.service.name) {
        addReference(references, 'Service', backend.service.name, 'ingress backend');
      }
      if (backend.serviceName) {
        addReference(references, 'Service', backend.serviceName, 'ingress backend');
      }
    });
  });

  return references;
}

function validateReferences(doc, index) {
  const alerts = [];
  if (!doc || typeof doc !== 'object') {
    return alerts;
  }

  const kind = doc.kind || 'Unknown';
  const name = doc.metadata && doc.metadata.name ? doc.metadata.name : 'Unknown';
  const references = [];

  if (['Pod', 'Deployment', 'DaemonSet', 'StatefulSet', 'ReplicaSet', 'Job', 'CronJob'].includes(kind)) {
    const podSpec = normalizePodSpec(doc);
    references.push(...collectPodSpecReferences(podSpec, kind, name));
  }

  if (kind === 'Ingress') {
    references.push(...collectIngressReferences(doc, kind, name));
  }

  references.forEach((ref) => {
    if (!index.has(`${ref.kind}/${ref.name}`)) {
      alerts.push(buildAlert({
        severity: 'error',
        rule: 'missing-resource-reference',
        message: `Resource ${kind}/${name} references ${ref.kind}/${ref.name} via ${ref.location}, but it is not defined in the loaded YAML files.`,
        kind,
        name,
      }));
    }
  });

  return alerts;
}

function validateRenderedDocuments(documents, target = 'kubernetes') {
  const alerts = [];
  const resourceIndex = buildResourceIndex(documents);

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

    alerts.push(...validateReferences(doc, resourceIndex));
  });

  return alerts;
}

module.exports = {
  validateRenderedDocuments,
};
