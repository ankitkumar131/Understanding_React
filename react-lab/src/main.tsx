import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import { installMockApi } from './dev/mock-api';
import { App } from './projects/taskboard/App';

// Part 17: the capstone project is the app this lab serves. The mock API keeps it
// working without a backend (dev only — it is a no-op in a production build).
installMockApi();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
