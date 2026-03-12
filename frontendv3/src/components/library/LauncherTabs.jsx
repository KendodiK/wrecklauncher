import React from 'react';

const LauncherTabs = ({ launchers, activeLauncherId, onChange }) => {
  return (
    <div className="lib-launcher-tabs">
      {launchers.map((launcher) => {
        const isActive = launcher.id === activeLauncherId;
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
