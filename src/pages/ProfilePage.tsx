import type { FormEvent } from 'react';
import { Badge } from '../components/common/Badge';
import { Spinner } from '../components/common/Spinner';
import type { SessionUser } from '../lib/types';

export function ProfilePage({ isBusy, onSubmit, pwForm, setPwForm, user }: { isBusy: (key: string) => boolean; onSubmit: (event: FormEvent) => Promise<void> | void; pwForm: { current: string; next: string; confirm: string }; setPwForm: React.Dispatch<React.SetStateAction<{ current: string; next: string; confirm: string }>>; user: SessionUser | null; }) {
  return (
    <div className="vstack">
      <div className="profile-hero">
        <div className="profile-av">{(user?.username || '?').slice(0, 2).toUpperCase()}</div>
        <div>
          <div className="profile-name">{user?.username}</div>
          <div className="profile-email">{user?.email}</div>
          <div className="row wrap" style={{ gap: 6 }}>
            <Badge value={user?.status} />
            <Badge value={user?.is_admin ? 'admin' : 'member'} />
            {(user?.capabilities || []).slice(0, 3).map((cap) => <span key={cap} className="tag tag-soft">{cap}</span>)}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Change password</div>
            <div className="card-sub">Changing the password now invalidates active sessions. After submit, the portal will ask the user to sign in again.</div>
          </div>
        </div>
        <div className="card-body">
          <form onSubmit={onSubmit} className="vstack">
            <div className="field" style={{ margin: 0 }}>
              <label className="field-label">Current password</label>
              <input className="input" type="password" value={pwForm.current} onChange={(event) => setPwForm((current) => ({ ...current, current: event.target.value }))} />
            </div>
            <div className="grid2-form">
              <div className="field" style={{ margin: 0 }}>
                <label className="field-label">New password</label>
                <input className="input" type="password" value={pwForm.next} onChange={(event) => setPwForm((current) => ({ ...current, next: event.target.value }))} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="field-label">Confirm password</label>
                <input className="input" type="password" value={pwForm.confirm} onChange={(event) => setPwForm((current) => ({ ...current, confirm: event.target.value }))} />
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={isBusy('change-password')}>{isBusy('change-password') ? <><Spinner /> Updating…</> : 'Update password'}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
