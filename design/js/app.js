/**
 * VEKTÖR PRESENTATION PLATFORM - CORE ENGINE
 * Zero-dependency modern ES6+ application logic.
 * Restrained, editorial, tactile presentation archive.
 */

// ==========================================================================
// 1. DATA & INITIAL STATE
// ==========================================================================

const INITIAL_PRESENTATIONS = [
  {
    id: 'deck-wasm-rust',
    title: 'WebAssembly & Rust ile İstemci Tarafında Yüksek Hızlı Veri İşleme',
    description: 'Tarayıcıda Gbps seviyesinde veri parse etme: Web Workers, SharedArrayBuffer ve Wasm bellek yönetimi stratejileri.',
    author: {
      id: 'burak',
      name: 'Burak Deniz',
      role: 'Senior Core Engineer',
      avatar: 'BD'
    },
    category: 'Mimari & Backend',
    tags: ['#wasm', '#rust', '#web-workers', '#performance'],
    filePath: 'presentations/local-first-crdt-sync.html',
    slideCount: 6,
    duration: '18 dk',
    status: 'pending', // Starts as pending to demonstrate admin approval workflow
    createdAt: '2026-02-14T10:30:00Z',
    views: 0
  },
  {
    id: 'deck-flutter-fluid',
    title: 'Fluid Interfaces: Flutter & Web Render Motorunda 60 FPS Derinlemesine',
    description: 'RenderObject yaşam döngüsü, frame budget disiplini, Impeller AOT shader warmup ve sıfır jank mimarisi.',
    author: {
      id: 'emre',
      name: 'Emre Gültekir',
      role: 'Platform Architect',
      avatar: 'EG'
    },
    category: 'Frontend & Flutter',
    tags: ['#flutter', '#60fps', '#impeller', '#renderobject'],
    filePath: 'presentations/flutter-fluid-rendering.html',
    slideCount: 5,
    duration: '15 dk',
    status: 'published',
    createdAt: '2026-02-12T14:00:00Z',
    views: 142
  },
  {
    id: 'deck-multi-agent',
    title: 'Multi-Agent AI Sistemleri: 2026 Production Mimarisi & Telemetri',
    description: 'Otonom alt-ajan koordinasyonu, izole git worktree sandbox yapısı, deterministik state makineleri ve OpenTelemetry izlenebilirliği.',
    author: {
      id: 'selin',
      name: 'Selin Yılmaz',
      role: 'Admin / Tech Lead',
      avatar: 'SY'
    },
    category: 'AI & LLM',
    tags: ['#multi-agent', '#orchestration', '#sandbox', '#opentelemetry'],
    filePath: 'presentations/multi-agent-orchestration.html',
    slideCount: 5,
    duration: '20 dk',
    status: 'published',
    createdAt: '2026-02-10T16:15:00Z',
    views: 298
  },
  {
    id: 'deck-design-tokens',
    title: 'Design Tokens Mimarisi: Figma\'dan Koda Sıfır Kayıp Köprüsü',
    description: '3 katmanlı token hiyerarşisi (Primitive, Semantic, Component), dinamik tema motoru ve WCAG AAA otomatik kontrast testleri.',
    author: {
      id: 'caner',
      name: 'Caner Erden',
      role: 'Staff Product Designer',
      avatar: 'CE'
    },
    category: 'UI/UX & Design',
    tags: ['#design-tokens', '#style-dictionary', '#wcag-aaa', '#figma'],
    filePath: 'presentations/zero-dependency-design-tokens.html',
    slideCount: 5,
    duration: '12 dk',
    status: 'published',
    createdAt: '2026-02-05T09:45:00Z',
    views: 215
  },
  {
    id: 'deck-local-first',
    title: 'Local-First Veritabanları ve CRDT Tabanlı Gerçek Zamanlı Sync',
    description: 'Cloud-first mimariden yerel veri sahipliğine: Sıfır ağ gecikmesi, Yjs operasyonel dönüşümü ve çevrimdışı dayanıklılık.',
    author: {
      id: 'burak',
      name: 'Burak Deniz',
      role: 'Senior Core Engineer',
      avatar: 'BD'
    },
    category: 'Mimari & Backend',
    tags: ['#local-first', '#crdt', '#yjs', '#offline-first'],
    filePath: 'presentations/local-first-crdt-sync.html',
    slideCount: 5,
    duration: '16 dk',
    status: 'published',
    createdAt: '2026-01-28T11:00:00Z',
    views: 184
  }
];

const TEAM_PERSONAS = [
  {
    id: 'selin',
    name: 'Selin Yılmaz',
    role: 'Admin / Tech Lead',
    avatar: 'SY',
    isAdmin: true
  },
  {
    id: 'emre',
    name: 'Emre Gültekir',
    role: 'Platform Architect',
    avatar: 'EG',
    isAdmin: false
  },
  {
    id: 'caner',
    name: 'Caner Erden',
    role: 'Staff Product Designer',
    avatar: 'CE',
    isAdmin: false
  },
  {
    id: 'burak',
    name: 'Burak Deniz',
    role: 'Senior Core Engineer',
    avatar: 'BD',
    isAdmin: false
  }
];

// App State
const state = {
  presentations: [],
  currentUser: null, // null = Guest
  activeTab: 'all',  // 'all' | 'my' | 'admin'
  selectedCategory: 'all',
  searchQuery: '',
  theme: 'dark',
  currentViewingDeck: null,
  uploadHtmlContent: null
};

// ==========================================================================
// 2. STORAGE & INITIALIZATION
// ==========================================================================

function loadState() {
  // Theme
  const savedTheme = localStorage.getItem('vektor_theme') || 'dark';
  setTheme(savedTheme);

  // Presentations
  const savedDecks = localStorage.getItem('vektor_presentations_v3');
  if (savedDecks) {
    try {
      state.presentations = JSON.parse(savedDecks);
    } catch (e) {
      state.presentations = [...INITIAL_PRESENTATIONS];
    }
  } else {
    state.presentations = [...INITIAL_PRESENTATIONS];
    savePresentations();
  }

  // User
  const savedUser = localStorage.getItem('vektor_user');
  if (savedUser) {
    try {
      state.currentUser = JSON.parse(savedUser);
    } catch (e) {
      state.currentUser = null;
    }
  }
}

function savePresentations() {
  localStorage.setItem('vektor_presentations_v3', JSON.stringify(state.presentations));
  updateStatsStrip();
}

function saveUser(user) {
  state.currentUser = user;
  if (user) {
    localStorage.setItem('vektor_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('vektor_user');
  }
  renderHeaderUser();
  renderViewTabs();
  renderGrid();
}

// ==========================================================================
// 3. THEME TOGGLE
// ==========================================================================

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('vektor_theme', theme);
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.setAttribute('title', theme === 'dark' ? 'Açık Temaya Geç' : 'Koyu Temaya Geç');
    themeBtn.innerHTML = theme === 'dark' ? getSunIcon() : getMoonIcon();
  }
}

function toggleTheme() {
  setTheme(state.theme === 'dark' ? 'light' : 'dark');
}

// ==========================================================================
// 4. RENDERING & UI UPDATES
// ==========================================================================

function updateStatsStrip() {
  const pendingCount = state.presentations.filter(p => p.status === 'pending').length;

  // Update Admin tab badge if visible
  const adminBadge = document.getElementById('admin-tab-badge');
  if (adminBadge) {
    adminBadge.textContent = pendingCount;
    adminBadge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
  }
}

function renderHeaderUser() {
  const container = document.getElementById('header-user-slot');
  if (!container) return;

  if (!state.currentUser) {
    // Guest View
    container.innerHTML = `
      <button class="btn btn-secondary" onclick="openAuthModal()" aria-label="Giriş Yap">
        <span>Giriş Yap</span>
      </button>
    `;
  } else {
    // Logged In View
    const { name, role, avatar, isAdmin } = state.currentUser;
    container.innerHTML = `
      <div class="user-menu-wrap">
        <button class="user-profile-btn" onclick="toggleUserDropdown(event)" aria-label="Kullanıcı Menüsü">
          <div class="user-avatar">${avatar}</div>
          <span class="user-name">${name}</span>
          <span class="user-badge ${isAdmin ? 'admin' : ''}">${isAdmin ? 'Admin' : 'Üye'}</span>
          ${getChevronDownIcon()}
        </button>
        <div class="dropdown-menu" id="user-dropdown">
          <div style="padding: 6px 10px; font-size: 0.8125rem; color: var(--text-secondary); border-bottom: 1px solid var(--border-subtle); margin-bottom: 2px;">
            <strong style="color: var(--text-primary); display:block;">${name}</strong>
            <span style="font-size: 0.75rem;">${role}</span>
          </div>
          <button class="dropdown-item" onclick="switchTab('my')">
            ${getUserIcon()}
            <span>Benim Sunumlarım</span>
          </button>
          ${isAdmin ? `
          <button class="dropdown-item" onclick="switchTab('admin')">
            ${getShieldIcon()}
            <span>Onay Masası</span>
          </button>` : ''}
          <button class="dropdown-item" onclick="openUploadModal()">
            ${getUploadIcon()}
            <span>Yeni Sunum Yükle</span>
          </button>
          <div class="dropdown-divider"></div>
          <button class="dropdown-item danger" onclick="logoutUser()">
            ${getLogOutIcon()}
            <span>Çıkış Yap</span>
          </button>
        </div>
      </div>
    `;
  }
}

function toggleUserDropdown(e) {
  e.stopPropagation();
  const dropdown = document.getElementById('user-dropdown');
  if (dropdown) dropdown.classList.toggle('show');
}

window.addEventListener('click', () => {
  const dropdown = document.getElementById('user-dropdown');
  if (dropdown && dropdown.classList.contains('show')) {
    dropdown.classList.remove('show');
  }
});

function renderViewTabs() {
  const container = document.getElementById('view-tabs-container');
  if (!container) return;

  const isGuest = !state.currentUser;
  const isAdmin = state.currentUser && state.currentUser.isAdmin;
  const pendingCount = state.presentations.filter(p => p.status === 'pending').length;

  let tabsHtml = `
    <button class="view-tab ${state.activeTab === 'all' ? 'active' : ''}" onclick="switchTab('all')">
      Tüm Sunumlar
    </button>
  `;

  if (!isGuest) {
    tabsHtml += `
      <button class="view-tab ${state.activeTab === 'my' ? 'active' : ''}" onclick="switchTab('my')">
        Benim Sunumlarım
      </button>
    `;
  }

  if (isAdmin) {
    tabsHtml += `
      <button class="view-tab ${state.activeTab === 'admin' ? 'active' : ''}" onclick="switchTab('admin')">
        Onay Masası
        <span class="tab-badge" id="admin-tab-badge" style="display: ${pendingCount > 0 ? 'inline-block' : 'none'};">${pendingCount}</span>
      </button>
    `;
  }

  container.innerHTML = tabsHtml;
}

function switchTab(tab) {
  state.activeTab = tab;
  renderViewTabs();
  renderGrid();
}

function selectCategory(category) {
  state.selectedCategory = category;
  document.querySelectorAll('.cat-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.cat === category);
  });
  renderGrid();
}

function handleSearch(query) {
  state.searchQuery = query.toLowerCase().trim();
  const clearBtn = document.getElementById('search-clear');
  if (clearBtn) clearBtn.classList.toggle('visible', query.length > 0);
  renderGrid();
}

function clearSearch() {
  const input = document.getElementById('search-input');
  if (input) input.value = '';
  state.searchQuery = '';
  const clearBtn = document.getElementById('search-clear');
  if (clearBtn) clearBtn.classList.remove('visible');
  renderGrid();
}

// ==========================================================================
// 5. PRESENTATION CARDS GRID RENDERING
// ==========================================================================

function renderGrid() {
  const grid = document.getElementById('deck-grid');
  if (!grid) return;

  // Filter based on Tab
  let filtered = [...state.presentations];

  if (state.activeTab === 'all') {
    // Public Feed: ONLY published presentations
    filtered = filtered.filter(p => p.status === 'published');
  } else if (state.activeTab === 'my') {
    // My presentations
    if (!state.currentUser) {
      grid.innerHTML = getEmptyState('Giriş Yapılmadı', 'Kendi sunumlarınızı görüntülemek ve yönetmek için lütfen giriş yapın.', true);
      return;
    }
    filtered = filtered.filter(p => p.author.id === state.currentUser.id || p.author.name === state.currentUser.name);
  } else if (state.activeTab === 'admin') {
    // Admin Review Queue: pending presentations
    if (!state.currentUser || !state.currentUser.isAdmin) {
      grid.innerHTML = getEmptyState('Yetki Hatası', 'Onay masasını yalnızca yöneticiler görüntüleyebilir.', false);
      return;
    }
    filtered = filtered.filter(p => p.status === 'pending');
  }

  // Filter by Category
  if (state.selectedCategory !== 'all') {
    filtered = filtered.filter(p => p.category === state.selectedCategory);
  }

  // Filter by Search
  if (state.searchQuery) {
    filtered = filtered.filter(p =>
      p.title.toLowerCase().includes(state.searchQuery) ||
      p.description.toLowerCase().includes(state.searchQuery) ||
      p.author.name.toLowerCase().includes(state.searchQuery)
    );
  }

  // Chronological order: newest presentation on top
  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (filtered.length === 0) {
    grid.innerHTML = getEmptyState('Sunum Bulunamadı', 'Kriterlerinize uygun sunum bulunmuyor.', false);
    return;
  }

  grid.innerHTML = filtered.map(deck => createCardHtml(deck)).join('');
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch (e) {
    return dateStr;
  }
}

function createCardHtml(deck) {
  const isAuthor = state.currentUser && (state.currentUser.id === deck.author.id || state.currentUser.name === deck.author.name);
  const isAdmin = state.currentUser && state.currentUser.isAdmin;
  const showEdit = isAuthor || isAdmin;
  const isPending = deck.status === 'pending';

  const statusBadge = isPending ? `
    <span class="card-status-badge status-pending">ONAY BEKLİYOR</span>
  ` : (deck.status === 'draft' ? `
    <span class="card-status-badge status-draft">TASLAK</span>
  ` : '');

  return `
    <article class="deck-card" id="${deck.id}">
      <div class="card-stage" onclick="launchPresentation('${deck.id}')">
        <div class="stage-top-meta">
          <span class="stage-category">${deck.category}</span>
          <div style="display: flex; align-items: center; gap: 6px;">
            ${statusBadge}
            <span class="stage-slide-count">${deck.slideCount} Slayt</span>
          </div>
        </div>
        <h2 class="stage-title">${deck.title}</h2>
      </div>

      <div class="card-body" onclick="launchPresentation('${deck.id}')">
        <div class="card-meta-line">
          <span class="card-date">${formatDate(deck.createdAt)}</span>
          <span>${deck.duration}</span>
        </div>
        <p class="card-description">${deck.description}</p>
      </div>

      <div class="card-footer">
        <div class="card-author">
          <div class="author-avatar">${deck.author.avatar || deck.author.name.substring(0, 2).toUpperCase()}</div>
          <div class="author-info">
            <span class="author-name">${deck.author.name}</span>
            <span class="author-role">${deck.author.role}</span>
          </div>
        </div>

        <div class="card-actions">
          ${showEdit ? `
            <button class="action-trigger" onclick="openEditModal('${deck.id}')" title="Sunumu Düzenle">
              ${getEditIcon()}
            </button>
            <button class="action-trigger" onclick="deleteDeck('${deck.id}')" title="Sunumu Sil">
              ${getTrashIcon()}
            </button>
          ` : ''}
          <button class="launch-link" onclick="launchPresentation('${deck.id}')">
            <span>Aç</span>
            <svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor"><path d="M200,64V168a8,8,0,0,1-16,0V83.31L69.66,197.66a8,8,0,0,1-11.32-11.32L172.69,72H88a8,8,0,0,1,0-16H192A8,8,0,0,1,200,64Z"/></svg>
          </button>
        </div>
      </div>

      ${isPending && isAdmin ? `
        <div class="admin-card-bar">
          <span class="admin-card-label">Admin İncelemesi</span>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-primary" style="padding: 3px 8px; font-size: 0.75rem;" onclick="approveDeck('${deck.id}')">
              Onayla & Yayınla
            </button>
            <button class="btn btn-secondary" style="padding: 3px 8px; font-size: 0.75rem;" onclick="rejectDeck('${deck.id}')">
              Reddet
            </button>
          </div>
        </div>
      ` : ''}
    </article>
  `;
}

function getEmptyState(title, desc, showLoginBtn) {
  return `
    <div class="empty-state">
      <div class="empty-icon">${getLayersIcon()}</div>
      <h3 class="empty-title">${title}</h3>
      <p class="empty-desc">${desc}</p>
      ${showLoginBtn ? `
        <button class="btn btn-primary" style="margin-top: 10px;" onclick="openAuthModal()">
          <span>Giriş Yap</span>
        </button>
      ` : ''}
    </div>
  `;
}

// ==========================================================================
// 6. PRESENTATION THEATER (LAUNCH & CONTROLS)
// ==========================================================================

function launchPresentation(deckId) {
  const deck = state.presentations.find(p => p.id === deckId);
  if (!deck) return;

  state.currentViewingDeck = deck;
  deck.views = (deck.views || 0) + 1;
  savePresentations();

  const theater = document.getElementById('theater-overlay');
  const iframe = document.getElementById('theater-iframe');
  const title = document.getElementById('theater-title');
  const author = document.getElementById('theater-author');

  if (title) title.textContent = deck.title;
  if (author) author.textContent = `${deck.author.name} • ${deck.category}`;

  // Load content into iframe
  if (deck.htmlContent) {
    iframe.srcdoc = deck.htmlContent;
  } else if (deck.filePath) {
    iframe.removeAttribute('srcdoc');
    iframe.src = deck.filePath;
  }

  theater.classList.add('active');
  document.body.style.overflow = 'hidden';

  setTimeout(() => {
    iframe.focus();
  }, 200);
}

function closeTheater() {
  const theater = document.getElementById('theater-overlay');
  const iframe = document.getElementById('theater-iframe');
  theater.classList.remove('active');
  document.body.style.overflow = '';
  if (iframe) {
    iframe.src = 'about:blank';
    iframe.removeAttribute('srcdoc');
  }
  state.currentViewingDeck = null;
}

function toggleTheaterFullscreen() {
  const viewport = document.getElementById('theater-frame-box');
  if (!document.fullscreenElement) {
    if (viewport.requestFullscreen) {
      viewport.requestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}

function openTheaterInNewTab() {
  if (!state.currentViewingDeck) return;
  if (state.currentViewingDeck.filePath) {
    window.open(state.currentViewingDeck.filePath, '_blank');
  } else if (state.currentViewingDeck.htmlContent) {
    const newWindow = window.open();
    newWindow.document.write(state.currentViewingDeck.htmlContent);
    newWindow.document.close();
  }
}

// ==========================================================================
// 7. UPLOAD WORKFLOW & REALTIME PREVIEW
// ==========================================================================

function openUploadModal() {
  if (!state.currentUser) {
    showToast('Sunum yüklemek için önce giriş yapmalısınız.', 'pending');
    openAuthModal();
    return;
  }

  const modal = document.getElementById('upload-modal');
  const form = document.getElementById('upload-form');
  if (form) form.reset();
  state.uploadHtmlContent = null;
  const previewBox = document.getElementById('upload-preview-box');
  if (previewBox) {
    previewBox.classList.remove('has-content');
    const frame = document.getElementById('upload-preview-frame');
    if (frame) frame.removeAttribute('srcdoc');
  }

  const authorInput = document.getElementById('upload-author');
  if (authorInput) authorInput.value = state.currentUser.name;

  modal.classList.add('active');
}

function closeUploadModal() {
  const modal = document.getElementById('upload-modal');
  modal.classList.remove('active');
}

function handleFileUpload(file) {
  if (!file || !file.name.endsWith('.html')) {
    showToast('Lütfen geçerli bir .html dosyası seçin.', 'danger');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    state.uploadHtmlContent = e.target.result;
    showToast(`"${file.name}" yüklendi.`, 'success');

    const titleInput = document.getElementById('upload-title');
    if (titleInput && !titleInput.value) {
      const match = state.uploadHtmlContent.match(/<title>(.*?)<\/title>/i);
      if (match && match[1]) {
        titleInput.value = match[1];
      } else {
        titleInput.value = file.name.replace('.html', '').replace(/-/g, ' ');
      }
    }

    const previewBox = document.getElementById('upload-preview-box');
    const frame = document.getElementById('upload-preview-frame');
    if (previewBox && frame) {
      previewBox.classList.add('has-content');
      frame.srcdoc = state.uploadHtmlContent;
    }
  };
  reader.readAsText(file);
}

function submitUpload(e) {
  e.preventDefault();
  const title = document.getElementById('upload-title').value.trim();
  const description = document.getElementById('upload-description').value.trim();
  const category = document.getElementById('upload-category').value;
  const tagsRaw = document.getElementById('upload-tags').value.trim();

  if (!title || !description) {
    showToast('Lütfen başlık ve özet alanlarını doldurun.', 'danger');
    return;
  }

  if (!state.uploadHtmlContent) {
    state.uploadHtmlContent = generateFallbackSlideHtml(title, description, state.currentUser.name, category);
  }

  const tags = tagsRaw
    ? tagsRaw.split(',').map(t => t.trim().startsWith('#') ? t.trim() : '#' + t.trim())
    : ['#sunum'];

  const newDeck = {
    id: 'deck-' + Date.now(),
    title,
    description,
    author: {
      id: state.currentUser.id,
      name: state.currentUser.name,
      role: state.currentUser.role,
      avatar: state.currentUser.avatar
    },
    category,
    tags,
    htmlContent: state.uploadHtmlContent,
    slideCount: 5,
    duration: '10 dk',
    status: 'pending',
    createdAt: new Date().toISOString(),
    views: 0
  };

  state.presentations.unshift(newDeck);
  savePresentations();
  closeUploadModal();

  showToast('Sunum yüklendi ve onaya iletildi.', 'pending');

  state.activeTab = 'my';
  renderViewTabs();
  renderGrid();
}

function generateFallbackSlideHtml(title, desc, author, category) {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background: #0C0E12; color: #F3F4F6; font-family: 'Schibsted Grotesk', -apple-system, sans-serif; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 3rem; text-align: center; }
    .badge { font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; background: rgba(255,255,255,0.08); color: #9CA3AF; border: 1px solid rgba(255,255,255,0.15); padding: 4px 12px; border-radius: 9999px; margin-bottom: 1.5rem; text-transform: uppercase; letter-spacing: 0.04em; }
    h1 { font-size: 2.5rem; font-weight: 700; margin-bottom: 1rem; max-width: 840px; line-height: 1.2; color: #FFFFFF; letter-spacing: -0.02em; }
    p { font-size: 1.1rem; color: #9CA3AF; max-width: 680px; line-height: 1.6; margin-bottom: 2rem; }
    .author { font-size: 0.875rem; color: #D1D5DB; font-family: 'JetBrains Mono', monospace; }
  </style>
</head>
<body>
  <div class="badge">${category}</div>
  <h1>${title}</h1>
  <p>${desc}</p>
  <div class="author">Sunumu Hazırlayan: ${author}</div>
</body>
</html>`;
}

// ==========================================================================
// 8. ADMIN APPROVAL & REJECTION
// ==========================================================================

function approveDeck(deckId) {
  const deck = state.presentations.find(p => p.id === deckId);
  if (!deck) return;

  deck.status = 'published';
  savePresentations();

  showToast(`"${deck.title}" onaylandı ve yayına alındı.`, 'success');
  renderViewTabs();
  renderGrid();
}

function rejectDeck(deckId) {
  const deck = state.presentations.find(p => p.id === deckId);
  if (!deck) return;

  if (confirm(`"${deck.title}" sunumunu reddetmek istiyor musunuz?`)) {
    deck.status = 'draft';
    savePresentations();
    showToast(`"${deck.title}" taslağa alındı.`, 'danger');
    renderViewTabs();
    renderGrid();
  }
}

function deleteDeck(deckId) {
  const deck = state.presentations.find(p => p.id === deckId);
  if (!deck) return;

  if (confirm(`"${deck.title}" sunumunu silmek istediğinizden emin misiniz?`)) {
    state.presentations = state.presentations.filter(p => p.id !== deckId);
    savePresentations();
    showToast('Sunum silindi.', 'success');
    renderGrid();
  }
}

// ==========================================================================
// 9. EDIT PRESENTATION MODAL
// ==========================================================================

function openEditModal(deckId) {
  const deck = state.presentations.find(p => p.id === deckId);
  if (!deck) return;

  const modal = document.getElementById('edit-modal');
  document.getElementById('edit-deck-id').value = deck.id;
  document.getElementById('edit-title').value = deck.title;
  document.getElementById('edit-description').value = deck.description;
  document.getElementById('edit-category').value = deck.category;
  document.getElementById('edit-tags').value = deck.tags.join(', ');

  modal.classList.add('active');
}

function closeEditModal() {
  const modal = document.getElementById('edit-modal');
  modal.classList.remove('active');
}

function submitEdit(e) {
  e.preventDefault();
  const deckId = document.getElementById('edit-deck-id').value;
  const deck = state.presentations.find(p => p.id === deckId);
  if (!deck) return;

  deck.title = document.getElementById('edit-title').value.trim();
  deck.description = document.getElementById('edit-description').value.trim();
  deck.category = document.getElementById('edit-category').value;
  const tagsRaw = document.getElementById('edit-tags').value.trim();
  deck.tags = tagsRaw.split(',').map(t => t.trim().startsWith('#') ? t.trim() : '#' + t.trim());

  savePresentations();
  closeEditModal();
  showToast('Sunum güncellendi.', 'success');
  renderGrid();
}

// ==========================================================================
// 10. AUTH MODAL & PERSONA SWITCHER
// ==========================================================================

function openAuthModal() {
  const modal = document.getElementById('auth-modal');
  renderPersonas();
  modal.classList.add('active');
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  modal.classList.remove('active');
}

function renderPersonas() {
  const grid = document.getElementById('persona-grid');
  if (!grid) return;

  grid.innerHTML = TEAM_PERSONAS.map(p => `
    <div class="persona-card" onclick="loginAs('${p.id}')">
      <div class="persona-avatar">${p.avatar}</div>
      <div class="persona-details">
        <span class="persona-name">${p.name}</span>
        <span class="persona-role">${p.role}</span>
      </div>
    </div>
  `).join('');
}

function loginAs(personaId) {
  const persona = TEAM_PERSONAS.find(p => p.id === personaId);
  if (!persona) return;

  saveUser(persona);
  closeAuthModal();
  showToast(`Giriş yapıldı: ${persona.name}`, 'success');
}

function logoutUser() {
  saveUser(null);
  state.activeTab = 'all';
  showToast('Çıkış yapıldı.', 'pending');
}

// ==========================================================================
// 11. DESIGN SYSTEM DRAWER
// ==========================================================================

function openDesignDrawer() {
  const drawer = document.getElementById('design-drawer');
  drawer.classList.add('active');
}

function closeDesignDrawer() {
  const drawer = document.getElementById('design-drawer');
  drawer.classList.remove('active');
}

// ==========================================================================
// 12. TOAST NOTIFICATIONS
// ==========================================================================

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-dot"></span>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
    setTimeout(() => toast.remove(), 200);
  }, 3600);
}

// ==========================================================================
// 13. KEYBOARD SHORTCUTS
// ==========================================================================

window.addEventListener('keydown', (e) => {
  // ESC exits modal and theater
  if (e.key === 'Escape') {
    if (document.getElementById('theater-overlay').classList.contains('active')) {
      closeTheater();
    } else if (document.getElementById('upload-modal').classList.contains('active')) {
      closeUploadModal();
    } else if (document.getElementById('auth-modal').classList.contains('active')) {
      closeAuthModal();
    } else if (document.getElementById('edit-modal').classList.contains('active')) {
      closeEditModal();
    } else if (document.getElementById('design-drawer').classList.contains('active')) {
      closeDesignDrawer();
    }
  }

  // F toggles fullscreen in theater
  if (e.key === 'f' || e.key === 'F') {
    if (document.getElementById('theater-overlay').classList.contains('active')) {
      toggleTheaterFullscreen();
    }
  }

  // Arrow keys bridge to presentation iframe
  if (document.getElementById('theater-overlay').classList.contains('active')) {
    const iframe = document.getElementById('theater-iframe');
    if (e.key === 'ArrowRight' || e.key === ' ') {
      iframe.contentWindow.postMessage('next', '*');
    } else if (e.key === 'ArrowLeft') {
      iframe.contentWindow.postMessage('prev', '*');
    }
  }
});

// ==========================================================================
// 14. SVG ICONS (Minimal Phosphor Outlines)
// ==========================================================================

function getUserIcon() {
  return `<svg width="15" height="15" viewBox="0 0 256 256" fill="currentColor"><path d="M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8c18.84-32.56,52.14-52,89.07-52s70.23,19.44,89.07,52a8,8,0,1,0,13.85-8ZM72,96a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z"/></svg>`;
}

function getShieldIcon() {
  return `<svg width="15" height="15" viewBox="0 0 256 256" fill="currentColor"><path d="M208,40H48A16,16,0,0,0,32,56v56c0,86.29,86.66,117.84,92.51,119.87a15.82,15.82,0,0,0,6.98,0C137.34,229.84,224,198.29,224,112V56A16,16,0,0,0,208,40Zm0,72c0,72.63-74.87,101.44-80,103.34C122.87,213.44,48,184.63,48,112V56H208Z"/></svg>`;
}

function getUploadIcon() {
  return `<svg width="15" height="15" viewBox="0 0 256 256" fill="currentColor"><path d="M240,136v64a16,16,0,0,1-16,16H32a16,16,0,0,1-16-16V136a16,16,0,0,1,16-16H80a8,8,0,0,1,0,16H32v64H224V136H176a8,8,0,0,1,0-16h48A16,16,0,0,1,240,136ZM82.34,77.66,120,40V144a8,8,0,0,0,16,0V40l37.66,37.66a8,8,0,0,0,11.31-11.32l-51.31-51.31a8,8,0,0,0-11.32,0L71,66.34A8,8,0,0,0,82.34,77.66Z"/></svg>`;
}

function getLogOutIcon() {
  return `<svg width="15" height="15" viewBox="0 0 256 256" fill="currentColor"><path d="M112,216a8,8,0,0,1-8,8H48a16,16,0,0,1-16-16V48A16,16,0,0,1,48,32h56a8,8,0,0,1,0,16H48V208h56A8,8,0,0,1,112,216Zm109.66-93.66-40-40a8,8,0,0,0-11.32,11.32L196.69,120H104a8,8,0,0,0,0,16h92.69l-26.35,26.34a8,8,0,0,0,11.32,11.32l40-40A8,8,0,0,0,221.66,122.34Z"/></svg>`;
}

function getChevronDownIcon() {
  return `<svg width="11" height="11" viewBox="0 0 256 256" fill="currentColor"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"/></svg>`;
}

function getEditIcon() {
  return `<svg width="13" height="13" viewBox="0 0 256 256" fill="currentColor"><path d="M227.32,73.37,182.63,28.69a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.32,96A16,16,0,0,0,227.32,73.37ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.69,147.31,64l24-24L216,84.69Z"/></svg>`;
}

function getTrashIcon() {
  return `<svg width="13" height="13" viewBox="0 0 256 256" fill="currentColor"><path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96ZM192,208H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"/></svg>`;
}

function getLayersIcon() {
  return `<svg width="22" height="22" viewBox="0 0 256 256" fill="currentColor"><path d="M228.66,122.34l-96-56a8,8,0,0,0-7.32,0l-96,56a8,8,0,0,0,0,13.32l96,56a8,8,0,0,0,7.32,0l96-56a8,8,0,0,0,0-13.32ZM128,177.34,48.57,129,128,80.66,207.43,129Zm96.66,41.32-96,56a8,8,0,0,1-7.32,0l-96-56a8,8,0,0,1,7.32-13.32L128,260.66l91.43-53.32a8,8,0,1,1,7.32,13.32Z"/></svg>`;
}

function getSunIcon() {
  return `<svg width="17" height="17" viewBox="0 0 256 256" fill="currentColor"><path d="M120,40V16a8,8,0,0,1,16,0V40a8,8,0,0,1-16,0Zm72,88a64,64,0,1,1-64-64A64.07,64.07,0,0,1,192,128Zm-16,0a48,48,0,1,0-48,48A48.05,48.05,0,0,0,176,128ZM58.34,69.66A8,8,0,0,0,69.66,58.34L52.69,41.37A8,8,0,0,0,41.37,52.69ZM120,216v24a8,8,0,0,0,16,0V216a8,8,0,0,0-16,0Zm83.31-29.66a8,8,0,0,0,11.32-11.32l-16.97-16.97a8,8,0,0,0-11.32,11.32ZM41.37,203.31a8,8,0,0,0,11.32,11.32l16.97-16.97A8,8,0,0,0,58.34,186.34ZM216,120h24a8,8,0,0,1,0,16H216a8,8,0,0,1,0-16ZM16,120H40a8,8,0,0,1,0,16H16a8,8,0,0,1,0-16Zm181.66-61.66a8,8,0,0,0-11.32,11.32l16.97,16.97a8,8,0,0,0,11.32-11.32Z"/></svg>`;
}

function getMoonIcon() {
  return `<svg width="17" height="17" viewBox="0 0 256 256" fill="currentColor"><path d="M233.54,142.23a8,8,0,0,0-8-2,88.08,88.08,0,0,1-109.8-109.8,8,8,0,0,0-10-10,104.84,104.84,0,0,0-52.91,37A104,104,0,0,0,136,224a103.09,103.09,0,0,0,62.52-20.88,104.84,104.84,0,0,0,37-52.91A8,8,0,0,0,233.54,142.23ZM136,208A88,88,0,0,1,61.85,61.85,88.4,88.4,0,0,1,88,43.25,104.14,104.14,0,0,0,212.75,168,88.4,88.4,0,0,1,136,208Z"/></svg>`;
}

// ==========================================================================
// 15. DOM CONTENT LOADED EVENT
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  loadState();
  renderHeaderUser();
  renderViewTabs();
  renderGrid();
  updateStatsStrip();

  const dropzone = document.getElementById('upload-dropzone');
  const fileInput = document.getElementById('upload-file');

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        handleFileUpload(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleFileUpload(e.target.files[0]);
      }
    });
  }

  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => handleSearch(e.target.value));
  }
});
