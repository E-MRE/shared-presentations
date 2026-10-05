import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import type { AuthState } from '../contracts/auth';
import type { PresentationDataService } from '../contracts/services';
import type { AdminReadAdapter } from '../features/admin/adapter';
import { LibraryPage, MyDecksPage } from '../features/library';
import { AdminPage } from '../features/admin';
import { UploadPage, EditPage } from '../features/editor';
import { ViewerPage } from '../features/viewer';

export interface ApplicationRouterProps { auth: AuthState; service: PresentationDataService; adapter: AdminReadAdapter; }
export function ApplicationRouter({ auth, service, adapter }: ApplicationRouterProps) {
  const navigate = useNavigate();
  return <Routes>
    <Route path="/" element={<LibraryPage auth={auth} service={service} />} />
    <Route path="/benim" element={<MyDecksPage auth={auth} service={service} />} />
    <Route path="/yeni" element={<UploadPage auth={auth} service={service} />} />
    <Route path="/duzenle/:id" element={<EditPage auth={auth} service={service} />} />
    <Route path="/admin" element={auth.isAdmin ? <AdminPage auth={auth} service={service} adapter={adapter} showPendingBadge={false} /> : <section className="main-content"><h1>Yönetici yetkisi gerekiyor</h1><Link to="/">Arşive dön</Link></section>} />
    <Route path="/s/:id" element={<ViewerPage auth={auth} service={service} onClose={() => navigate('/', { replace: true })} />} />
    <Route path="*" element={<section className="main-content"><h1>Sayfa bulunamadı</h1><Link to="/">Arşive dön</Link></section>} />
  </Routes>;
}
