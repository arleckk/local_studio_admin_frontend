import type {
  PackageManifestSummary,
  PackageOperationSummary,
  PackageProviderSummary,
} from './types';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function uniq(list: Array<string | null | undefined>) {
  return [...new Set(list.map((item) => String(item ?? '').trim()).filter(Boolean))];
}

function maybeJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return asRecord(parsed);
    } catch {
      return {};
    }
  }
  return asRecord(value);
}

function collectOsSupport(manifest: Record<string, unknown>, packageMetadata?: Record<string, unknown>) {
  const compatibility = asRecord(manifest.compatibility);
  return uniq([
    ...asStringList(manifest.os_support),
    ...asStringList(compatibility.os_support),
    ...asStringList(packageMetadata?.os_support),
  ]);
}

function collectPermissions(manifest: Record<string, unknown>) {
  const permissions = manifest.permissions ?? manifest.requested_permissions;
  if (Array.isArray(permissions)) {
    return permissions
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        const obj = asRecord(item);
        return String(obj.permission ?? obj.key ?? obj.name ?? '').trim();
      })
      .filter(Boolean);
  }
  return [];
}

function collectOperationEntries(manifest: Record<string, unknown>) {
  const operations = Array.isArray(manifest.operations) ? manifest.operations : [];
  const flows = Array.isArray(manifest.flows) ? manifest.flows : [];
  return operations.length ? operations : flows;
}

function collectProviderEntries(manifest: Record<string, unknown>) {
  return Array.isArray(manifest.providers) ? manifest.providers : [];
}

function collectFamilyHints(...sources: unknown[]): string[] {
  const output: string[] = [];
  for (const source of sources) {
    const direct = asStringList(source);
    if (direct.length) output.push(...direct);
    const obj = maybeJsonObject(source);
    if (Object.keys(obj).length) {
      output.push(...asStringList(obj.families));
      output.push(...asStringList(obj.supported_model_families));
      const constraints = asRecord(obj.model_constraints);
      output.push(...asStringList(constraints.families));
      const requirements = asRecord(obj.model_requirements);
      output.push(...asStringList(requirements.families));
    }
  }
  return uniq(output);
}

export function normalizeOperationSummary(entry: unknown): PackageOperationSummary | null {
  const obj = asRecord(entry);
  const operationKey = String(obj.operation_key ?? obj.workflow_key ?? '').trim();
  if (!operationKey) return null;
  return {
    operation_key: operationKey,
    workflow_key: typeof obj.workflow_key === 'string' ? obj.workflow_key : null,
    capability_key: typeof obj.capability_key === 'string'
      ? obj.capability_key
      : typeof obj.primary_capability === 'string'
        ? obj.primary_capability
        : null,
    display_name: typeof obj.display_name === 'string' ? obj.display_name : null,
    description: typeof obj.description === 'string' ? obj.description : null,
    default_provider_key: typeof obj.default_provider_key === 'string' ? obj.default_provider_key : null,
    default_model_key: typeof obj.default_model_key === 'string' ? obj.default_model_key : null,
    suggested_model_keys: asStringList(obj.suggested_model_keys),
    accepted_model_families: collectFamilyHints(
      obj.accepted_model_families,
      obj.model_requirements,
      obj.model_requirements_json,
    ),
    allow_user_model_override: typeof obj.allow_user_model_override === 'boolean' ? obj.allow_user_model_override : null,
    allow_cross_plugin_models: typeof obj.allow_cross_plugin_models === 'boolean' ? obj.allow_cross_plugin_models : null,
  };
}

export function normalizeProviderSummary(entry: unknown): PackageProviderSummary | null {
  const obj = asRecord(entry);
  const providerKey = String(obj.provider_key ?? obj.key ?? '').trim();
  if (!providerKey) return null;
  return {
    provider_key: providerKey,
    display_name: typeof obj.display_name === 'string' ? obj.display_name : typeof obj.name === 'string' ? obj.name : null,
    runtime_family: typeof obj.runtime_family === 'string'
      ? obj.runtime_family
      : typeof asRecord(obj.runtime).family === 'string'
        ? String(asRecord(obj.runtime).family)
        : null,
    operation_keys: uniq([
      ...asStringList(obj.operation_keys),
      ...asStringList(obj.workflow_keys),
    ]),
    default_for_operations: uniq([
      ...asStringList(obj.default_for_operations),
      ...asStringList(obj.default_for_workflows),
    ]),
    supported_model_families: collectFamilyHints(
      obj.supported_model_families,
      obj.model_constraints,
      obj.model_requirements,
      obj.model_requirements_json,
    ),
    requested_permissions: uniq([
      ...asStringList(obj.requested_permissions),
      ...collectPermissions(obj),
    ]),
    side_engine_key: typeof obj.side_engine_key === 'string' ? obj.side_engine_key : null,
  };
}

export function deriveManifestConsistencyWarnings(manifest: Pick<PackageManifestSummary, 'capabilities' | 'operations' | 'providers'>): string[] {
  const warnings: string[] = [];
  const operationKeys = new Set(manifest.operations.map((item) => item.operation_key));
  const capabilityKeys = new Set(manifest.capabilities);

  if (!manifest.operations.length) warnings.push('No operations declared in the package manifest.');
  if (!manifest.providers.length) warnings.push('No providers declared in the package manifest.');

  for (const operation of manifest.operations) {
    if (!operation.capability_key) {
      warnings.push(`Operation ${operation.operation_key} is missing capability_key.`);
    } else if (!capabilityKeys.has(operation.capability_key)) {
      warnings.push(`Operation ${operation.operation_key} references capability ${operation.capability_key}, but that capability is not declared at package level.`);
    }
    if (operation.default_model_key && operation.accepted_model_families.length === 0) {
      warnings.push(`Operation ${operation.operation_key} declares default_model_key ${operation.default_model_key} without accepted_model_families.`);
    }
  }

  for (const provider of manifest.providers) {
    if (!provider.operation_keys.length) warnings.push(`Provider ${provider.provider_key} does not declare operation_keys.`);
    for (const operationKey of provider.operation_keys) {
      if (!operationKeys.has(operationKey)) {
        warnings.push(`Provider ${provider.provider_key} references unknown operation ${operationKey}.`);
      }
    }
    for (const operationKey of provider.default_for_operations) {
      if (!provider.operation_keys.includes(operationKey)) {
        warnings.push(`Provider ${provider.provider_key} marks ${operationKey} as default but does not include it in operation_keys.`);
      }
    }
  }

  return uniq(warnings);
}

export function normalizeManifestSummary(entry: unknown, packageMetadata?: unknown): PackageManifestSummary | null {
  const manifest = asRecord(entry);
  if (!Object.keys(manifest).length) return null;
  const packageMetadataRecord = asRecord(packageMetadata);
  const operations = collectOperationEntries(manifest)
    .map(normalizeOperationSummary)
    .filter((item): item is PackageOperationSummary => !!item);
  const providers = collectProviderEntries(manifest)
    .map(normalizeProviderSummary)
    .filter((item): item is PackageProviderSummary => !!item);

  const summaryBase = {
    plugin_key: typeof manifest.plugin_key === 'string' ? manifest.plugin_key : typeof manifest.id === 'string' ? manifest.id : null,
    display_name: typeof manifest.display_name === 'string' ? manifest.display_name : typeof manifest.name === 'string' ? manifest.name : null,
    version: typeof manifest.version === 'string' ? manifest.version : typeof manifest.plugin_version === 'string' ? manifest.plugin_version : null,
    description: typeof manifest.description === 'string' ? manifest.description : null,
    capabilities: asStringList(manifest.capabilities),
    tags: asStringList(manifest.tags ?? manifest.keywords),
    categories: asStringList(manifest.categories),
    declared_channel:
      typeof manifest.declared_channel === 'string'
        ? manifest.declared_channel
        : typeof manifest.channel === 'string'
          ? manifest.channel
          : typeof packageMetadataRecord.distribution_channel === 'string'
            ? packageMetadataRecord.distribution_channel
            : null,
    manifest_version: typeof manifest.manifest_version === 'string' ? manifest.manifest_version : null,
    os_support: collectOsSupport(manifest, packageMetadataRecord),
    permissions: collectPermissions(manifest),
    operations,
    providers,
  } satisfies Omit<PackageManifestSummary, 'operation_count' | 'provider_count' | 'manifest_consistency_warnings'>;

  return {
    ...summaryBase,
    operation_count: operations.length,
    provider_count: providers.length,
    manifest_consistency_warnings: deriveManifestConsistencyWarnings(summaryBase),
  };
}
