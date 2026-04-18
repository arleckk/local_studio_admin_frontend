import { Badge } from '../components/common/Badge';
import { Spinner } from '../components/common/Spinner';
import { PluginCardGrid } from '../components/plugins/PluginCardGrid';
import type { PublisherPlugin, PublisherRelease } from '../lib/types';
import { fmtDT } from '../lib/utils';

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
          {release.entitlement_policy && <span className="tag tag-soft">{release.entitlement_policy}</span>}
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

export function MyPluginsPage({ isBusy, myPlugins, onDisablePlugin, onOpenPlugin, onRefresh, onRefreshReleases, onRetireRelease, releases, selectedMyPlugin }: { isBusy: (key: string) => boolean; myPlugins: PublisherPlugin[]; onDisablePlugin: (pluginKey: string) => Promise<void> | void; onOpenPlugin: (pluginKey: string) => void; onRefresh: () => Promise<void> | void; onRefreshReleases: (pluginKey: string) => Promise<void> | void; onRetireRelease: (releaseId: string) => Promise<void> | void; releases: PublisherRelease[]; selectedMyPlugin: PublisherPlugin | null; }) {
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
                <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => onOpenPlugin(plugin.plugin_key)}>Release history</button>
                  <button className="btn btn-danger btn-sm" onClick={() => onDisablePlugin(plugin.plugin_key)} disabled={isBusy(`disable-plugin-${plugin.plugin_key}`)}>
                    {isBusy(`disable-plugin-${plugin.plugin_key}`) ? <Spinner /> : 'Disable'}
                  </button>
                </div>
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
                </div>
                <div className="drow"><span className="dkey">Display name</span><span className="dval">{selectedMyPlugin.display_name}</span></div>
                <div className="drow"><span className="dkey">Plugin key</span><span className="dval-mono">{selectedMyPlugin.plugin_key}</span></div>
                <div className="drow"><span className="dkey">Publisher</span><span className="dval">{selectedMyPlugin.publisher || selectedMyPlugin.publisher_slug}</span></div>
                <div className="drow"><span className="dkey">Latest release</span><span className="dval">{selectedMyPlugin.latest_release ? `v${selectedMyPlugin.latest_release.version}` : '—'}</span></div>
                <div className="drow"><span className="dkey">Updated</span><span className="dval">{fmtDT(selectedMyPlugin.updated_at)}</span></div>
                {selectedMyPlugin.description && <div className="helper-note">{selectedMyPlugin.description}</div>}
                <div className="publish-file-list">
                  {selectedMyPlugin.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
                  {selectedMyPlugin.categories.map((tag) => <span key={tag} className="tag tag-soft">{tag}</span>)}
                  {selectedMyPlugin.capabilities.map((tag) => <span key={tag} className="tag">{tag}</span>)}
                  {(selectedMyPlugin.install_policy_badges || []).map((tag) => <span key={tag} className="tag tag-soft">{tag}</span>)}
                  {(selectedMyPlugin.release_channel_badges || []).map((tag) => <span key={tag} className="tag tag-soft">{tag}</span>)}
                </div>
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
