import { lazy, Suspense } from 'react';
import { StatePanel } from '../components/StatePanel';
import { Routes, Route, Link } from 'react-router-dom';
import type { AuthState } from '../contracts/auth';
import type { PresentationDataService } from '../contracts/services';
import type { AdminReadAdapter } from '../features/admin/adapter';
const LibraryPage = lazy(() => import('../features/library/LibraryPage').then(module => ({ default: module.LibraryPage })));
const MyDecksPage = lazy(() => import('../features/library/MyDecksPage').then(module => ({ default: module.MyDecksPage })));
const AdminPage = lazy(() => import('../features/admin/AdminPage').then(module => ({ default: module.AdminPage })));
const UploadPage = lazy(() => import('../features/editor/PresentationEditor').then(module => ({ default: module.UploadPage })));
const EditPage = lazy(() => import('../features/editor/PresentationEditor').then(module => ({ default: module.EditPage })));
const ViewerPage = lazy(() => import('../features/viewer/ViewerPage').then(module => ({ default: module.ViewerPage })));

export interface ApplicationRouterProps { auth: AuthState; service: PresentationDataService; adapter: AdminReadAdapter; }
export function ApplicationRouter({ auth, service, adapter }: ApplicationRouterProps) {
  return <Suspense fallback={<StatePanel kind="loading" title="Sayfa hazırlanıyor…"/>}><Routes>
    <Route path="/" element={<LibraryPage auth={auth} service={service} />} />
    <Route path="/benim" element={<MyDecksPage auth={auth} service={service} />} />
    <Route path="/yeni" element={<UploadPage auth={auth} service={service} />} />
    <Route path="/duzenle/:id" element={<EditPage auth={auth} service={service} />} />
    <Route path="/admin" element={auth.isAdmin ? <AdminPage auth={auth} service={service} adapter={adapter} showPendingBadge={false} /> : <StatePanel heading="h1" kind="error" title="Yönetici yetkisi gerekiyor" description="Onay masası yalnızca yöneticilere açıktır."><Link className="btn btn-secondary" to="/">Arşive dön</Link></StatePanel>} />
    <Route path="/s/:id" element={<ViewerPage auth={auth} service={service} />} />
    <Route path="*" element={<StatePanel heading="h1" kind="error" title="Sayfa bulunamadı" description="Bu bağlantı değişmiş veya kaldırılmış olabilir."><Link className="btn btn-secondary" to="/">Arşive dön</Link></StatePanel>} />
  </Routes></Suspense>;
}
