import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { Badge } from '../components/common/Badge';
import { CapabilityMultiSelect } from '../components/common/CapabilityMultiSelect';
import { FileDropZone } from '../components/common/FileDropZone';
import { Spinner } from '../components/common/Spinner';
import type { CapabilityOption, PackageValidationResult, PublishForm } from '../lib/types';

const entitlementOptions: Array<{
  value: PublishForm['entitlementPolicy'];
  label: string;
  description: string;
}> = [
  {
    value: 'free',
    label: 'Free',
    description: 'Anyone can install it. No license grant is required.',
  },
  {
    value: 'paid',
    label: 'Paid',
    description: 'Requires a marketplace license grant for installation and offline use.',
  },
  {
    value: 'freemium',
    label: 'Freemium',
    description: 'Basic access can be free while advanced capabilities use entitlement checks.',
  },
];

const graceOptions = [7, 14, 30, 60, 90];

function ValidationList({
  emptyLabel,
  items,
  title,
  tone,
}: {
  emptyLabel: string;
  items: string[];
  title: string;
  tone: 'info' | 'warn' | 'err';
}) {
  return (
    <div className={`stack-list ${tone}`}>
      <div className="stack-head">{title}</div>
      {items.length === 0 ? (
        <div className="stack-empty">{emptyLabel}</div>
      ) : (
        items.map((item) => (
          <div key={item} className="stack-item">
            {item}
          </div>
        ))
      )}
    </div>
  );
}

export function PublishPage({
  capabilityOptions,
  isBusy,
  onCapabilityRefresh,
  onIconSelected,
  onImagesSelected,
  onPackageSelected,
  options,
  packageValidation,
  publishDrag,
  publishForm,
  setPublishDrag,
  setPublishForm,
  onSubmit,
}: {
  capabilityOptions: CapabilityOption[];
  isBusy: (key: string) => boolean;
  onCapabilityRefresh: () => void;
  onIconSelected: (file: File | null) => void;
  onImagesSelected: (files: FileList | File[] | null) => void;
  onPackageSelected: (file: File | null) => void;
  options: Array<{ value: string; label: string; description: string }>;
  packageValidation: PackageValidationResult | null;
  publishDrag: { package: boolean; icon: boolean; images: boolean };
  publishForm: PublishForm;
  setPublishDrag: Dispatch<SetStateAction<{ package: boolean; icon: boolean; images: boolean }>>;
  setPublishForm: Dispatch<SetStateAction<PublishForm>>;
  onSubmit: (event: FormEvent) => Promise<void> | void;
}) {
  const validation = packageValidation;
  const manifest = validation?.manifest;

  return (
    <div className="vstack">
      <div className="ph">
        <div>
          <div className="ph-title">Publish pipeline</div>
          <div className="ph-sub">Separate package inspection, release configuration and final backend validation before submit.</div>
        </div>
        <button className="btn btn-secondary btn-sm" disabled={isBusy('capabilities')} onClick={onCapabilityRefresh}>
          {isBusy('capabilities') ? <Spinner /> : '⟳ Refresh capabilities'}
        </button>
      </div>

      <form onSubmit={onSubmit} className="vstack">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">A. Package</div>
              <div className="card-sub">
                Upload the signed <span className="tbl-mono">.lspkg</span> package. Backend now validates package metadata, real image payloads and request size more strictly.
              </div>
            </div>
          </div>
          <div className="card-body vstack">
            <div className="alert alert-info">Uploads are stricter now. Client-side checks catch oversized packages, invalid images and unsupported media before the request reaches the backend.</div>

            <div className="grid3-form publish-assets">
              <FileDropZone
                label="Package (.lspkg) *"
                hint={publishForm.packageFile ? publishForm.packageFile.name : 'Drop a .lspkg package (max 100 MB)'}
                accept=".lspkg"
                dragActive={publishDrag.package}
                hasFiles={!!publishForm.packageFile}
                multiple={false}
                onDragChange={(active) => setPublishDrag((state) => ({ ...state, package: active }))}
                onFiles={(files) => onPackageSelected(files[0] ?? null)}
              />
              <FileDropZone
                label="Icon (optional)"
                hint={publishForm.iconFile ? publishForm.iconFile.name : 'PNG, JPG, WEBP or GIF · max 10 MB'}
                accept=".png,.jpg,.jpeg,.webp,.gif"
                dragActive={publishDrag.icon}
                hasFiles={!!publishForm.iconFile}
                multiple={false}
                onDragChange={(active) => setPublishDrag((state) => ({ ...state, icon: active }))}
                onFiles={(files) => onIconSelected(files[0] ?? null)}
              />
              <FileDropZone
                label="Images (optional)"
                hint={publishForm.imageFiles.length ? `${publishForm.imageFiles.length} image(s) selected` : 'Up to 8 PNG/JPG/WEBP/GIF images · max 12 MB each'}
                accept=".png,.jpg,.jpeg,.webp,.gif"
                dragActive={publishDrag.images}
                hasFiles={publishForm.imageFiles.length > 0}
                multiple
                onDragChange={(active) => setPublishDrag((state) => ({ ...state, images: active }))}
                onFiles={(files) => onImagesSelected(files)}
              />
            </div>

            {(publishForm.packageFile || publishForm.iconFile || publishForm.imageFiles.length > 0) && (
              <div className="publish-file-list">
                {publishForm.packageFile && <span className="tag">package · {publishForm.packageFile.name}</span>}
                {publishForm.iconFile && <span className="tag">icon · {publishForm.iconFile.name}</span>}
                {publishForm.imageFiles.map((file) => (
                  <span key={file.name + file.size} className="tag">
                    image · {file.name}
                  </span>
                ))}
              </div>
            )}

            <div className="validation-grid">
              <div className="validation-card">
                <div className="validation-title">Manifest detected</div>
                <div className="drow">
                  <span className="dkey">Display name</span>
                  <span className="dval">{manifest?.display_name || 'Waiting for backend validation'}</span>
                </div>
                <div className="drow">
                  <span className="dkey">Plugin key</span>
                  <span className="dval-mono">{validation?.plugin_key || manifest?.plugin_key || '—'}</span>
                </div>
                <div className="drow">
                  <span className="dkey">Version</span>
                  <span className="dval">{manifest?.version || '—'}</span>
                </div>
                <div className="drow">
                  <span className="dkey">Declared channel</span>
                  <Badge value={manifest?.declared_channel || validation?.detected_channel} />
                </div>
                <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
                  <label className="field-label">Capabilities</label>
                  <div className="publish-file-list">
                    {(manifest?.capabilities || validation?.capabilities || []).length > 0 ? (
                      (manifest?.capabilities || validation?.capabilities || []).map((capability) => (
                        <span key={capability} className="tag">
                          {capability}
                        </span>
                      ))
                    ) : (
                      <span className="tag tag-soft">Not exposed yet</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="validation-card">
                <div className="validation-title">Signature</div>
                <div className="drow">
                  <span className="dkey">Status</span>
                  <Badge value={validation?.signature?.status || 'pending'} />
                </div>
                <div className="drow">
                  <span className="dkey">Key ID</span>
                  <span className="dval-mono">{validation?.signature?.key_id || '—'}</span>
                </div>
                <div className="drow">
                  <span className="dkey">Algorithm</span>
                  <span className="dval">{validation?.signature?.algorithm || '—'}</span>
                </div>
                <div className="drow">
                  <span className="dkey">Developer key status</span>
                  <Badge value={validation?.signature?.developer_key_status} />
                </div>
                <div className="drow">
                  <span className="dkey">Detected channel</span>
                  <Badge value={validation?.detected_channel || 'local_dev'} />
                </div>
                {validation?.summary && <div className="helper-note">{validation.summary}</div>}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">B. Release configuration</div>
              <div className="card-sub">Choose the release channel, entitlement policy and marketplace metadata. Local dev installs remain Desktop-only and are not published here.</div>
            </div>
          </div>
          <div className="card-body vstack">
            <div className="channel-grid">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`channel-card${publishForm.releaseChannel === option.value ? ' selected' : ''}`}
                  onClick={() => setPublishForm((current) => ({ ...current, releaseChannel: option.value }))}
                >
                  <div className="channel-card-head">
                    <Badge value={option.value} />
                  </div>
                  <div className="channel-card-title">{option.label}</div>
                  <div className="channel-card-sub">{option.description}</div>
                </button>
              ))}
            </div>

            <div className="field" style={{ margin: 0 }}>
              <label className="field-label">Entitlement policy</label>
              <div className="channel-grid">
                {entitlementOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`channel-card${publishForm.entitlementPolicy === option.value ? ' selected' : ''}`}
                    onClick={() =>
                      setPublishForm((current) => ({
                        ...current,
                        entitlementPolicy: option.value,
                        offlineGraceDays: option.value === 'free' ? 30 : current.offlineGraceDays,
                      }))
                    }
                  >
                    <div className="channel-card-head">
                      <Badge value={option.value} />
                    </div>
                    <div className="channel-card-title">{option.label}</div>
                    <div className="channel-card-sub">{option.description}</div>
                  </button>
                ))}
              </div>
              <span className="field-hint">This value is sent to the backend as <span className="tbl-mono">entitlement_policy</span>.</span>
            </div>

            {publishForm.entitlementPolicy !== 'free' && (
              <div className="field" style={{ margin: 0 }}>
                <label className="field-label">Grace period offline</label>
                <select
                  className="select"
                  value={String(publishForm.offlineGraceDays)}
                  onChange={(event) =>
                    setPublishForm((current) => ({
                      ...current,
                      offlineGraceDays: Number(event.target.value) || 30,
                    }))
                  }
                >
                  {graceOptions.map((days) => (
                    <option key={days} value={days}>
                      {days} days
                    </option>
                  ))}
                </select>
                <span className="field-hint">Days that the plugin can keep working offline after a subscription or entitlement check expires.</span>
              </div>
            )}

            <div className="grid2-form">
              <div className="field" style={{ margin: 0 }}>
                <label className="field-label">Display name *</label>
                <input
                  className="input"
                  required
                  value={publishForm.name}
                  onChange={(event) => setPublishForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="My Plugin"
                />
                <span className="field-hint">Plugin key is read from the package manifest. It is intentionally not editable here.</span>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="field-label">Capabilities</label>
                <CapabilityMultiSelect
                  options={capabilityOptions}
                  value={publishForm.capabilities}
                  onChange={(next) => setPublishForm((current) => ({ ...current, capabilities: next }))}
                  loading={isBusy('capabilities')}
                />
              </div>
            </div>

            <div className="field">
              <label className="field-label">Description</label>
              <textarea
                className="textarea"
                rows={3}
                value={publishForm.description}
                onChange={(event) => setPublishForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="What does this plugin do?"
              />
            </div>

            <div className="grid2-form">
              <div className="field" style={{ margin: 0 }}>
                <label className="field-label">Tags</label>
                <input
                  className="input"
                  value={publishForm.tags}
                  onChange={(event) => setPublishForm((current) => ({ ...current, tags: event.target.value }))}
                  placeholder="audio, transcribe"
                />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="field-label">Categories</label>
                <input
                  className="input"
                  value={publishForm.categories}
                  onChange={(event) => setPublishForm((current) => ({ ...current, categories: event.target.value }))}
                  placeholder="speech, media"
                />
              </div>
            </div>

            <div className="field">
              <label className="field-label">YouTube links</label>
              <textarea
                className="textarea"
                rows={3}
                value={publishForm.videoLinks}
                onChange={(event) => setPublishForm((current) => ({ ...current, videoLinks: event.target.value }))}
                placeholder={'One per line or comma separated\nhttps://www.youtube.com/watch?v=...'}
              />
              <span className="field-hint">Only HTTPS links from YouTube are accepted.</span>
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
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">C. Validation & submit</div>
              <div className="card-sub">Review conflicts, policy warnings, signature state and commercial posture before submit.</div>
            </div>
          </div>
          <div className="card-body vstack">
            <div className="validation-list-grid">
              <ValidationList title="Warnings" tone="info" items={validation?.warnings || []} emptyLabel="No warnings reported" />
              <ValidationList title="Conflicts" tone="warn" items={validation?.conflicts || []} emptyLabel="No conflicts reported" />
              <ValidationList title="Policy warnings" tone="warn" items={validation?.policy_warnings || []} emptyLabel="No policy warnings" />
              <ValidationList title="Commercial warnings" tone="warn" items={validation?.commercial_warnings || []} emptyLabel="No commercial warnings" />
              <ValidationList title="Errors" tone="err" items={validation?.errors || []} emptyLabel="No blocking errors" />
            </div>

            {((validation?.install_policy_badges?.length || 0) > 0 || validation?.release_channel || validation?.entitlement_policy) && (
              <div className="publish-file-list">
                {validation?.release_channel && <span className="tag tag-soft">submit channel · {validation.release_channel}</span>}
                {(validation?.entitlement_policy || publishForm.entitlementPolicy) && (
                  <span className="tag tag-soft">entitlement · {validation?.entitlement_policy || publishForm.entitlementPolicy}</span>
                )}
                {publishForm.entitlementPolicy !== 'free' && <span className="tag tag-soft">offline grace · {publishForm.offlineGraceDays} days</span>}
                {(validation?.install_policy_badges || []).map((badge) => (
                  <span key={badge} className="tag tag-soft">
                    {badge}
                  </span>
                ))}
              </div>
            )}

            <div className="alert alert-info">
              Security is enforced by backend contracts. This UI does not store private keys, does not perform local installs, does not expose internal storage paths and does not replace backend signature, namespace or entitlement checks.
            </div>

            <button className="btn btn-primary btn-full" type="submit" disabled={isBusy('publish') || !publishForm.packageFile || (validation?.errors.length || 0) > 0}>
              {isBusy('publish') ? (
                <>
                  <Spinner /> Publishing…
                </>
              ) : (
                `Submit ${publishForm.releaseChannel === 'marketplace_release' ? 'marketplace release' : 'private beta'}`
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
