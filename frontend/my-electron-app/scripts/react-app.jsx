import React from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return (
    <>
      <p>Welcome — this content is now rendered by React.</p>
    </>
  );
}

function bootstrap() {
  const container = document.getElementById('app-content');
  if (!container) return;

  const root = createRoot(container);
  root.render(<App />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
