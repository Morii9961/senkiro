/// <reference types="vite/client" />
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './ui/tokens.css'
import './style.css'

const root = createRoot(document.getElementById('root')!)
if (import.meta.env.DEV && new URLSearchParams(location.search).get('preview') === 'vehicles') {
  void import('./trains/VehiclePreview').then(({ VehiclePreview }) => root.render(<VehiclePreview />))
} else root.render(<App />)
