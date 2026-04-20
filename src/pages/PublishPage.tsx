import { useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { Badge } from '../components/common/Badge';
import { CapabilityMultiSelect } from '../components/common/CapabilityMultiSelect';
import { FileDropZone } from '../components/common/FileDropZone';
import { Spinner } from '../components/common/Spinner';
import type {
  CapabilityOption,
  DeveloperStatus,
  PackageClientInspection,
  PackageManifestSummary,
  PackageOperationSummary,
  PackageProviderSummary,
  PackageValidationResult,
  PublishForm,
} from '../lib/types';

type PublishStep = 1 | 2 | 3;

type GateState = {
  tone: 'ok' | 'warn';
  canSubmit: boolean;
  message: string;
  actionLabel?: string;
};

const entitlementOptions: Array<{
  value: PublishForm['entitlementPolicy'];
  label: string;
  description: string;
  disabled?: boolean;
}> = [
  {
    value: 'free',
    label: 'Free',
    description: 'Anyone can install it. No license grant is required.',
  },
  {
    value: 'paid',
    label: 'Paid / Freemium',
    description: 'Requires license grant. Not available yet.',
    disabled: true,
  },
  {
    value: 'freemium',
    label: 'Paid / Freemium',
    description: 'Requires license grant. Not available yet.',
    disabled: true,
  },
];

const reviewColumns: Array<{ key: keyof Pick<PackageValidationResult, 'warnings' | 'conflicts' | 'policy_warnings'>; label: string; tone: 'warn' | 'ok' }> = [
  { key: 'warnings', label: 'Warnings', tone: 'warn' },
  { key: 'conflicts', label: 'Conflicts', tone: 'ok' },
  { key: 'policy_warnings', label: 'Policy', tone: 'ok' },
];

function uniq(items: Array<string | null | undefined>) {
  return [...new Set(items.map((item) => String(item || '').trim()).filter(Boolean))];
}

function StepPill({ step, current, done, label, onClick }: { step: PublishStep; current: boolean; done: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" className={`publish-step-pill${current ? ' current' : ''}${done ? ' done' : ''}`} onClick={onClick}>
      <span className="publish-step-pill-num">{step}</span>
      <span>{label}</span>
    </button>
  );
}

function SummaryList({ title, tone, items, emptyLabel }: { title: string; tone: 'warn' | 'ok' | 'info'; items: string[]; emptyLabel: string }) {
  return (
    <div className={`publish-summary-card ${tone}`}>
      <div className="publish-summary-title">{title}</div>
      {items.length === 0 ? <div className="publish-summary-empty">{emptyLabel}</div> : (
        <div className="publish-summary-list">
          {items.map((item) => <div key={`${title}-${item}`} className="publish-summary-item">• {item}</div>)}
        </div>
      )}
    </div>
  );
}


function OperationContractList({ operations }: { operations: PackageOperationSummary[] }) {
  if (operations.length === 0) {
    return <div className="publish-summary-empty">No operations declared in manifest.</div>;
  }
  return (
    <div className="publish-contract-list">
      {operations.map((operation) => (
        <div key={operation.operation_key} className="publish-contract-item">
          <div className="publish-contract-title-row">
            <span className="dval-mono">{operation.operation_key}</span>
            {operation.capability_key ? <span className="tag">{operation.capability_key}</span> : <span className="tag tag-soft">missing capability</span>}
          </div>
          <div className="publish-contract-sub">{operation.display_name || operation.description || 'No display name provided.'}</div>
          <div className="publish-file-list">
            {operation.default_model_key ? <span className="tag tag-soft">default model · {operation.default_model_key}</span> : <span className="tag tag-soft">no default model</span>}
            {operation.default_provider_key ? <span className="tag tag-soft">default provider · {operation.default_provider_key}</span> : null}
            {(operation.accepted_model_families || []).map((family) => <span key={`${operation.operation_key}-family-${family}`} className="tag tag-soft">family · {family}</span>)}
            {operation.allow_user_model_override != null ? <span className="tag tag-soft">user override · {String(operation.allow_user_model_override)}</span> : null}
            {operation.allow_cross_plugin_models != null ? <span className="tag tag-soft">cross-plugin models · {String(operation.allow_cross_plugin_models)}</span> : null}
          </div>
          {operation.suggested_model_keys.length ? (
            <div className="publish-file-list">
              {operation.suggested_model_keys.map((modelKey) => <span key={`${operation.operation_key}-model-${modelKey}`} className="tag">{modelKey}</span>)}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ProviderContractList({ providers }: { providers: PackageProviderSummary[] }) {
  if (providers.length === 0) {
    return <div className="publish-summary-empty">No providers declared in manifest.</div>;
  }
  return (
    <div className="publish-contract-list">
      {providers.map((provider) => (
        <div key={provider.provider_key} className="publish-contract-item">
          <div className="publish-contract-title-row">
            <span className="dval-mono">{provider.provider_key}</span>
            {provider.runtime_family ? <span className="tag">{provider.runtime_family}</span> : <span className="tag tag-soft">runtime missing</span>}
          </div>
          <div className="publish-contract-sub">{provider.display_name || 'No display name provided.'}</div>
          <div className="publish-file-list">
            {(provider.operation_keys || []).map((operationKey) => <span key={`${provider.provider_key}-operation-${operationKey}`} className="tag tag-soft">op · {operationKey}</span>)}
            {(provider.default_for_operations || []).map((operationKey) => <span key={`${provider.provider_key}-default-${operationKey}`} className="tag">default · {operationKey}</span>)}
            {(provider.supported_model_families || []).map((family) => <span key={`${provider.provider_key}-family-${family}`} className="tag tag-soft">family · {family}</span>)}
            {provider.side_engine_key ? <span className="tag tag-soft">side engine · {provider.side_engine_key}</span> : null}
          </div>
          {provider.requested_permissions.length ? (
            <div className="publish-file-list">
              {provider.requested_permissions.map((permission) => <span key={`${provider.provider_key}-permission-${permission}`} className="tag tag-soft">{permission}</span>)}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ContractOverviewCards({ manifest }: { manifest: PackageManifestSummary | null | undefined }) {
  if (!manifest) return null;
  return (
    <div className="validation-grid publish-contract-grid">
      <div className="validation-card">
        <div className="validation-title">Operations</div>
        <div className="helper-note" style={{ marginBottom: 10 }}>The package now publishes operations as the canonical contract. Legacy flows remain backend-compatible only.</div>
        <OperationContractList operations={manifest.operations} />
      </div>
      <div className="validation-card">
        <div className="validation-title">Providers</div>
        <div className="helper-note" style={{ marginBottom: 10 }}>Providers define executable backends, runtime family, operation coverage and effective permissions.</div>
        <ProviderContractList providers={manifest.providers} />
      </div>
      <div className="validation-card">
        <div className="validation-title">Contract consistency</div>
        <div className="drow"><span className="dkey">operation count</span><span className="dval">{manifest.operation_count}</span></div>
        <div className="drow"><span className="dkey">provider count</span><span className="dval">{manifest.provider_count}</span></div>
        <div className="drow"><span className="dkey">capabilities</span><span className="dval">{manifest.capabilities.length ? manifest.capabilities.join(', ') : '—'}</span></div>
        {manifest.manifest_consistency_warnings.length ? (
          <div className="publish-inline-notes">
            {manifest.manifest_consistency_warnings.map((warning) => <div key={warning} className="publish-inline-note warn">• {warning}</div>)}
          </div>
        ) : (
          <div className="publish-summary-empty">No contract consistency issues detected.</div>
        )}
      </div>
    </div>
  );
}

function detectGate(developerStatus: DeveloperStatus): GateState {
  const remoteRegistered = developerStatus.remote_key?.state === 'registered' || (developerStatus.signing_keys_registered ?? 0) > 0;
  if (developerStatus.authorized === false) {
    return {
      tone: 'warn',
      canSubmit: false,
      message: 'Developer Mode requires a remote account with publishing enabled.',
      actionLabel: 'Open Developer tab',
    };
  }
  if (developerStatus.remote_key?.matches_local_key === false) {
    return {
      tone: 'warn',
      canSubmit: false,
      message: 'Your local signing key does not match the registered remote key. Regenerate or register the correct keypair first.',
      actionLabel: 'Open Developer tab',
    };
  }
  if (!remoteRegistered) {
    return {
      tone: 'warn',
      canSubmit: false,
      message: "No registered developer key — your package signature won't be validated. Go to Developer tab to generate and register a keypair.",
      actionLabel: 'Set up key',
    };
  }
  return {
    tone: 'ok',
    canSubmit: true,
    message: 'Developer key is registered and ready for backend signature validation.',
  };
}

export function PublishPage({
  capabilityOptions,
  developerStatus,
  isBusy,
  onCapabilityRefresh,
  onIconSelected,
  onImagesSelected,
  onOpenDeveloper,
  onPackageSelected,
  options,
  packageInspection,
  packageValidation,
  publishDrag,
  publishForm,
  setPublishDrag,
  setPublishForm,
  onSubmit,
}: {
  capabilityOptions: CapabilityOption[];
  developerStatus: DeveloperStatus;
  isBusy: (key: string) => boolean;
  onCapabilityRefresh: () => void;
  onIconSelected: (file: File | null) => void | Promise<void>;
  onImagesSelected: (files: FileList | File[] | null) => void | Promise<void>;
  onOpenDeveloper: () => void;
  onPackageSelected: (file: File | null) => void | Promise<void>;
  options: Array<{ value: string; label: string; description: string }>;
  packageInspection: PackageClientInspection | null;
  packageValidation: PackageValidationResult | null;
  publishDrag: { package: boolean; icon: boolean; images: boolean };
  publishForm: PublishForm;
  setPublishDrag: Dispatch<SetStateAction<{ package: boolean; icon: boolean; images: boolean }>>;
  setPublishForm: Dispatch<SetStateAction<PublishForm>>;
  onSubmit: (event: FormEvent) => Promise<void> | void;
}) {
  const [step, setStep] = useState<PublishStep>(1);
  const [pageDropActive, setPageDropActive] = useState(false);

  useEffect(() => {
    const onDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types?.includes('Files')) return;
      event.preventDefault();
      setPageDropActive(true);
    };

    const onDrop = (event: DragEvent) => {
      if (!event.dataTransfer?.files?.length) return;
      event.preventDefault();
      setPageDropActive(false);
      const packageFile = Array.from(event.dataTransfer.files).find((file) => file.name.toLowerCase().endsWith('.lspkg')) || null;
      if (packageFile) {
        setStep(1);
        void onPackageSelected(packageFile);
      }
    };

    const onWindowLeave = () => setPageDropActive(false);

    document.addEventListener('dragover', onDragOver);
    document.addEventListener('drop', onDrop);
    window.addEventListener('dragleave', onWindowLeave);
    window.addEventListener('blur', onWindowLeave);

    return () => {
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('drop', onDrop);
      window.removeEventListener('dragleave', onWindowLeave);
      window.removeEventListener('blur', onWindowLeave);
    };
  }, [onPackageSelected]);

  const manifest = packageValidation?.manifest || packageInspection?.manifest;
  const gate = detectGate(developerStatus);
  const detectedChannel = packageValidation?.detected_channel || packageInspection?.package_metadata?.distribution_channel || manifest?.declared_channel || publishForm.releaseChannel;
  const packageWarnings = uniq([...(packageInspection?.warnings || []), ...(packageValidation?.warnings || [])]);
  const packageErrors = uniq([...(packageInspection?.errors || []), ...(packageValidation?.errors || [])]);
  const declaredCapabilities = manifest?.capabilities || [];
  const declaredOperations = manifest?.operations || [];
  const declaredProviders = manifest?.providers || [];
  const consistencyWarnings = manifest?.manifest_consistency_warnings || [];
  const signatureStatus = packageValidation?.signature?.status || packageInspection?.signature.status || 'pending';
  const signatureKeyId = packageValidation?.signature?.key_id || packageInspection?.signature.key_id || null;
  const signatureAlgorithm = packageValidation?.signature?.algorithm || packageInspection?.signature.algorithm || null;
  const developerKeyStatus = packageValidation?.signature?.developer_key_status || (gate.canSubmit ? 'registered' : 'not_registered');
  const osSupport = manifest?.os_support || [];
  const permissions = manifest?.permissions || [];
  const reviewWarnings = uniq([...(packageWarnings || []), ...(packageValidation?.commercial_warnings || []), ...(packageValidation?.errors || [])]);

  const packageStepReady = !!publishForm.packageFile && packageErrors.length === 0;
  const configStepReady = packageStepReady && !!publishForm.name.trim() && !!publishForm.description.trim() && publishForm.capabilities.length > 0;
  const canSubmit = configStepReady && gate.canSubmit && packageErrors.length === 0 && !isBusy('publish');

  useEffect(() => {
    if (!publishForm.packageFile) setStep(1);
  }, [publishForm.packageFile]);

  const submitLabel = gate.canSubmit
    ? `Submit ${publishForm.releaseChannel === 'marketplace_release' ? 'marketplace release' : 'private beta'}`
    : 'Submit marketplace release';

  const summaryItems = useMemo(() => ([
    { label: 'Plugin', value: `${manifest?.plugin_key || '—'} ${manifest?.version ? `v${manifest.version}` : ''}`.trim() },
    { label: 'Channel', value: publishForm.releaseChannel },
    { label: 'Capabilities', value: publishForm.capabilities.length ? publishForm.capabilities.join(', ') : '—' },
    { label: 'Operations', value: declaredOperations.length ? String(declaredOperations.length) : '—' },
    { label: 'Providers', value: declaredProviders.length ? String(declaredProviders.length) : '—' },
    { label: 'Entitlement', value: publishForm.entitlementPolicy },
    { label: 'Signature', value: signatureStatus },
    { label: 'Developer key', value: developerKeyStatus },
    {
      label: 'After submit',
      value: publishForm.releaseChannel === 'marketplace_release'
        ? 'in_review → deep_security_scan → admin_approval'
        : 'private_beta_ready',
    },
  ]), [developerKeyStatus, manifest?.plugin_key, manifest?.version, publishForm.entitlementPolicy, publishForm.releaseChannel, signatureStatus]);

  return (
    <div className="vstack publish-flow-root">
      {pageDropActive && (
        <div className="publish-drop-overlay">
          <div className="publish-drop-overlay-card">
            <div className="publish-drop-overlay-title">Drop your .lspkg to publish</div>
            <div className="publish-drop-overlay-sub">The package will be inspected client-side first and then validated by the backend.</div>
          </div>
        </div>
      )}

      <div className="publish-stepper">
        <StepPill step={1} label="Package & validation" current={step === 1} done={packageStepReady} onClick={() => setStep(1)} />
        <StepPill step={2} label="Release configuration" current={step === 2} done={configStepReady} onClick={() => setStep(packageStepReady ? 2 : 1)} />
        <StepPill step={3} label="Review & submit" current={step === 3} done={false} onClick={() => setStep(configStepReady ? 3 : packageStepReady ? 2 : 1)} />
      </div>

      <div className={`alert ${gate.tone === 'ok' ? 'alert-success' : 'alert-warn'} publish-key-alert`}>
        <div className="publish-key-alert-copy">{gate.message}</div>
        {gate.actionLabel ? <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenDeveloper}>{gate.actionLabel}</button> : null}
      </div>

      <form onSubmit={onSubmit} className="vstack">
        {step === 1 && (
          <div className="card publish-stage-card">
            <div className="card-head publish-stage-head">
              <div>
                <div className="card-title">A. Package</div>
                <div className="card-sub">Drag the signed .lspkg anywhere on the page, or choose it here.</div>
              </div>
            </div>
            <div className="card-body vstack">
              <div className="grid3-form publish-assets">
                <FileDropZone
                  label="Package (.lspkg) *"
                  hint={publishForm.packageFile ? `${publishForm.packageFile.name}\n${(publishForm.packageFile.size / (1024 * 1024)).toFixed(1)} MB · parsed ${packageErrors.length ? 'with issues' : 'OK'}` : 'Drop a .lspkg package here, anywhere on the page, or browse.'}
                  accept=".lspkg"
                  dragActive={publishDrag.package}
                  hasFiles={!!publishForm.packageFile}
                  multiple={false}
                  onDragChange={(active) => setPublishDrag((state) => ({ ...state, package: active }))}
                  onFiles={(files) => void onPackageSelected(files[0] ?? null)}
                />
                <FileDropZone
                  label="Icon (optional)"
                  hint={publishForm.iconFile ? publishForm.iconFile.name : 'PNG, JPG, WEBP, GIF\nmax 10 MB'}
                  accept=".png,.jpg,.jpeg,.webp,.gif"
                  dragActive={publishDrag.icon}
                  hasFiles={!!publishForm.iconFile}
                  multiple={false}
                  onDragChange={(active) => setPublishDrag((state) => ({ ...state, icon: active }))}
                  onFiles={(files) => void onIconSelected(files[0] ?? null)}
                />
                <FileDropZone
                  label="Images (optional)"
                  hint={publishForm.imageFiles.length ? `${publishForm.imageFiles.length} image(s) selected` : 'Up to 8 images\nmax 12 MB each'}
                  accept=".png,.jpg,.jpeg,.webp,.gif"
                  dragActive={publishDrag.images}
                  hasFiles={publishForm.imageFiles.length > 0}
                  multiple
                  onDragChange={(active) => setPublishDrag((state) => ({ ...state, images: active }))}
                  onFiles={(files) => void onImagesSelected(files)}
                />
              </div>

              <div className="validation-grid publish-top-grid">
                <div className="validation-card">
                  <div className="validation-title">Manifest detected (client-side)</div>
                  <div className="drow"><span className="dkey">plugin_key</span><span className="dval-mono">{manifest?.plugin_key || '—'}</span></div>
                  <div className="drow"><span className="dkey">version</span><span className="dval-mono">{manifest?.version || '—'}</span></div>
                  <div className="drow"><span className="dkey">display_name</span><span className="dval">{manifest?.display_name || '—'}</span></div>
                  <div className="drow"><span className="dkey">publisher</span><span className="dval">{developerStatus.publisher?.display_name || developerStatus.publisher?.slug || '—'}</span></div>
                  <div className="drow"><span className="dkey">declared capabilities</span><div className="publish-file-list">{declaredCapabilities.length ? declaredCapabilities.map((capability) => <span key={capability} className="tag">{capability}</span>) : <span className="tag tag-soft">—</span>}</div></div>
                  <div className="drow"><span className="dkey">operations</span><span className="dval">{declaredOperations.length || '—'}</span></div>
                  <div className="drow"><span className="dkey">providers</span><span className="dval">{declaredProviders.length || '—'}</span></div>
                  <div className="drow"><span className="dkey">os_support</span><div className="publish-file-list">{osSupport.length ? osSupport.map((item) => <span key={item} className="tag">{item}</span>) : <span className="tag tag-soft">—</span>}</div></div>
                  <div className="drow"><span className="dkey">permissions</span><div className="publish-file-list">{permissions.length ? permissions.map((item) => <span key={item} className="tag tag-soft">{item}</span>) : <span className="tag tag-soft">—</span>}</div></div>
                </div>

                <div className="validation-card">
                  <div className="validation-title">Signature & backend validation</div>
                  <div className="drow"><span className="dkey">signature</span><Badge value={signatureStatus} /></div>
                  <div className="drow"><span className="dkey">key_id</span><span className="dval-mono">{signatureKeyId || '—'}</span></div>
                  <div className="drow"><span className="dkey">algorithm</span><span className="dval">{signatureAlgorithm || '—'}</span></div>
                  <div className="drow"><span className="dkey">dev key status</span><Badge value={developerKeyStatus} /></div>
                  <div className="drow"><span className="dkey">detected channel</span><Badge value={detectedChannel} /></div>
                  <div className="drow"><span className="dkey">security scan</span><Badge value={packageValidation?.security_scan_status || (packageWarnings.length ? 'warning' : 'pending')} /></div>
                  <div className="drow"><span className="dkey">contract warnings</span><span className="dval">{consistencyWarnings.length}</span></div>
                  <div className="publish-inline-notes">
                    {packageWarnings.map((warning) => <div key={warning} className="publish-inline-note warn">• {warning}</div>)}
                    {packageErrors.map((error) => <div key={error} className="publish-inline-note err">• {error}</div>)}
                  </div>
                </div>
              </div>

              <ContractOverviewCards manifest={manifest} />

              <div className="publish-stage-actions">
                <button type="button" className="btn btn-secondary" onClick={onCapabilityRefresh} disabled={isBusy('capabilities') || isBusy('package-validate')}>
                  {isBusy('package-validate') || isBusy('capabilities') ? <Spinner /> : 'Refresh package status'}
                </button>
                <button type="button" className="btn btn-primary" disabled={!packageStepReady} onClick={() => setStep(2)}>
                  Continue to release config →
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="card publish-stage-card">
            <div className="card-head publish-stage-head">
              <div>
                <div className="card-title">B. Release configuration</div>
                <div className="card-sub">Fields preloaded from the manifest remain editable where safe.</div>
              </div>
            </div>
            <div className="card-body vstack">
              <div className="field" style={{ margin: 0 }}>
                <label className="field-label">Distribution channel</label>
                <div className="channel-grid">
                  {options.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`channel-card${publishForm.releaseChannel === option.value ? ' selected' : ''}`}
                      onClick={() => setPublishForm((current) => ({ ...current, releaseChannel: option.value }))}
                    >
                      <div className="channel-card-head"><Badge value={option.value} /></div>
                      <div className="channel-card-title">{option.label}</div>
                      <div className="channel-card-sub">{option.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label className="field-label">Entitlement policy</label>
                <div className="channel-grid">
                  {entitlementOptions.map((option, index) => (
                    <button
                      key={`${option.value}-${index}`}
                      type="button"
                      disabled={option.disabled}
                      className={`channel-card${publishForm.entitlementPolicy === option.value ? ' selected' : ''}${option.disabled ? ' disabled' : ''}`}
                      onClick={() => option.disabled ? undefined : setPublishForm((current) => ({ ...current, entitlementPolicy: option.value }))}
                    >
                      <div className="channel-card-head"><Badge value={option.disabled ? 'coming soon' : option.value} /></div>
                      <div className="channel-card-title">{option.label}</div>
                      <div className="channel-card-sub">{option.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid2-form publish-readonly-grid">
                <div className="field" style={{ margin: 0 }}>
                  <label className="field-label">Plugin key</label>
                  <input className="input mono-text" value={manifest?.plugin_key || ''} readOnly placeholder="Read only from manifest" />
                  <span className="field-hint">Pulled from the manifest to preserve namespace integrity.</span>
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label className="field-label">Version</label>
                  <input className="input mono-text" value={manifest?.version || ''} readOnly placeholder="Read only from manifest" />
                  <span className="field-hint">Version only changes when the package is rebuilt.</span>
                </div>
              </div>

              <div className="grid2-form">
                <div className="field" style={{ margin: 0 }}>
                  <label className="field-label">Display name *</label>
                  <input
                    className="input"
                    required
                    value={publishForm.name}
                    onChange={(event) => setPublishForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Image Enhancer Pro"
                  />
                  <span className="field-hint">Preloaded from manifest.display_name. Editable.</span>
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label className="field-label">Capabilities</label>
                  <CapabilityMultiSelect
                    options={capabilityOptions}
                    value={publishForm.capabilities}
                    onChange={(next) => setPublishForm((current) => ({ ...current, capabilities: next }))}
                    loading={isBusy('capabilities')}
                  />
                  <span className="field-hint">Only the capabilities you explicitly choose here are submitted. No inferred extras are added from operations.</span>
                </div>
              </div>

              <div className="field">
                <label className="field-label">Description *</label>
                <textarea
                  className="textarea"
                  rows={4}
                  value={publishForm.description}
                  onChange={(event) => setPublishForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Enhances and upscales images using a local diffusion backend."
                />
              </div>

              <div className="grid2-form">
                <div className="field" style={{ margin: 0 }}>
                  <label className="field-label">Tags</label>
                  <input className="input" value={publishForm.tags} onChange={(event) => setPublishForm((current) => ({ ...current, tags: event.target.value }))} placeholder="image, enhancement, sdxl" />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label className="field-label">Categories</label>
                  <input className="input" value={publishForm.categories} onChange={(event) => setPublishForm((current) => ({ ...current, categories: event.target.value }))} placeholder="generation, editing" />
                </div>
              </div>

              <div className="field">
                <label className="field-label">YouTube links (optional)</label>
                <textarea
                  className="textarea"
                  rows={3}
                  value={publishForm.videoLinks}
                  onChange={(event) => setPublishForm((current) => ({ ...current, videoLinks: event.target.value }))}
                  placeholder={'https://www.youtube.com/watch?v=...\nOne per line. HTTPS YouTube only.'}
                />
              </div>

              <div className="field">
                <label className="field-label">Release notes</label>
                <textarea
                  className="textarea"
                  rows={3}
                  value={publishForm.changelog}
                  onChange={(event) => setPublishForm((current) => ({ ...current, changelog: event.target.value }))}
                  placeholder="What changed in this release?"
                />
              </div>

              <div className="publish-stage-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
                <button type="button" className="btn btn-primary" disabled={!configStepReady} onClick={() => setStep(3)}>Continue to review →</button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="card publish-stage-card">
            <div className="card-head publish-stage-head">
              <div>
                <div className="card-title">C. Review & submit</div>
                <div className="card-sub">Review warnings, signature state and policy posture before sending the release.</div>
              </div>
            </div>
            <div className="card-body vstack">
              <div className="publish-review-grid">
                {reviewColumns.map((column) => {
                  const items = column.key === 'warnings'
                    ? reviewWarnings
                    : uniq([...(packageValidation?.[column.key] || []) as string[]]);
                  return (
                    <SummaryList
                      key={column.key}
                      title={column.label}
                      tone={column.tone}
                      items={items}
                      emptyLabel={column.key === 'conflicts' ? 'No conflicts detected' : column.key === 'policy_warnings' ? 'marketplace_release allowed' : 'No warnings detected'}
                    />
                  );
                })}
              </div>

              {manifest ? <div className="validation-card"><div className="validation-title">Operation contract snapshot</div><div className="publish-file-list">{declaredOperations.map((operation) => <span key={operation.operation_key} className="tag">{operation.operation_key}</span>)}{declaredProviders.map((provider) => <span key={provider.provider_key} className="tag tag-soft">provider · {provider.provider_key}</span>)}</div></div> : null}

              <div className="validation-card publish-submit-summary">
                <div className="validation-title">Submit summary</div>
                {summaryItems.map((item) => (
                  <div key={item.label} className="drow">
                    <span className="dkey">{item.label}</span>
                    <span className="dval">{item.value}</span>
                  </div>
                ))}
              </div>

              <div className="alert alert-info">
                The backend does not store private keys, does not access local filesystem paths and does not replace backend checks for signature, namespace and entitlement.
              </div>

              <div className="publish-stage-actions publish-submit-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setStep(2)}>← Back to configuration</button>
                <button className="btn btn-primary btn-full" type="submit" disabled={!canSubmit}>
                  {isBusy('publish') ? <><Spinner /> Publishing…</> : `${submitLabel}${gate.canSubmit ? '' : ' (register a dev key to enable)'}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
