import React from 'react';

function normalizeLauncherTabId(raw) {
  const normalized = String(raw || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'gog.com') return 'gog';
  if (normalized === 'itchio' || normalized === 'itch.io') return 'itch';
  if (normalized === 'local') return 'local';
  return normalized;
}

const LauncherTabs = ({
  launchers,
  activeLauncherId,
  onChange,
  showAllOption = false,
  isAllActive = false,
}) => {
  const tabItems = showAllOption
    ? [{ id: 'all', shortName: 'ALL', name: 'All Platforms' }, ...(Array.isArray(launchers) ? launchers : [])]
    : (Array.isArray(launchers) ? launchers : []);

  return (
    <div className="lib-launcher-tabs">
      {tabItems.map((launcher) => {
        const launcherId = normalizeLauncherTabId(launcher.id);
        const activeId = normalizeLauncherTabId(activeLauncherId);
        const isActive = launcherId === 'all' ? !!isAllActive : launcherId === activeId;
        return (
          <button
            key={launcher.id}
            type="button"
            onClick={() => onChange(launcher.id)}
            className={`lib-launcher-tab ${isActive ? 'lib-launcher-tab-active' : ''}`}
          >
            {launcher.shortName}
          </button>
        );
      })}
    </div>
  );
};

export default LauncherTabs;
