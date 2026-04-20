import { Badge } from '../components/common/Badge';
import { Spinner } from '../components/common/Spinner';
import { PluginCardGrid } from '../components/plugins/PluginCardGrid';
import type { PackageOperationSummary, PackageProviderSummary, PublisherPlugin, PublisherRelease } from '../lib/types';
import { fmtDT } from '../lib/utils';

function isPluginInactive(plugin: PublisherPlugin | null | undefined) {
  if (!plugin) return false;
  const status = String(plugin.status || '').toLowerCase();
  return status.includes('deactivated') || status.includes('disabled') || !!plugin.deactivated_at;
}

function PluginActions({
  isBusy,
  onDeletePlugin,
  onTogglePlugin,
  plugin,
}: {
  isBusy: (key: string) => boolean;
  onDeletePlugin: (plugin: PublisherPlugin) => Promise<void> | void;
  onTogglePlugin: (plugin: PublisherPlugin) => Promise<void> | void;
  plugin: PublisherPlugin;
}) {
  const inactive = isPluginInactive(plugin);
  const toggleBusyKey = `${inactive ? 'enable' : 'disable'}-plugin-${plugin.plugin_key}`;
  const deleteBusyKey = `delete-plugin-${plugin.plugin_key}`;

  return (
    <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
      <button className="btn btn-secondary btn-sm" onClick={() => onTogglePlugin(plugin)} disabled={isBusy(toggleBusyKey)}>
        {isBusy(toggleBusyKey) ? <Spinner /> : inactive ? 'Enable' : 'Disable'}
      </button>
      <button className="btn btn-danger btn-sm" onClick={() => onDeletePlugin(plugin)} disabled={isBusy(deleteBusyKey)}>
        {isBusy(deleteBusyKey) ? <Spinner /> : 'Delete'}
      </button>
    </div>
  );
}


function PluginOperationSummary({ operations }: { operations: PackageOperationSummary[] }) {
  if (!operations.length) return <div className="stack-empty">No operations declared.</div>;
  return (
    <div className="publish-contract-list">
      {operations.map((operation) => (
        <div key={operation.operation_key} className="publish-contract-item">
          <div className="publish-contract-title-row">
            <span className="dval-mono">{operation.operation_key}</span>
            {operation.capability_key ? <span className="tag">{operation.capability_key}</span> : null}
          </div>
          <div className="publish-contract-sub">{operation.display_name || operation.description || 'No display name provided.'}</div>
          <div className="publish-file-list">
            {operation.default_model_key ? <span className="tag tag-soft">default model · {operation.default_model_key}</span> : null}
            {operation.default_provider_key ? <span className="tag tag-soft">default provider · {operation.default_provider_key}</span> : null}
            {operation.suggested_model_keys.map((modelKey) => <span key={`${operation.operation_key}-model-${modelKey}`} className="tag tag-soft">{modelKey}</span>)}
          </div>
        </div>
      ))}
    </div>
  );
}

function PluginProviderSummary({ providers }: { providers: PackageProviderSummary[] }) {
  if (!providers.length) return <div className="stack-empty">No providers declared.</div>;
  return (
    <div className="publish-contract-list">
      {providers.map((provider) => (
        <div key={provider.provider_key} className="publish-contract-item">
          <div className="publish-contract-title-row">
            <span className="dval-mono">{provider.provider_key}</span>
            {provider.runtime_family ? <span className="tag">{provider.runtime_family}</span> : null}
          </div>
          <div className="publish-file-list">
            {provider.operation_keys.map((operationKey) => <span key={`${provider.provider_key}-op-${operationKey}`} className="tag tag-soft">op · {operationKey}</span>)}
            {provider.default_for_operations.map((operationKey) => <span key={`${provider.provider_key}-default-${operationKey}`} className="tag">default · {operationKey}</span>)}
            {provider.supported_model_families.map((family) => <span key={`${provider.provider_key}-family-${family}`} className="tag tag-soft">family · {family}</span>)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReleaseRow({ isBusy, onRetire, release }: { isBusy: (key: string) => boolean; onRetire: (releaseId: string) => Promise<void> | void; release: PublisherRelease }) {
  return (
    <div className="release-item">
      <div className="col" style={{ flex: 1 }}>
        <div className="row wrap" style={{ gap: 6 }}>
          <strong>v{release.version}</strong>
          <Badge value={release.status} />
          {release.review_state && <Badge value={release.review_state} />}
          {release.release_channel && <Badge value={release.release_channel} />}
          {release.signature_status && <Badge value={release.signature_status} />}
          {release.developer_key_status && <Badge value={release.developer_key_status} />}
          {release.entitlement_policy && <span className="tag tag-soft">entitlement · {release.entitlement_policy}</span>}
          {release.offline_grace_days != null && release.entitlement_policy && release.entitlement_policy !== 'free' && <span className="tag tag-soft">offline grace · {release.offline_grace_days} days</span>}
          {typeof release.license_grants_issued === 'number' && release.license_grants_issued > 0 && <span className="tag tag-soft">{release.license_grants_issued} licenses issued</span>}
          {(release.install_policy_badges || []).map((badge) => <span key={badge} className="tag tag-soft">{badge}</span>)}
        </div>
        <div className="plugin-detail-meta">Created {fmtDT(release.created_at)} · Published {fmtDT(release.published_at)} · Approved {fmtDT(release.approved_at)}</div>
        {release.signature_key_id && <div className="mono-text">key_id · {release.signature_key_id}</div>}
        {release.changelog && <div className="helper-note">{release.changelog}</div>}
        {(release.policy_warnings?.length || release.commercial_warnings?.length) ? (
          <div className="publish-file-list">
            {(release.policy_warnings || []).map((item) => <span key={`p-${item}`} className="tag tag-soft">policy · {item}</span>)}
            {(release.commercial_warnings || []).map((item) => <span key={`c-${item}`} className="tag tag-soft">commercial · {item}</span>)}
          </div>
        ) : null}
      </div>
      <div className="release-actions">
        {(release.retire_allowed || release.disable_allowed) && (
          <button className="btn btn-danger btn-sm" disabled={isBusy(`retire-release-${release.release_id}`)} onClick={() => onRetire(release.release_id)}>
            {isBusy(`retire-release-${release.release_id}`) ? <Spinner /> : 'Retire'}
          </button>
        )}
      </div>
    </div>
  );
}

export function MyPluginsPage({
  isBusy,
  myPlugins,
  onDeletePlugin,
  onOpenPlugin,
  onRefresh,
  onRefreshReleases,
  onRetireRelease,
  onTogglePlugin,
  releases,
  selectedMyPlugin,
}: {
  isBusy: (key: string) => boolean;
  myPlugins: PublisherPlugin[];
  onDeletePlugin: (plugin: PublisherPlugin) => Promise<void> | void;
  onOpenPlugin: (pluginKey: string) => void;
  onRefresh: () => Promise<void> | void;
  onRefreshReleases: (pluginKey: string) => Promise<void> | void;
  onRetireRelease: (releaseId: string) => Promise<void> | void;
  onTogglePlugin: (plugin: PublisherPlugin) => Promise<void> | void;
  releases: PublisherRelease[];
  selectedMyPlugin: PublisherPlugin | null;
}) {
  const selectedInactive = isPluginInactive(selectedMyPlugin);
  const selectedToggleBusyKey = selectedMyPlugin ? `${selectedInactive ? 'enable' : 'disable'}-plugin-${selectedMyPlugin.plugin_key}` : '';
  const selectedDeleteBusyKey = selectedMyPlugin ? `delete-plugin-${selectedMyPlugin.plugin_key}` : '';

  return (
    <div className="vstack">
      <div className="ph">
        <div>
          <div className="ph-title">My plugins</div>
          <div className="ph-sub">Track plugin status, latest release, channel posture and signature state for your published plugins.</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onRefresh} disabled={isBusy('my-plugins')}>
          {isBusy('my-plugins') ? <Spinner /> : '⟳ Refresh'}
        </button>
      </div>

      <div className="g2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Plugin catalog</div>
              <div className="card-sub">Your plugins enriched with latest release metadata and backend policy badges.</div>
            </div>
          </div>
          <div className="card-body">
            <PluginCardGrid
              plugins={myPlugins}
              activeKey={selectedMyPlugin?.plugin_key}
              onOpen={onOpenPlugin}
              emptyState={<div className="empty"><div className="empty-icon">◈</div><div className="empty-title">No plugins published yet</div><div className="empty-sub">Use Publish to upload your first signed package.</div></div>}
              renderActions={(plugin) => (
                <>
                  <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => onOpenPlugin(plugin.plugin_key)}>Release history</button>
                  </div>
                  <PluginActions isBusy={isBusy} onDeletePlugin={onDeletePlugin} onTogglePlugin={onTogglePlugin} plugin={plugin} />
                </>
              )}
            />
          </div>
        </div>

        <div className="vstack">
          <div className="card">
            <div className="card-head row-between">
              <div>
                <div className="card-title">Plugin detail</div>
                <div className="card-sub">Expanded metadata, status and entitlement/install policies.</div>
              </div>
              {selectedMyPlugin && (
                <button className="btn btn-secondary btn-sm" onClick={() => onRefreshReleases(selectedMyPlugin.plugin_key)} disabled={isBusy(`releases-${selectedMyPlugin.plugin_key}`)}>
                  {isBusy(`releases-${selectedMyPlugin.plugin_key}`) ? <Spinner /> : '⟳ Refresh releases'}
                </button>
              )}
            </div>
            {!selectedMyPlugin ? (
              <div className="empty"><div className="empty-icon">⬡</div><div className="empty-title">Select a plugin</div><div className="empty-sub">Choose a plugin from the left to inspect releases and policy state.</div></div>
            ) : (
              <div className="card-body vstack">
                <div className="row wrap" style={{ gap: 8 }}>
                  <Badge value={selectedMyPlugin.status} />
                  <Badge value={selectedMyPlugin.plugin_type || selectedMyPlugin.trust_level} />
                  {selectedMyPlugin.latest_release_channel && <Badge value={selectedMyPlugin.latest_release_channel} />}
                  {(selectedMyPlugin.latest_signature_status || selectedMyPlugin.latest_release?.signature_status) && <Badge value={selectedMyPlugin.latest_signature_status || selectedMyPlugin.latest_release?.signature_status} />}
                  {selectedMyPlugin.entitlement_policy && <span className="tag tag-soft">entitlement · {selectedMyPlugin.entitlement_policy}</span>}
                  {selectedMyPlugin.offline_grace_days != null && selectedMyPlugin.entitlement_policy && selectedMyPlugin.entitlement_policy !== 'free' && <span className="tag tag-soft">offline grace · {selectedMyPlugin.offline_grace_days} days</span>}
                </div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => onTogglePlugin(selectedMyPlugin)} disabled={isBusy(selectedToggleBusyKey)}>
                    {isBusy(selectedToggleBusyKey) ? <Spinner /> : selectedInactive ? 'Enable plugin' : 'Disable plugin'}
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => onDeletePlugin(selectedMyPlugin)} disabled={isBusy(selectedDeleteBusyKey)}>
                    {isBusy(selectedDeleteBusyKey) ? <Spinner /> : 'Delete plugin'}
                  </button>
                </div>
                <div className="drow"><span className="dkey">Display name</span><span className="dval">{selectedMyPlugin.display_name}</span></div>
                <div className="drow"><span className="dkey">Plugin key</span><span className="dval-mono">{selectedMyPlugin.plugin_key}</span></div>
                <div className="drow"><span className="dkey">Publisher</span><span className="dval">{selectedMyPlugin.publisher || selectedMyPlugin.publisher_slug}</span></div>
                <div className="drow"><span className="dkey">Latest release</span><span className="dval">{selectedMyPlugin.latest_release ? `v${selectedMyPlugin.latest_release.version}` : '—'}</span></div>
                <div className="drow"><span className="dkey">Updated</span><span className="dval">{fmtDT(selectedMyPlugin.updated_at)}</span></div>
                {selectedMyPlugin.offline_grace_days != null && selectedMyPlugin.entitlement_policy && selectedMyPlugin.entitlement_policy !== 'free' && <div className="drow"><span className="dkey">Offline grace</span><span className="dval">{selectedMyPlugin.offline_grace_days} days</span></div>}
                {typeof selectedMyPlugin.latest_release?.license_grants_issued === 'number' && selectedMyPlugin.latest_release.license_grants_issued > 0 && <div className="drow"><span className="dkey">Licenses issued</span><span className="dval">{selectedMyPlugin.latest_release.license_grants_issued}</span></div>}
                {selectedMyPlugin.deactivated_at && <div className="drow"><span className="dkey">Deactivated</span><span className="dval">{fmtDT(selectedMyPlugin.deactivated_at)}</span></div>}
                {selectedMyPlugin.deactivation_reason && <div className="helper-note">Deactivation reason · {selectedMyPlugin.deactivation_reason}</div>}
                {selectedMyPlugin.description && <div className="helper-note">{selectedMyPlugin.description}</div>}
                <div className="publish-file-list">
                  {selectedMyPlugin.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
                  {selectedMyPlugin.categories.map((tag) => <span key={tag} className="tag tag-soft">{tag}</span>)}
                  {selectedMyPlugin.capabilities.map((tag) => <span key={tag} className="tag">{tag}</span>)}
                  {(selectedMyPlugin.install_policy_badges || []).map((tag) => <span key={tag} className="tag tag-soft">{tag}</span>)}
                  {(selectedMyPlugin.release_channel_badges || []).map((tag) => <span key={tag} className="tag tag-soft">{tag}</span>)}
                </div>
                <div className="validation-list-grid">
                  <div className="stack-list compact">
                    <div className="stack-head">Operations</div>
                    <PluginOperationSummary operations={selectedMyPlugin.operations || []} />
                  </div>
                  <div className="stack-list compact">
                    <div className="stack-head">Providers</div>
                    <PluginProviderSummary providers={selectedMyPlugin.providers || []} />
                  </div>
                </div>
                {selectedMyPlugin.manifest?.manifest_consistency_warnings?.length ? (
                  <div className="stack-list warn compact">
                    <div className="stack-head">Manifest consistency</div>
                    {selectedMyPlugin.manifest.manifest_consistency_warnings.map((warning) => <div key={warning} className="stack-item">{warning}</div>)}
                  </div>
                ) : null}
                {(selectedMyPlugin.policy_warnings?.length || selectedMyPlugin.commercial_warnings?.length) ? (
                  <div className="validation-list-grid">
                    <div className="stack-list warn">
                      <div className="stack-head">Policy warnings</div>
                      {(selectedMyPlugin.policy_warnings || []).length ? selectedMyPlugin.policy_warnings?.map((warning) => <div key={warning} className="stack-item">{warning}</div>) : <div className="stack-empty">No policy warnings</div>}
                    </div>
                    <div className="stack-list warn">
                      <div className="stack-head">Commercial warnings</div>
                      {(selectedMyPlugin.commercial_warnings || []).length ? selectedMyPlugin.commercial_warnings?.map((warning) => <div key={warning} className="stack-item">{warning}</div>) : <div className="stack-empty">No commercial warnings</div>}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Release history</div>
                <div className="card-sub">Private beta and marketplace releases stay visible separately.</div>
              </div>
            </div>
            {releases.length === 0 ? (
              <div className="empty"><div className="empty-icon">⇪</div><div className="empty-title">No releases loaded</div><div className="empty-sub">Select a plugin to inspect its release pipeline.</div></div>
            ) : (
              <div className="card-body vstack">
                {releases.map((release) => <ReleaseRow key={release.release_id} release={release} onRetire={onRetireRelease} isBusy={isBusy} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
