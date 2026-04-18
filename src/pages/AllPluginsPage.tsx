import { PluginCardGrid } from '../components/plugins/PluginCardGrid';
import type { PublisherPlugin } from '../lib/types';
import { Spinner } from '../components/common/Spinner';

export function AllPluginsPage({ isBusy, onExportCsv, onRefresh, onSetPublisherOfficial, plugins }: { isBusy: (key: string) => boolean; onExportCsv: () => void; onRefresh: () => Promise<void> | void; onSetPublisherOfficial: (publisherSlug: string, official: boolean) => Promise<void> | void; plugins: PublisherPlugin[]; }) {
  return (
    <div className="vstack">
      <div className="ph">
        <div>
          <div className="ph-title">All plugins</div>
          <div className="ph-sub">Admin view with channel, signature and publisher trust signals across the full catalog.</div>
        </div>
        <div className="row wrap">
          <button className="btn btn-secondary btn-sm" onClick={onRefresh} disabled={isBusy('all-plugins')}>{isBusy('all-plugins') ? <Spinner /> : '⟳ Refresh'}</button>
          <button className="btn btn-secondary btn-sm" onClick={onExportCsv}>Export CSV</button>
        </div>
      </div>
      <div className="card">
        <div className="card-body">
          <PluginCardGrid
            plugins={plugins}
            onOpen={() => undefined}
            emptyState={<div className="empty"><div className="empty-icon">⬡</div><div className="empty-title">No plugins found</div><div className="empty-sub">The catalog is empty or the backend did not return plugin data.</div></div>}
            renderActions={(plugin) => (
              <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => onSetPublisherOfficial(plugin.publisher_slug, true)} disabled={isBusy(`publisher-official-${plugin.publisher_slug}`)}>Mark official</button>
                <button className="btn btn-ghost btn-sm" onClick={() => onSetPublisherOfficial(plugin.publisher_slug, false)} disabled={isBusy(`publisher-official-${plugin.publisher_slug}`)}>Mark community</button>
              </div>
            )}
          />
        </div>
      </div>
    </div>
  );
}
