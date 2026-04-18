import { Badge } from '../components/common/Badge';
import { Spinner } from '../components/common/Spinner';
import type { ReviewQueueItem, ReviewQueueSummary } from '../lib/types';
import { fmtDT } from '../lib/utils';

export function ReviewsPage({ isBusy, onAction, onRefresh, reviewQueue, reviewSummary }: { isBusy: (key: string) => boolean; onAction: (releaseId: string, action: 'approve' | 'reject' | 'request-changes') => Promise<void> | void; onRefresh: () => Promise<void> | void; reviewQueue: ReviewQueueItem[]; reviewSummary: ReviewQueueSummary | null; }) {
  const stat = (label: string, value: number | undefined) => <div className="kpi-card"><div className="kpi-label">{label}</div><div className="kpi-value">{value ?? 0}</div></div>;
  return (
    <div className="vstack">
      <div className="ph">
        <div>
          <div className="ph-title">Review queue</div>
          <div className="ph-sub">Admin moderation surface with release channel, signature status and policy/commercial warnings.</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onRefresh} disabled={isBusy('reviews')}>{isBusy('reviews') ? <Spinner /> : '⟳ Refresh'}</button>
      </div>
      <div className="g4">
        {stat('Total', reviewSummary?.total)}
        {stat('Pending', reviewSummary?.by_review_state?.pending)}
        {stat('Approved', reviewSummary?.by_review_state?.approved)}
        {stat('Rejected', reviewSummary?.by_review_state?.rejected)}
      </div>
      <div className="card">
        {reviewQueue.length === 0 ? (
          <div className="empty"><div className="empty-icon">✓</div><div className="empty-title">No items in review</div><div className="empty-sub">The queue is empty or the backend has not exposed review endpoints yet.</div></div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Plugin</th>
                  <th>Publisher</th>
                  <th>Version</th>
                  <th>Channel</th>
                  <th>Signature</th>
                  <th>Risk</th>
                  <th>State</th>
                  <th>Warnings</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reviewQueue.map((item: ReviewQueueItem) => (
                  <tr key={item.release_id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{item.plugin_display_name}</div>
                      <div className="tbl-mono">{item.plugin_key}</div>
                      <div className="plugin-detail-meta">Created {fmtDT(item.created_at)} · queue age {item.queue_age_hours}h</div>
                    </td>
                    <td>
                      <div>{item.publisher || '—'}</div>
                      {item.publisher_trust_tier && <Badge value={item.publisher_trust_tier} />}
                    </td>
                    <td>v{item.version}</td>
                    <td><Badge value={item.release_channel} /></td>
                    <td>
                      <div className="row wrap" style={{ gap: 4 }}>
                        <Badge value={item.signature_status} />
                        {item.developer_key_status && <Badge value={item.developer_key_status} />}
                      </div>
                    </td>
                    <td><Badge value={item.risk_level || 'unknown'} /></td>
                    <td>
                      <div className="row wrap" style={{ gap: 4 }}>
                        <Badge value={item.status} />
                        <Badge value={item.review_state} />
                        {item.recommended_decision && <span className="tag tag-soft">{item.recommended_decision}</span>}
                      </div>
                    </td>
                    <td>
                      <div className="stack-list compact warn small">
                        {[...(item.reasons || []), ...(item.policy_warnings || []), ...(item.commercial_warnings || [])].slice(0, 4).map((reason) => <div key={reason} className="stack-item">{reason}</div>)}
                        {(!item.reasons.length && !item.policy_warnings?.length && !item.commercial_warnings?.length) && <div className="stack-empty">No warnings</div>}
                      </div>
                    </td>
                    <td>
                      <div className="tbl-actions">
                        <button className="btn btn-primary btn-sm" onClick={() => onAction(item.release_id, 'approve')} disabled={isBusy(`review-${item.release_id}-approve`)}>{isBusy(`review-${item.release_id}-approve`) ? <Spinner /> : 'Approve'}</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => onAction(item.release_id, 'request-changes')} disabled={isBusy(`review-${item.release_id}-request-changes`)}>{isBusy(`review-${item.release_id}-request-changes`) ? <Spinner /> : 'Request changes'}</button>
                        <button className="btn btn-danger btn-sm" onClick={() => onAction(item.release_id, 'reject')} disabled={isBusy(`review-${item.release_id}-reject`)}>{isBusy(`review-${item.release_id}-reject`) ? <Spinner /> : 'Reject'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
