import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppLayout } from '../../src/layout';
import { DeckCard, Modal, ToastProvider, useToast } from '../../src/components';
import { ThemeProvider, ThemeToggle, useTheme } from '../../src/theme';
import type { AuthState, AuthUser } from '../../src/contracts/auth';
import type { Deck } from '../../src/contracts/models';
import '../../src/styles/index.css';
import './harness.css';
const long = 'UzunKullanıcıAdı'.repeat(12);
const user: AuthUser = { uid: 'test', email: 'test@example.invalid', displayName: long, isEmailVerified: true, isGoogle: false, isMember: true, isAdmin: false };
const deck: Deck = { id:'test-deck', ownerUid:'test', ownerName:long, title:'Dağıtık Sistemlerde Güvenilir Tasarım', description:'Ekip içi teknik sunumlar, mimari kararlar ve araştırma kayıtları. <script>window.untrusted=true</script> '+ 'UzunKelime'.repeat(15), links:[], kind:'html', fileName:'test.html', status:'published', rejectNote:'<b>İçeriği güncelleyin</b>', cover:new Uint8Array(), coverSource:'default', sizes:{encoded:0,unpacked:0,fileCount:1},chunkCount:0,chunks:[],createdAt:new Date('2026-10-02T12:00:00Z'),updatedAt:new Date('2026-10-02T12:00:00Z'),publishedAt:null,reviewedBy:null,reviewedAt:null,manifestVersion:1,quotaMarker:'' };
const coverUrl = 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="#181c23"/><text x="40" y="200" fill="#f3f4f6" font-size="34">Dağıtık Sistemler</text></svg>');
function Harness() {
  const [auth, setAuth] = useState<AuthState>({status:'authenticated',user:{...user,isAdmin:true},isMember:true,isAdmin:true});
  const [pending, setPending] = useState(2);
  const [open, setOpen] = useState(false);
  const [backdrop, setBackdrop] = useState(false);
  const [mounted, setMounted] = useState(true);
  const [cards, setCards] = useState(true);
  const [bytes, setBytes] = useState(new Uint8Array());
  const [calls, setCalls] = useState('');
  const initial = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const theme = useTheme();
  Object.assign(window, { ui: { setAuth: (role: string) => {
    if (role === 'loading' || role === 'unauthenticated') setAuth({status:role,user:null,isAdmin:false,isMember:false});
    else if (role === 'unverified') setAuth({status:'unverified',user:{...user,isMember:false,isEmailVerified:false},isAdmin:false,isMember:false});
    else setAuth({status:'authenticated',user:{...user,isAdmin:role==='admin'},isAdmin:role==='admin',isMember:true});
  }, setPending, setBackdrop, setMounted, setCards, setBytes: (values:number[])=>setBytes(new Uint8Array(values)), notify:toast.notify, dismiss:toast.dismiss, setPreference:theme.setPreference } });
  return <AppLayout auth={auth} pendingCount={pending} onSignIn={()=>setCalls('signin')} onSignOut={()=>setCalls('signout')} actions={<ThemeToggle/>}>
    <div className="ui-intro"><h1>Sunum Arşivi</h1><p>Ekip içi teknik sunumlar, mimari kararlar ve araştırma kayıtları.</p></div>
    <div className="ui-controls"><button className="btn btn-secondary" id="modal-trigger" onClick={()=>setOpen(true)}>Pencereyi aç</button><button className="btn btn-secondary" id="toast-trigger" onClick={()=>toast.notify({message:'Sunum kaydedildi',kind:'success'})}>Bildirim göster</button><output id="calls">{calls}</output><output id="theme-state">{theme.preference}/{theme.theme}</output></div>
    {cards && <div className="ui-grid"><DeckCard deck={deck} coverUrl={coverUrl} actions={<button className="btn btn-secondary" onClick={()=>setCalls('edit')}>Düzenle</button>}/><DeckCard deck={{...deck,id:'pptx',title:'Ürün Yol Haritası',kind:'pptx',status:'pending'}}/><DeckCard deck={{...deck,id:'rejected',title:'Mimari İncelemesi '+ 'UzunSunumBaşlığı'.repeat(6),status:'rejected'}} showRejectNote/><DeckCard deck={{...deck,id:'binary',title:'Binary Kapak',status:'unpublished',cover:bytes}}/></div>}
    {mounted && <Modal open={open} title="Sunumu gözden geçir" description="Kararınızı ekip arkadaşlarınızla paylaşın." onClose={()=>setOpen(false)} initialFocus={initial} closeOnBackdrop={backdrop} footer={<button className="btn btn-primary" id="modal-last" onClick={()=>setOpen(false)}>Tamam</button>}><label htmlFor="note">Not</label><input className="form-input" id="note" ref={initial}/><p>Sunum ayrıntılarını kontrol edin.</p><div className="ui-modal-long">{'İnceleme açıklaması. '.repeat(100)}</div></Modal>}
  </AppLayout>;
}
const root = createRoot(document.getElementById('root')!);
root.render(<BrowserRouter><ThemeProvider><ToastProvider><Harness/></ToastProvider></ThemeProvider></BrowserRouter>);
Object.assign(window, { unmountUI: () => root.unmount() });
