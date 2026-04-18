import { Badge } from '../components/common/Badge';
import { Spinner } from '../components/common/Spinner';
import type { AdminUser } from '../lib/types';
import { fmtDate, initials, pluginColor } from '../lib/utils';

export function UsersPage({ isBusy, onExportCsv, onSetUserStatus, users, usersTotal }: { isBusy: (key: string) => boolean; onExportCsv: () => void; onSetUserStatus: (userId: string, status: 'active' | 'suspended') => Promise<void> | void; users: AdminUser[]; usersTotal: number; }) {
  return (
    <div className="vstack">
      <div className="ph">
        <div>
          <div className="ph-title">Users</div>
          <div className="ph-sub">Admin account view with developer posture and user lifecycle actions.</div>
        </div>
        <div className="row wrap">
          <span className="tag tag-soft">total · {usersTotal}</span>
          <button className="btn btn-secondary btn-sm" onClick={onExportCsv}>Export CSV</button>
        </div>
      </div>
      <div className="card">
        {users.length === 0 ? (
          <div className="empty"><div className="empty-icon">👥</div><div className="empty-title">No users found</div><div className="empty-sub">Try adjusting filters or verify admin endpoints are available.</div></div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Developer</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        <div className="profile-av" style={{ width: 36, height: 36, fontSize: 13, background: `linear-gradient(135deg, ${pluginColor(item.username)}cc, ${pluginColor(item.username)}66)` }}>{initials(item.username)}</div>
                        <div>
                          <div style={{ fontWeight: 700 }}>{item.username}</div>
                          <div className="tbl-mono">{item.id}</div>
                        </div>
                      </div>
                    </td>
                    <td>{item.email}</td>
                    <td><Badge value={(item.trust_flags?.is_admin ? 'admin' : 'member') as string} /></td>
                    <td><Badge value={item.status} /></td>
                    <td>
                      <div className="row wrap" style={{ gap: 4 }}>
                        <Badge value={item.developer_status || 'unknown'} />
                        {(item.capabilities || []).slice(0, 2).map((cap) => <span key={cap} className="tag tag-soft">{cap}</span>)}
                      </div>
                    </td>
                    <td>{fmtDate(item.created_at)}</td>
                    <td>
                      <div className="tbl-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => onSetUserStatus(item.id, 'active')} disabled={isBusy(`user-status-${item.id}`)}>{isBusy(`user-status-${item.id}`) ? <Spinner /> : 'Activate'}</button>
                        <button className="btn btn-danger btn-sm" onClick={() => onSetUserStatus(item.id, 'suspended')} disabled={isBusy(`user-status-${item.id}`)}>{isBusy(`user-status-${item.id}`) ? <Spinner /> : 'Suspend'}</button>
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
