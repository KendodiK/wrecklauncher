import React from 'react';
import { AnimatePresence, motion } from 'motion/react';

const AllGamesDrawer = ({
  open,
  games,
  launchers,
  activeGameId,
  onClose,
  onSelectGame,
}) => {
  const launcherMap = (launchers ?? []).reduce((acc, l) => {
    acc[l.id] = l;
    return acc;
  }, {});

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            onClick={onClose}
            className="lib-drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.aside
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 28 }}
            className="lib-drawer"
          >
            <div className="lib-drawer-header">
              <h2 className="lib-drawer-title">ALL GAMES</h2>
              <button
                type="button"
                onClick={onClose}
                className="lib-drawer-close"
              >
                Close
              </button>
            </div>

            <div className="lib-drawer-list scrollbar-thin">
              {games.map((game) => {
                const isActive = game.id === activeGameId;
                return (
                  <button
                    key={game.id}
                    type="button"
                    onClick={() => {
                      onSelectGame(game.id);
                      onClose();
                    }}
                    className={`lib-drawer-item ${isActive ? 'lib-drawer-item-active' : ''} ${game.cracked ? 'lib-drawer-item-cracked' : ''}`}
                  >
                    <img src={game.coverUrl} alt="" className="lib-drawer-item-img" />
                    <div className="min-w-0">
                      <div className="lib-drawer-item-title">{game.title}</div>
                      <div className="lib-drawer-item-meta">
                        {launcherMap[game.launcherId]?.name ?? 'Launcher'} - {game.genres.join(', ')}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
};

export default AllGamesDrawer;
