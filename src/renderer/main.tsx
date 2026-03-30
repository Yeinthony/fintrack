import './assets/main.css';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

createRoot(document.getElementById('root')).render(
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>                                                                                                    
    <App />                                                                                                           
  </MemoryRouter>
);
