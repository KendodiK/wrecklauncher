import React from 'react';

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
        const isActive = launcher.id === 'all' ? !!isAllActive : launcher.id === activeLauncherId;
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
