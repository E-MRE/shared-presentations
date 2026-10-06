import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false,
    rolldownOptions: { output: { codeSplitting: { groups: [
      { name: 'firebase-firestore', priority: 20, test: /node_modules\/@firebase\/firestore\// },
      { name: 'firebase-auth', priority: 20, test: /node_modules\/@firebase\/auth\// },
      { name: 'firebase-core', test: /node_modules\/@firebase\//, priority: 1 },
      { name: 'react-router', test: /node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\// },
    ] } } },
  },
});
