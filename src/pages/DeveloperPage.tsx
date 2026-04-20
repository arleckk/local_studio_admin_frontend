import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Badge } from '../components/common/Badge';
import { Spinner } from '../components/common/Spinner';
import { fmtDT } from '../lib/utils';
import type { DeveloperKey, DeveloperStatus } from '../lib/types';

type PlatformKey = 'windows' | 'linux' | 'mac';

type CommandStep = {
  title: string;
  body: string;
  command: string;
};

const platformInstructions: Record<PlatformKey, { label: string; intro: string; steps: CommandStep[] }> = {
  windows: {
    label: 'Windows',
    intro: 'Use PowerShell-ready commands so the developer can install the CLI, generate the keypair and print the public key to paste here.',
    steps: [
      {
        title: 'Install or update the Local Studio plugin CLI',
        body: 'This installs the official developer CLI without storing any private key in the portal.',
        command: 'powershell -NoProfile -Command "py -m pip install --upgrade local-studio-plugin-sdk"',
      },
      {
        title: 'Generate the signing keypair locally',
        body: 'The private key stays on the workstation. Only the public key should be copied into this portal.',
        command:
          'powershell -NoProfile -Command "lsplugin keys generate --algorithm ed25519 --output \"$env:USERPROFILE\\.localstudio\\keys\\main-workstation\""',
      },
      {
        title: 'Print the public key for registration',
        body: 'Copy the printed public key and paste it into the form below.',
        command:
          'powershell -NoProfile -Command "Get-Content \"$env:USERPROFILE\\.localstudio\\keys\\main-workstation.pub\""',
      },
    ],
  },
  linux: {
    label: 'Linux',
    intro: 'Use shell commands to install the CLI, generate the keypair and print the public key for backend registration.',
    steps: [
      {
        title: 'Install or update the Local Studio plugin CLI',
        body: 'Keep the CLI local to the developer machine or CI environment.',
        command: 'python3 -m pip install --upgrade local-studio-plugin-sdk',
      },
      {
        title: 'Generate the signing keypair locally',
        body: 'Store the private key in your local developer path. Do not upload it here.',
        command: 'lsplugin keys generate --algorithm ed25519 --output ~/.local/share/localstudio/keys/main-workstation',
      },
      {
        title: 'Print the public key for registration',
        body: 'Copy the public key output and paste it into the register public key form.',
        command: 'cat ~/.local/share/localstudio/keys/main-workstation.pub',
      },
    ],
  },
  mac: {
    label: 'Mac',
    intro: 'Use terminal commands to install the CLI, generate the keypair and copy the public key into this portal.',
    steps: [
      {
        title: 'Install or update the Local Studio plugin CLI',
        body: 'This keeps the signing workflow on the local Mac, not in the portal.',
        command: 'python3 -m pip install --upgrade local-studio-plugin-sdk',
      },
      {
        title: 'Generate the signing keypair locally',
        body: 'Generate the keypair in your local Application Support path or another secure local folder.',
        command:
          'lsplugin keys generate --algorithm ed25519 --output ~/Library/Application\\ Support/LocalStudio/keys/main-workstation',
      },
      {
        title: 'Print the public key for registration',
        body: 'Copy the public key text and paste it into the form below.',
        command: 'cat ~/Library/Application\\ Support/LocalStudio/keys/main-workstation.pub',
      },
    ],
  },
};

function permissionState(value: boolean | null | undefined) {
  if (value === true) return 'active';
  if (value === false) return 'pending';
  return 'unknown';
}

function StatusTile({
  label,
  value,
  badge,
  helper,
}: {
  label: string;
  value: string;
  badge?: string | null;
  helper?: string;
}) {
  return (
    <div className="developer-tile">
      <div className="developer-tile-head">
        <div className="developer-tile-label">{label}</div>
        {badge ? <Badge value={badge} /> : null}
      </div>
      <div className="developer-tile-value">{value}</div>
      {helper ? <div className="developer-tile-helper">{helper}</div> : null}
    </div>
  );
}

function CopyCommandButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button className={`btn btn-secondary btn-sm developer-copy-btn${copied ? ' copied' : ''}`} type="button" onClick={onCopy}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function CommandStepCard({ step }: { step: CommandStep }) {
  return (
    <div className="developer-command-card">
      <div className="developer-command-head">
        <div>
          <div className="developer-step-title">{step.title}</div>
          <div className="developer-step-body">{step.body}</div>
        </div>
        <CopyCommandButton value={step.command} />
      </div>
      <div className="developer-command-block">
        <code>{step.command}</code>
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="card collapsible-card">
      <button type="button" className="card-head collapsible-trigger" onClick={onToggle} aria-expanded={open}>
        <div>
          <div className="card-title">{title}</div>
          <div className="card-sub">{subtitle}</div>
        </div>
        <div className={`collapse-chevron${open ? ' open' : ''}`}>⌄</div>
      </button>
      {open ? <div className="card-body vstack">{children}</div> : null}
    </div>
  );
}

function KeyCard({
  item,
  isBusy,
  isActive,
  onRevoke,
}: {
  item: DeveloperKey;
  isBusy: (key: string) => boolean;
  isActive: boolean;
  onRevoke: (keyId: string) => Promise<void> | void;
}) {
  return (
    <div className={`key-card${isActive ? ' active' : ''}`}>
      <div className="key-card-top">
        <div>
          <div className="key-card-title-row">
            <div className="key-card-title">{item.label || 'Unnamed key'}</div>
            {isActive ? <span className="tag">active</span> : null}
          </div>
          <div className="key-card-id">{item.key_id}</div>
        </div>
        <Badge value={item.status} />
      </div>

      <div className="key-card-meta">
        <div className="key-card-meta-item">
          <span>Algorithm</span>
          <strong>{item.algorithm || '—'}</strong>
        </div>
        <div className="key-card-meta-item">
          <span>Created</span>
          <strong>{fmtDT(item.created_at)}</strong>
        </div>
        <div className="key-card-meta-item">
          <span>Last used</span>
          <strong>{fmtDT(item.last_used_at)}</strong>
        </div>
      </div>

      {item.fingerprint ? (
        <div className="key-card-fingerprint">
          <span>Fingerprint</span>
          <code>{item.fingerprint}</code>
        </div>
      ) : null}

      <div className="key-card-foot">
        <div className="helper-note">Revoke a key when the device is retired or should stop signing packages.</div>
        <button
          className="btn btn-danger btn-sm"
          type="button"
          disabled={isBusy(`developer-revoke-${item.key_id}`) || item.can_revoke === false}
          onClick={() => onRevoke(item.key_id)}
        >
          {isBusy(`developer-revoke-${item.key_id}`) ? <Spinner /> : 'Revoke'}
        </button>
      </div>
    </div>
  );
}

export function DeveloperPage({
  developerKeyForm,
  developerKeys,
  developerStatus,
  isBusy,
  onDeveloperKeyFormChange,
  onRegisterKey,
  onRevokeKey,
}: {
  developerKeyForm: { label: string; algorithm: string; publicKey: string };
  developerKeys: DeveloperKey[];
  developerStatus: DeveloperStatus;
  isBusy: (key: string) => boolean;
  onDeveloperKeyFormChange: (next: { label: string; algorithm: string; publicKey: string }) => void;
  onRegisterKey: (event: FormEvent) => Promise<void> | void;
  onRevokeKey: (keyId: string) => Promise<void> | void;
}) {
  const [statusOpen, setStatusOpen] = useState(true);
  const [signingOpen, setSigningOpen] = useState(true);
  const [platform, setPlatform] = useState<PlatformKey>('windows');

  const revokedKeys = developerKeys.filter((item) => (item.status || '').toLowerCase() === 'revoked').length;
  const visibleDeveloperKeys = useMemo(
    () => developerKeys.filter((item) => (item.status || '').toLowerCase() !== 'revoked'),
    [developerKeys],
  );
  const registeredKeys = visibleDeveloperKeys.length;
  const rawActiveKeyId = developerStatus.active_key_id || null;
  const activeKeyId = visibleDeveloperKeys.some((item) => item.key_id === rawActiveKeyId) ? rawActiveKeyId : null;
  const activeKeys = visibleDeveloperKeys.filter((item) => (item.status || '').toLowerCase() === 'active').length;

  const selectedInstructions = useMemo(() => platformInstructions[platform], [platform]);

  return (
    <div className="vstack">
      <div className="developer-hero">
        <div>
          <div className="ph-title">Developer identity & signing keys</div>
          <div className="ph-sub">
            This portal only stores public keys and backend state. Private keys stay on the developer device and local installs happen in Desktop.
          </div>
          <div className="developer-hero-badges">
            <Badge value={developerStatus.status} />
            <Badge value={developerStatus.developer_status} />
            <span className="tag tag-soft">{developerStatus.source === 'backend' ? 'backend contract' : 'fallback contract'}</span>
          </div>
        </div>

        <div className="developer-hero-summary">
          <div className="developer-mini-stat">
            <span>Registered keys</span>
            <strong>{registeredKeys}</strong>
          </div>
          <div className="developer-mini-stat">
            <span>Active key</span>
            <strong>{activeKeyId ? 'Yes' : 'No'}</strong>
          </div>
          <div className="developer-mini-stat">
            <span>Publisher</span>
            <strong>{developerStatus.publisher?.display_name || developerStatus.publisher?.slug || '—'}</strong>
          </div>
          <div className="developer-mini-stat">
            <span>Namespaces</span>
            <strong>{developerStatus.authorized_namespaces?.length || 0}</strong>
          </div>
        </div>
      </div>

      {developerStatus.source === 'fallback' ? (
        <div className="alert alert-warn">
          The backend developer contract is still falling back to a compatibility view. This page is ready, but some backend fields are not exposed yet.
        </div>
      ) : null}

      <div className="developer-status-grid">
        <StatusTile
          label="Publish via portal"
          value={developerStatus.publish_allowed ? 'Allowed' : developerStatus.publish_allowed === false ? 'Blocked' : 'Unknown'}
          badge={permissionState(developerStatus.publish_allowed)}
          helper="Backend policy decides whether this account can submit releases."
        />
        <StatusTile
          label="Developer Mode in Desktop"
          value={developerStatus.developer_mode_allowed ? 'Enabled' : developerStatus.developer_mode_allowed === false ? 'Blocked' : 'Unknown'}
          badge={permissionState(developerStatus.developer_mode_allowed)}
          helper="Desktop owns local Developer Mode. This portal only reflects backend posture."
        />
        <StatusTile
          label="Local dev installs"
          value={developerStatus.local_install_allowed ? 'Allowed' : developerStatus.local_install_allowed === false ? 'Blocked' : 'Unknown'}
          badge={permissionState(developerStatus.local_install_allowed)}
          helper="Local installs happen in Desktop, never from this portal."
        />
        <StatusTile
          label="Active key id"
          value={activeKeyId || 'No active key'}
          badge={activeKeyId ? 'active' : 'pending'}
          helper="Your package signatures should resolve to a registered, non-revoked public key."
        />
      </div>

      <div className="g2 developer-grid">
        <CollapsibleSection
          title="Developer status"
          subtitle="Capabilities and publisher posture resolved by backend contracts."
          open={statusOpen}
          onToggle={() => setStatusOpen((current) => !current)}
        >
          <div className="drow">
            <span className="dkey">Account status</span>
            <Badge value={developerStatus.status} />
          </div>
          <div className="drow">
            <span className="dkey">Developer status</span>
            <Badge value={developerStatus.developer_status} />
          </div>
          <div className="drow">
            <span className="dkey">Registered public keys</span>
            <span className="dval">{registeredKeys}</span>
          </div>
          <div className="drow">
            <span className="dkey">Active keys</span>
            <span className="dval">{activeKeys}</span>
          </div>
          <div className="drow">
            <span className="dkey">Revoked keys</span>
            <span className="dval">{revokedKeys}</span>
          </div>
          {developerStatus.publisher ? (
            <>
              <div className="drow">
                <span className="dkey">Publisher</span>
                <span className="dval">{developerStatus.publisher.display_name || developerStatus.publisher.slug || '—'}</span>
              </div>
              <div className="drow">
                <span className="dkey">Publisher role</span>
                <Badge value={developerStatus.publisher.role} />
              </div>
              <div className="drow">
                <span className="dkey">Publisher status</span>
                <Badge value={developerStatus.publisher.status} />
              </div>
            </>
          ) : null}

          <div className="field" style={{ margin: 0 }}>
            <label className="field-label">Authorized namespaces</label>
            <div className="publish-file-list">
              {(developerStatus.authorized_namespaces || []).length > 0 ? (
                (developerStatus.authorized_namespaces || []).map((namespace) => <span key={namespace} className="tag">{namespace}</span>)
              ) : (
                <span className="tag tag-soft">No namespaces registered</span>
              )}
            </div>
            <span className="field-hint">Desktop Developer Mode should only allow locally signed packages whose plugin key namespace matches one of these entries.</span>
          </div>

          <div className="field" style={{ margin: 0 }}>
            <label className="field-label">Relevant capabilities</label>
            <div className="publish-file-list">
              {developerStatus.capabilities.length > 0 ? (
                developerStatus.capabilities.map((capability) => <span key={capability} className="tag">{capability}</span>)
              ) : (
                <span className="tag tag-soft">No capability list exposed yet</span>
              )}
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="How signing works"
          subtitle="Keep local development, key custody and marketplace publishing clearly separated."
          open={signingOpen}
          onToggle={() => setSigningOpen((current) => !current)}
        >
          <div className="developer-tabs">
            {(['windows', 'linux', 'mac'] as PlatformKey[]).map((item) => (
              <button
                key={item}
                type="button"
                className={`developer-tab${platform === item ? ' active' : ''}`}
                onClick={() => setPlatform(item)}
              >
                {platformInstructions[item].label}
              </button>
            ))}
          </div>

          <div className="developer-platform-intro">{selectedInstructions.intro}</div>

          <div className="developer-steps">
            {selectedInstructions.steps.map((step, index) => (
              <div key={`${platform}-${step.title}`} className="developer-step-shell">
                <div className="developer-step-shell-top">
                  <div className="developer-step-num">{index + 1}</div>
                  <CommandStepCard step={step} />
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      </div>

      {(developerStatus.notes.length > 0 || developerStatus.warnings.length > 0) ? (
        <div className="developer-notes-grid">
          {developerStatus.notes.length > 0 ? (
            <div className="stack-list compact">
              <div className="stack-head">Notes</div>
              {developerStatus.notes.map((note) => <div key={note} className="stack-item">{note}</div>)}
            </div>
          ) : null}
          {developerStatus.warnings.length > 0 ? (
            <div className="stack-list compact warn">
              <div className="stack-head">Warnings</div>
              {developerStatus.warnings.map((warning) => <div key={warning} className="stack-item">{warning}</div>)}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="g2 developer-grid">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Register public key</div>
              <div className="card-sub">Register a new signing identity without uploading any private material.</div>
            </div>
          </div>
          <div className="card-body vstack">
            <div className="alert alert-info">
              Private keys stay on your device. This form only sends the public portion and descriptive metadata to the backend.
            </div>

            <form onSubmit={onRegisterKey} className="vstack">
              <div className="grid2-form">
                <div className="field" style={{ margin: 0 }}>
                  <label className="field-label">Label</label>
                  <input
                    className="input"
                    required
                    value={developerKeyForm.label}
                    onChange={(event) => onDeveloperKeyFormChange({ ...developerKeyForm, label: event.target.value })}
                    placeholder="Main workstation"
                  />
                  <span className="field-hint">Use a human label like “Main workstation” or “CI signer”.</span>
                </div>

                <div className="field" style={{ margin: 0 }}>
                  <label className="field-label">Algorithm</label>
                  <select
                    className="select"
                    value={developerKeyForm.algorithm}
                    onChange={(event) => onDeveloperKeyFormChange({ ...developerKeyForm, algorithm: event.target.value })}
                  >
                    <option value="ed25519">ed25519</option>
                    <option value="ecdsa-p256">ecdsa-p256</option>
                    <option value="rsa-4096">rsa-4096</option>
                  </select>
                  <span className="field-hint">Match the algorithm used by your local signing tooling.</span>
                </div>
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label className="field-label">Public key</label>
                <textarea
                  className="textarea mono-text"
                  rows={8}
                  required
                  value={developerKeyForm.publicKey}
                  onChange={(event) => onDeveloperKeyFormChange({ ...developerKeyForm, publicKey: event.target.value })}
                  placeholder="Paste the public key generated on your device"
                />
                <span className="field-hint">Accepted format is defined by backend validation. This portal does not generate or store private material.</span>
              </div>

              <div className="developer-inline-list">
                <span className="tag">Desktop-only local installs</span>
                <span className="tag">Public keys only</span>
                <span className="tag">No private key upload</span>
              </div>

              <button className="btn btn-primary" type="submit" disabled={isBusy('developer-create-key')}>
                {isBusy('developer-create-key') ? <><Spinner /> Registering…</> : 'Register public key'}
              </button>
            </form>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Registered keys</div>
              <div className="card-sub">Review active/revoked state and revoke keys that should stop signing packages.</div>
            </div>
          </div>

          {visibleDeveloperKeys.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">⌘</div>
              <div className="empty-title">No active public keys registered</div>
              <div className="empty-sub">
                {revokedKeys > 0
                  ? 'Revoked keys are hidden from this list after a successful revoke. Register a new key to keep signing packages.'
                  : 'Register your first public key here, then sign packages on your developer machine or CI.'}
              </div>
            </div>
          ) : (
            <div className="card-body vstack">
              <div className="developer-inline-list">
                <span className="tag">{registeredKeys} registered</span>
                <span className="tag">{activeKeys} active</span>
                <span className="tag">{revokedKeys} revoked</span>
              </div>
              {revokedKeys > 0 ? (
                <div className="alert alert-info" style={{ marginBottom: 0 }}>
                  Revoked keys are hidden from this list after a successful revoke.
                </div>
              ) : null}
              <div className="key-card-grid">
                {visibleDeveloperKeys.map((item) => (
                  <KeyCard
                    key={item.key_id}
                    item={item}
                    isActive={activeKeyId === item.key_id}
                    isBusy={isBusy}
                    onRevoke={onRevokeKey}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
