import './styles.css';
import { AppShell } from './components/layout/AppShell';
import { AuthScreen } from './components/layout/AuthScreen';
import { Toasts } from './components/common/Toasts';
import { Spinner } from './components/common/Spinner';
import { DashboardPage } from './pages/DashboardPage';
import { DeveloperPage } from './pages/DeveloperPage';
import { PublishPage } from './pages/PublishPage';
import { MyPluginsPage } from './pages/MyPluginsPage';
import { AllPluginsPage } from './pages/AllPluginsPage';
import { UsersPage } from './pages/UsersPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { ProfilePage } from './pages/ProfilePage';
import { usePortalController } from './hooks/usePortalController';

export default function App() {
  const c = usePortalController();

  if (!c.isLoggedIn) {
    return (
      <>
        <AuthScreen
          authTab={c.authTab}
          isBusy={c.isBusy}
          loginForm={c.loginForm}
          onAuthTabChange={c.setAuthTab}
          onLogin={c.handleLogin}
          onLoginFormChange={c.setLoginForm}
          onRegister={c.handleRegister}
          onRegisterFormChange={c.setRegForm}
          regForm={c.regForm}
        />
        <Toasts toasts={c.toasts} />
      </>
    );
  }

  const selectedPage = c.isAdmin ? c.aPage : c.uPage;
  const navItems = c.isAdmin ? c.adminNavItems : c.userNavItems;

  const pageActions = (() => {
    switch (selectedPage) {
      case 'dash':
        return <button className="btn btn-secondary btn-sm" onClick={c.loadDashboard} disabled={c.isBusy('dashboard')}>{c.isBusy('dashboard') ? <Spinner /> : 'Refresh'}</button>;
      case 'developer':
        return <button className="btn btn-secondary btn-sm" onClick={c.loadDeveloperHub} disabled={c.isBusy('developer-status') || c.isBusy('developer-keys')}>{(c.isBusy('developer-status') || c.isBusy('developer-keys')) ? <Spinner /> : 'Refresh'}</button>;
      case 'plugins-admin':
        return <button className="btn btn-secondary btn-sm" onClick={c.loadAllPlugins} disabled={c.isBusy('all-plugins')}>{c.isBusy('all-plugins') ? <Spinner /> : 'Refresh'}</button>;
      case 'my-plugins':
        return <button className="btn btn-secondary btn-sm" onClick={c.loadMyPlugins} disabled={c.isBusy('my-plugins')}>{c.isBusy('my-plugins') ? <Spinner /> : 'Refresh'}</button>;
      case 'users':
        return <button className="btn btn-secondary btn-sm" onClick={c.exportUsersCsv}>Export CSV</button>;
      case 'reviews':
        return <button className="btn btn-secondary btn-sm" onClick={c.loadReviews} disabled={c.isBusy('reviews')}>{c.isBusy('reviews') ? <Spinner /> : 'Refresh'}</button>;
      default:
        return null;
    }
  })();

  return (
    <>
      <AppShell
        apiBase={c.API_BASE}
        currentPageTitle={c.currentPageTitle}
        currentUser={c.user ? { username: c.user.username, email: c.user.email } : null}
        isAdmin={c.isAdmin}
        isBusy={c.isBusy}
        navItems={navItems}
        onLogout={c.handleLogout}
        onNav={(key) => c.isAdmin ? c.setAPage(key as typeof c.aPage) : c.setUPage(key as typeof c.uPage)}
        pageActions={pageActions}
        selectedPage={selectedPage}
        theme={c.theme}
        onToggleTheme={() => c.setTheme((current) => current === 'dark' ? 'light' : 'dark')}
      >
        {selectedPage === 'dash' && c.isAdmin && (
          <DashboardPage
            runtime={c.runtime}
            summary={c.summary}
            onOpenPlugins={() => c.setAPage('plugins-admin')}
            onOpenReviews={() => c.setAPage('reviews')}
            onOpenUsers={() => c.setAPage('users')}
          />
        )}

        {selectedPage === 'developer' && (
          <DeveloperPage
            developerKeyForm={c.developerKeyForm}
            developerKeys={c.developerKeys}
            developerStatus={c.developerStatus}
            isBusy={c.isBusy}
            onDeveloperKeyFormChange={c.setDeveloperKeyForm}
            onRegisterKey={c.handleRegisterDeveloperKey}
            onRevokeKey={c.revokeDeveloperKey}
          />
        )}

        {selectedPage === 'publish' && (
          <PublishPage
            capabilityOptions={c.capabilityOptions}
            isBusy={c.isBusy}
            onCapabilityRefresh={c.refreshCapabilities}
            onIconSelected={c.onIconSelected}
            onImagesSelected={c.onImagesSelected}
            onPackageSelected={c.onPackageSelected}
            options={c.releaseChannelOptions}
            packageValidation={c.packageValidation}
            publishDrag={c.publishDrag}
            publishForm={c.publishForm}
            setPublishDrag={c.setPublishDrag}
            setPublishForm={c.setPublishForm}
            onSubmit={c.publishPlugin}
          />
        )}

        {selectedPage === 'my-plugins' && (
          <MyPluginsPage
            isBusy={c.isBusy}
            myPlugins={c.myPlugins}
            onDeletePlugin={c.deletePlugin}
            onTogglePlugin={c.togglePluginEnabled}
            onOpenPlugin={c.loadPluginReleases}
            onRefresh={c.loadMyPlugins}
            onRefreshReleases={c.loadPluginReleases}
            onRetireRelease={c.retireRelease}
            releases={c.releases}
            selectedMyPlugin={c.selectedMyPlugin}
          />
        )}

        {selectedPage === 'plugins-admin' && c.isAdmin && (
          <AllPluginsPage
            isBusy={c.isBusy}
            onExportCsv={c.exportPluginsCsv}
            onRefresh={c.loadAllPlugins}
            onSetPublisherOfficial={c.setPublisherOfficial}
            plugins={c.allPlugins}
          />
        )}

        {selectedPage === 'users' && c.isAdmin && (
          <UsersPage
            isBusy={c.isBusy}
            onExportCsv={c.exportUsersCsv}
            onSetUserStatus={c.setUserStatus}
            users={c.adminUsers}
            usersTotal={c.usersTotal}
          />
        )}

        {selectedPage === 'reviews' && c.isAdmin && (
          <ReviewsPage
            isBusy={c.isBusy}
            onAction={c.reviewAction}
            onRefresh={c.loadReviews}
            reviewQueue={c.reviewQueue}
            reviewSummary={c.reviewSummary}
          />
        )}

        {selectedPage === 'profile' && !c.isAdmin && (
          <ProfilePage
            isBusy={c.isBusy}
            onSubmit={c.handleChangePassword}
            pwForm={c.pwForm}
            setPwForm={c.setPwForm}
            user={c.user}
          />
        )}
      </AppShell>

      {c.confirmCtx && (
        <div className="overlay" onClick={() => c.setConfirmCtx(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">{c.confirmCtx.title}</div>
            </div>
            <div className="modal-body">{c.confirmCtx.body}</div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => c.setConfirmCtx(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => { c.confirmCtx?.onOk(); c.setConfirmCtx(null); }}>Continue</button>
            </div>
          </div>
        </div>
      )}

      <Toasts toasts={c.toasts} />
    </>
  );
}
