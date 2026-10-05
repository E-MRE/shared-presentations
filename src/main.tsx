import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './theme';
import { ToastProvider } from './components';
import { App } from './App';
import './styles/index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Application root is missing.');
createRoot(container).render(<BrowserRouter><ThemeProvider><ToastProvider><App /></ToastProvider></ThemeProvider></BrowserRouter>);
