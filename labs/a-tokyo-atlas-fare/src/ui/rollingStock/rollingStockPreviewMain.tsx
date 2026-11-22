import React from 'react';
import ReactDOM from 'react-dom/client';
import { RollingStockStudio } from './RollingStockStudio.js';
import '../styles.css';

ReactDOM.createRoot(document.getElementById('rolling-stock-root')!).render(
  <React.StrictMode>
    <RollingStockStudio />
  </React.StrictMode>,
);
