(() => {
  'use strict';

  // ── Global error boundary ─────────────────────────────────────────────────
  window.onerror = (msg, src, line, col, err) => {
    console.error('Error global:', msg, src, line, col, err);
    try {
      const toast = document.getElementById('appToast');
      if (toast) {
        toast.textContent = `⚠️ Error inesperado: ${msg}`;
        toast.className = 'app-toast toast-error show';
        setTimeout(() => { toast.className = 'app-toast'; }, 5000);
      }
    } catch {}
    return false; // don't suppress default console
  };
  window.addEventListener('unhandledrejection', (e) => {
    console.error('Promesa rechazada:', e.reason);
    try {
      const toast = document.getElementById('appToast');
      if (toast) {
        toast.textContent = `⚠️ Error: ${e.reason?.message || e.reason}`;
        toast.className = 'app-toast toast-error show';
        setTimeout(() => { toast.className = 'app-toast'; }, 5000);
      }
    } catch {}
  });

  const DB_CONFIG = {
    name: 'iperc_offline_db',
    version: 3,
    recordsStore: 'iperc_records',
    programacionesStore: 'programaciones',
  };

  const IMAGE_CONFIG = {
    maxImageWidth: 1200,
    quality: 0.5,
    maxImageKB: 500,
  };

  // ── fetchWithTimeout: wraps fetch() with AbortController timeout ──────────
  function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(timer));
  }

  // ── normalizeStr: removes accents + uppercase for loose comparison ─────────
  function normalizeStr(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();
  }

  const LOCAL_CONFIG_KEY = 'iperc_local_config';
  const SESSION_KEY = 'iperc_session';
  const REMEMBER_LOGIN_KEY = 'iperc_remember_login';
  const USERS_CACHE_KEY = 'iperc_users_cache';
  const PERSONAL_CACHE_KEY = 'iperc_personal_cache';
  const LOCAL_CONFIG_FILE = './config.local.json';
  const REMOTE_CONFIG_CACHE_KEY = 'iperc_remote_config';

  const DEFAULT_LOCAL_CONFIG = {
    webhookUrl: '',
    supportWhatsappNumber: '+51983113140',
    sheetId: '17cxHfwY_xz2Jf9zCgCYmNcGdNS0lvX-ZK1oeiOiCBEg',
    driveFolderId: '10Pq6ZkFldvYscycP8F32_M-Sc3pkZu4c',
    programTab: 'DATA_PROGRAMA',
    registrosTab: 'DATA_REGISTROS',
    usersTab: 'USUARIOS',
    personalTab: 'PERSONAL',
    amStart: '07:00',
    amEnd: '08:00',
    pmStart: '19:00',
    pmEnd: '20:00',
    retentionDays: 14,
    timezone: 'America/Lima',
    syncBatchSize: 100,
    syncRetryMax: 3,
    image: {
      maxImageWidth: 1200,
      quality: 0.5,
      maxImageKB: 500,
    },
    supervisors: ['Carlos Ruiz', 'María García', 'Jorge Cárdenas', 'Ana Castillo'],
    workers: [
      'Juan Pérez - Operador de Maquinaria',
      'María García - Técnico Electricista',
      'Carlos Ruiz - Supervisor de Seguridad',
      'Luis Mendoza - Perforista'
    ]
  };

  const state = {
    db: null,
    currentView: 'login',
    navStack: [],
    syncing: false,
    latestCompressedBase64: null,
    latestCompressedMeta: null,
    baseConfig: structuredClone(DEFAULT_LOCAL_CONFIG),
    localConfig: structuredClone(DEFAULT_LOCAL_CONFIG),
    usersCache: [],
    personalCache: [],
    drawerOpen: false,
    latestProgramacion: null,
    allWorkers: [],
  };

  const els = {
    appTitle: document.getElementById('appTitle'),
    btnBack: document.getElementById('btnBack'),
    btnSync: document.getElementById('btnSync'),
    topbar: document.querySelector('.topbar'),
    footerNav: document.getElementById('footerNav'),
    sideDrawer: document.getElementById('sideDrawer'),
    drawerOverlay: document.getElementById('drawerOverlay'),
    btnCloseDrawer: document.getElementById('btnCloseDrawer'),
    btnLogout: document.getElementById('btnLogout'),
    syncBadge: document.getElementById('syncBadge'),
    statusBar: document.getElementById('statusBar'),

    historialList: document.getElementById('historialList'),
    programacionBanner: document.getElementById('programacionBanner'),
    programacionBannerText: document.getElementById('programacionBannerText'),

    loginForm: document.getElementById('loginForm'),
    loginUser: document.getElementById('loginUser'),
    loginPassword: document.getElementById('loginPassword'),
    btnToggleLoginPassword: document.getElementById('btnToggleLoginPassword'),
    loginPasswordToggleIcon: document.getElementById('loginPasswordToggleIcon'),
    rememberLogin: document.getElementById('rememberLogin'),
    btnForgotPassword: document.getElementById('btnForgotPassword'),
    usersDataInfo: document.getElementById('usersDataInfo'),

    programacionForm: document.getElementById('programacionForm'),
    guardia: document.getElementById('guardia'),
    turno: document.getElementById('turno'),
    cantidadProgramada: document.getElementById('cantidadProgramada'),
    actividadesTurno: document.getElementById('actividadesTurno'),
    goNuevaProgramacion: document.getElementById('goNuevaProgramacion'),
    btnCantidadMas: document.getElementById('btnCantidadMas'),
    btnCantidadMenos: document.getElementById('btnCantidadMenos'),

    registroForm: document.getElementById('registroForm'),
    fechaHoraOculta: document.getElementById('fechaHoraOculta'),
    registroGuardia: document.getElementById('registroGuardia'),
    registroTurno: document.getElementById('registroTurno'),
    supervisorSelect: null,
    trabajadorInput: document.getElementById('trabajadorInput'),
    trabajadorDropdown: document.getElementById('trabajadorDropdown'),
    btnTrabajadorManual: null,
    trabajadorManualWrap: null,
    trabajadorManual: null,
    bloqueoProgramadoId: null,
    actividadInput: document.getElementById('actividadInput'),
    captureBtn: document.getElementById('captureBtn'),
    photoInput: document.getElementById('photoInput'),
    photoMeta: document.getElementById('photoMeta'),
    photoPreview: document.getElementById('photoPreview'),
    btnClearPhoto: document.getElementById('btnClearPhoto'),

    btnNuevoRegistroDesdeHistorial: document.getElementById('btnNuevoRegistroDesdeHistorial'),

    // Programacion detail view elements
    detailGuardiaBadge: document.getElementById('detailGuardiaBadge'),
    detailTurnoBadge: document.getElementById('detailTurnoBadge'),
    detailMetaValue: document.getElementById('detailMetaValue'),
    detailMetaDisplay: document.getElementById('detailMetaDisplay'),
    detailRealizados: document.getElementById('detailRealizados'),
    detailProgreso: document.getElementById('detailProgreso'),
    detailHorario: document.getElementById('detailHorario'),
    detailRecordsList: document.getElementById('detailRecordsList'),
    btnIncrementMeta: document.getElementById('btnIncrementMeta'),
    btnAddRecordFromDetail: document.getElementById('btnAddRecordFromDetail'),

    btnGuardiaA: document.getElementById('btnGuardiaA'),
    btnGuardiaB: document.getElementById('btnGuardiaB'),
    btnGuardiaC: document.getElementById('btnGuardiaC'),
    btnTurnoDia: document.getElementById('btnTurnoDia'),
    btnTurnoNoche: document.getElementById('btnTurnoNoche'),
  };

  let _toastTimer = null;
  function showToast(message, type = 'warning', duration = 4000) {
    const toast = document.getElementById('appToast');
    const msg = document.getElementById('appToastMsg');
    const icon = document.getElementById('appToastIcon');
    if (!toast || !msg) return;
    const icons = { warning: 'schedule', error: 'cancel', success: 'check_circle', info: 'info' };
    toast.className = `app-toast toast-${type}`;
    msg.textContent = message;
    icon.textContent = icons[type] || 'info';
    clearTimeout(_toastTimer);
    requestAnimationFrame(() => toast.classList.add('show'));
    _toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  document.addEventListener('DOMContentLoaded', init);

  // Register Service Worker for offline asset caching
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW register failed:', err));
  }

  async function init() {
    await loadConfigFromFile();
    loadLocalConfig();
    applyRemoteConfigCache();     // apply cached remote config immediately (offline-safe)
    applyDashboardIframe();
    applyBranding();
    state.usersCache = getUsersCache();
    state.personalCache = getPersonalCache();
    updateNetworkUI();
    bindUI();
    hydrateRememberedLogin();
    state.db = await openDB();
    await primeMasterDataForFirstUse();
    loadSession();
    populateCatalogSelects();
    ensureSessionStillActive();
    await refreshUIStats();
    updateNetworkUI();
    showView(getLoggedUser() ? 'historial' : 'login', { push: false });
    // Background tasks: cleanup, pull programaciones, pull remote config from Sheets
    cleanupOldData().catch(console.error);
    refreshProgramacionesIfPossible({ silent: true }).catch(console.error);
    fetchRemoteConfig().catch(console.error);
  }

  async function cleanupOldData() {
    const retentionDays = Math.max(1, Number(state.localConfig.retentionDays || 14));
    const limitDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    try {
      const records = await getAllRecords();
      for (const r of records) {
        if (r.syncStatus === 'SYNCED' || r.estado === 'SYNCED') {
          const d = r.createdAt ? new Date(r.createdAt) : null;
          if (d && d < limitDate) await deleteRecord(r.id);
        }
      }
      const progs = await getAllProgramaciones();
      for (const p of progs) {
        if (p.syncStatus === 'SYNCED') {
          const d = p.fechaHoraProgramacion ? new Date(p.fechaHoraProgramacion) : null;
          if (d && d < limitDate) await deleteProgramacion(p.id);
        }
      }
    } catch (err) {
      console.error('cleanupOldData:', err);
    }
  }

  async function exportHistorialReport() {
    const allRecords = filterDataBySessionAndAge(await getAllRecords(), 'registro');
    const allProgramaciones = filterDataBySessionAndAge(await getAllProgramaciones(), 'programacion');
    if (!allProgramaciones.length) {
      showToast('No hay programaciones para exportar.', 'warning', 3000);
      return;
    }
    const recordsByProgram = new Map();
    allRecords.forEach((r) => {
      const key = String(r.programacionId || '');
      if (key) recordsByProgram.set(key, (recordsByProgram.get(key) || 0) + 1);
    });
    const lines = [
      'REPORTE DE HISTORIAL IPERC - ' + (state.localConfig.companyName || 'CERRO LINDO').toUpperCase(),
      `Generado: ${new Date().toLocaleString('es-PE')}`,
      '',
      'ID,FECHA,GUARDIA,TURNO,META,REALIZADOS,%,ESTADO,SUPERVISOR,ACTIVIDADES',
    ];
    allProgramaciones.slice().reverse().forEach((item) => {
      const meta = Number(item.cantidadProgramada || 0);
      const localCount = recordsByProgram.get(String(item.id)) || 0;
      const realizados = Math.max(localCount, Number(item.realizadosRemoto || 0));
      const porcentaje = meta > 0 ? Math.round((realizados / meta) * 100) : 0;
      const status = getProgramacionStatus(item, realizados);
      const fecha = item.fechaHoraLocal || new Date(item.fechaHoraProgramacion).toLocaleString('es-PE');
      const actividades = (item.actividadesTurno || '').replace(/[,"\n]/g, ' ');
      lines.push(`${item.id},"${fecha}",${item.guardia || ''},${item.turno || ''},${meta},${realizados},${porcentaje}%,${status},"${item.supervisor || ''}","${actividades}"`);
    });
    lines.push('');
    lines.push('DETALLE DE REGISTROS');
    lines.push('ID,PROGRAMACION_ID,TRABAJADOR,ACTIVIDAD,GUARDIA,TURNO,FECHA,ESTADO');
    allRecords.slice().reverse().forEach((r) => {
      const actividad = (r.actividad || r.actividadRealizada || '').replace(/[,"\n]/g, ' ');
      const fecha = r.fechaHoraLocal || (r.createdAt ? new Date(r.createdAt).toLocaleString('es-PE') : '');
      lines.push(`${r.id},${r.programacionId || ''},"${r.trabajador || ''}","${actividad}",${r.guardia || ''},${r.turno || ''},"${fecha}",${r.syncStatus || r.estado || ''}`);
    });
    const csvContent = lines.join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iperc_historial_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Reporte exportado como CSV.', 'success', 3000);
  }

  function deleteProgramacion(id) {
    return new Promise((resolve, reject) => {
      const request = store(DB_CONFIG.programacionesStore, 'readwrite').delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  function applyBranding() {
    const name = state.localConfig.companyName || 'Cerro Lindo';
    const el = document.getElementById('loginCompanyName');
    if (el) el.textContent = name;
    const title = document.querySelector('title');
    if (title) title.textContent = `Control IPERC ${name}`;
  }

  function applyDashboardIframe() {
    const url = state.localConfig.dashboardIframeUrl || '';
    const card = document.getElementById('dashboardIframeCard');
    const iframe = document.getElementById('dashboardIframe');
    const btnFs = document.getElementById('btnIframeFullscreen');
    const overlay = document.getElementById('iframeOverlay');
    const iframeFs = document.getElementById('dashboardIframeFs');
    const btnClose = document.getElementById('btnIframeOverlayClose');
    if (!card || !iframe) return;
    if (url) {
      iframe.src = url;
      card.classList.remove('hidden');
    }
    if (btnFs && overlay && iframeFs) {
      btnFs.addEventListener('click', () => {
        iframeFs.src = url;
        overlay.classList.remove('hidden');
        overlay.style.display = 'flex';
      });
    }
    if (btnClose && overlay && iframeFs) {
      btnClose.addEventListener('click', () => {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
        iframeFs.src = '';
      });
    }
  }

  async function loadConfigFromFile() {
    try {
      const response = await fetch(LOCAL_CONFIG_FILE, { cache: 'no-store' });
      if (!response.ok) {
        state.baseConfig = structuredClone(DEFAULT_LOCAL_CONFIG);
        return;
      }

      const fileCfg = await response.json();
      state.baseConfig = mergeConfig(DEFAULT_LOCAL_CONFIG, fileCfg || {});
    } catch {
      state.baseConfig = structuredClone(DEFAULT_LOCAL_CONFIG);
    }
  }

  // Fetches amStart/amEnd/pmStart/pmEnd/retentionDays/companyName/dashboardIframeUrl/supportWhatsappNumber
  // from the CONFIG tab in the Google Sheet. Results are cached in localStorage for offline use.
  async function fetchRemoteConfig() {
    const webhookUrl = state.localConfig.webhookUrl || state.baseConfig.webhookUrl;
    const sheetId = state.localConfig.sheetId || state.baseConfig.sheetId;
    if (!webhookUrl || !sheetId) return;

    try {
      const url = `${webhookUrl}?action=config&sheetId=${encodeURIComponent(sheetId)}`;
      const res = await fetchWithTimeout(url, { cache: 'no-store' }, 20000);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.ok || !data.config) return;

      // Merge remote config into localConfig (remote values take precedence over local file)
      const remote = data.config;
      const REMOTE_KEYS = [
        'amStart', 'amEnd', 'pmStart', 'pmEnd',
        'retentionDays', 'companyName',
        'dashboardIframeUrl', 'supportWhatsappNumber',
      ];
      REMOTE_KEYS.forEach((key) => {
        if (remote[key] !== undefined && remote[key] !== '') {
          state.localConfig[key] = remote[key];
        }
      });

      // Cache for offline use
      try { localStorage.setItem(REMOTE_CONFIG_CACHE_KEY, JSON.stringify(remote)); } catch (_) { /* storage full */ }

      // Re-apply UI that depends on these values
      applyBranding();
      applyDashboardIframe();
    } catch (err) {
      console.warn('fetchRemoteConfig failed:', err);
    }
  }

  // Applies previously cached remote config immediately (synchronous, for offline startup)
  function applyRemoteConfigCache() {
    try {
      const raw = localStorage.getItem(REMOTE_CONFIG_CACHE_KEY);
      if (!raw) return;
      const remote = JSON.parse(raw);
      const REMOTE_KEYS = [
        'amStart', 'amEnd', 'pmStart', 'pmEnd',
        'retentionDays', 'companyName',
        'dashboardIframeUrl', 'supportWhatsappNumber',
      ];
      REMOTE_KEYS.forEach((key) => {
        if (remote[key] !== undefined && remote[key] !== '') {
          state.localConfig[key] = remote[key];
        }
      });
    } catch (_) { /* ignore */ }
  }

  function mergeConfig(base, extra) {
    const merged = {
      ...structuredClone(base),
      ...(extra || {}),
    };

    merged.image = {
      ...(base.image || structuredClone(IMAGE_CONFIG)),
      ...((extra && extra.image) || {}),
    };

    return merged;
  }

  function bindUI() {
    window.addEventListener('online', async () => {
      updateNetworkUI();
      await refreshPendingBadge();
      // Auto-sync when connection is restored if there are pending items
      try {
        const pending = await getPendingRecords();
        const pendingProgs = await getPendingProgramaciones();
        if ((pending.length || pendingProgs.length) && state.localConfig.webhookUrl) {
          showToast(`Conexión restaurada. Sincronizando ${pending.length + pendingProgs.length} elemento(s)…`, 'success', 3000);
          handleSync().catch(console.error);
        } else {
          refreshProgramacionesIfPossible({ silent: true }).catch(console.error);
        }
      } catch (err) {
        console.error('auto-sync on reconnect:', err);
      }
    });

    window.addEventListener('offline', updateNetworkUI);
    
    // Periodic network status check every 3 seconds
    setInterval(updateNetworkUI, 3000);

    els.btnBack.addEventListener('click', handleBackOrMenu);
    els.btnSync.addEventListener('click', handleSync);
    els.btnCloseDrawer.addEventListener('click', closeDrawer);
    els.drawerOverlay.addEventListener('click', closeDrawer);
    els.btnLogout.addEventListener('click', handleLogout);

    document.querySelectorAll('[data-drawer-target]').forEach((button) => {
      button.addEventListener('click', () => {
        const target = button.getAttribute('data-drawer-target');
        closeDrawer();
        showView(target);
      });
    });

    document.querySelectorAll('.nav-btn').forEach((button) => {
      button.addEventListener('click', () => showView(button.dataset.target));
    });

    els.loginForm.addEventListener('submit', onLoginSubmit);
    els.btnToggleLoginPassword.addEventListener('click', toggleLoginPasswordVisibility);
    els.btnForgotPassword.addEventListener('click', onForgotPassword);

    els.goNuevaProgramacion.addEventListener('click', () => showView('programacion'));
    els.btnCantidadMas.addEventListener('click', () => adjustCantidad(1));
    els.btnCantidadMenos.addEventListener('click', () => adjustCantidad(-1));
    els.programacionForm.addEventListener('submit', onProgramacionSubmit);

    els.captureBtn.addEventListener('click', () => els.photoInput.click());
    els.photoInput.addEventListener('change', onPhotoSelected);
    if (els.btnClearPhoto) els.btnClearPhoto.addEventListener('click', clearPhoto);
    els.registroForm.addEventListener('submit', onRegistroSubmit);
    // Mark form dirty on any input change
    els.registroForm.addEventListener('input', () => { state.formDirty = true; });
    els.registroForm.addEventListener('change', () => { state.formDirty = true; });

    // Trabajador dropdown
    els.trabajadorInput.addEventListener('focus', () => {
      els.trabajadorDropdown.classList.remove('hidden');
    });

    els.trabajadorInput.addEventListener('input', (e) => {
      renderTrabajadorDropdown(e.target.value);
      els.trabajadorDropdown.classList.remove('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#trabajadorInput') && !e.target.closest('#trabajadorDropdown')) {
        els.trabajadorDropdown.classList.add('hidden');
      }
    });

    els.btnNuevoRegistroDesdeHistorial.addEventListener('click', () => {
      const now = new Date();
      if (!isInsideProgramacionWindow(now)) {
        const amStart = state.localConfig.amStart || '07:00';
        const amEnd = state.localConfig.amEnd || '08:00';
        const pmStart = state.localConfig.pmStart || '19:00';
        const pmEnd = state.localConfig.pmEnd || '20:00';
        const horaActual = now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
        showToast(`Fuera de horario (${horaActual}). Ventanas: ${amStart}–${amEnd} / ${pmStart}–${pmEnd}`, 'warning', 4000);
        return;
      }
      showView('programacion');
    });

    // Programacion detail view
    if (els.btnIncrementMeta) els.btnIncrementMeta.addEventListener('click', incrementMeta);

    const btnExport = document.getElementById('btnExportHistorial');
    if (btnExport) btnExport.addEventListener('click', exportHistorialReport);

    if (els.btnAddRecordFromDetail) els.btnAddRecordFromDetail.addEventListener('click', async () => {
      if (state.latestProgramacion) {
        const meta = Number(state.latestProgramacion.cantidadProgramada || 0);
        if (meta > 0) {
          const allRecords = await getAllRecords();
          const realizados = allRecords.filter(r => r.programacionId === state.latestProgramacion.id).length;
          if (realizados >= meta) {
            showToast(`Meta alcanzada (${realizados}/${meta}). No puedes agregar más registros.`, 'error', 4000);
            return;
          }
        }
      }
      showView('registro');
    });

    // Guardia picker
    [
      { btn: els.btnGuardiaA, value: 'A', peers: () => [els.btnGuardiaA, els.btnGuardiaB, els.btnGuardiaC] },
      { btn: els.btnGuardiaB, value: 'B', peers: () => [els.btnGuardiaA, els.btnGuardiaB, els.btnGuardiaC] },
      { btn: els.btnGuardiaC, value: 'C', peers: () => [els.btnGuardiaA, els.btnGuardiaB, els.btnGuardiaC] },
    ].forEach(({ btn, value, peers }) => {
      btn.addEventListener('click', () => {
        peers().forEach((b) => b.classList.remove('picker-btn--active'));
        btn.classList.add('picker-btn--active');
        els.guardia.value = value;
      });
    });

    // Turno picker
    [
      { btn: els.btnTurnoDia, value: 'DIA', peers: () => [els.btnTurnoDia, els.btnTurnoNoche] },
      { btn: els.btnTurnoNoche, value: 'NOCHE', peers: () => [els.btnTurnoDia, els.btnTurnoNoche] },
    ].forEach(({ btn, value, peers }) => {
      btn.addEventListener('click', () => {
        peers().forEach((b) => b.classList.remove('picker-btn--active'));
        btn.classList.add('picker-btn--active');
        els.turno.value = value;
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.drawerOpen) {
        closeDrawer();
      }
    });
  }

  function loadLocalConfig() {
    try {
      const raw = localStorage.getItem(LOCAL_CONFIG_KEY);
      if (!raw) {
        state.localConfig = structuredClone(state.baseConfig);
        return;
      }
      const parsed = JSON.parse(raw);
      state.localConfig = mergeConfig(state.baseConfig, parsed);
      state.localConfig.supervisors = normalizeList(state.localConfig.supervisors);
      state.localConfig.workers = normalizeList(state.localConfig.workers);
    } catch {
      state.localConfig = structuredClone(state.baseConfig);
    }
  }

  function normalizeList(list) {
    return (list || [])
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  function showLoginFeedback(type, message, cb) {
    const overlay = document.getElementById('loginFeedback');
    const icon = document.getElementById('loginFeedbackSymbol');
    const msg = document.getElementById('loginFeedbackMsg');
    if (!overlay) { if (cb) cb(); return; }
    overlay.className = 'login-feedback ' + (type === 'success' ? 'fb-success' : 'fb-error');
    icon.textContent = type === 'success' ? 'check_circle' : 'cancel';
    msg.textContent = message;
    overlay.classList.remove('hidden');
    setTimeout(() => {
      overlay.classList.add('hidden');
      overlay.className = 'login-feedback hidden';
      if (cb) cb();
    }, type === 'success' ? 1400 : 2200);
  }

  function setLoginLoading(loading) {
    const btn = document.getElementById('btnLoginSubmit');
    const spinner = document.getElementById('btnLoginSpinner');
    const label = document.getElementById('btnLoginLabel');
    if (!btn) return;
    btn.disabled = loading;
    btn.style.opacity = loading ? '0.8' : '';
    if (spinner) spinner.classList.toggle('hidden', !loading);
    if (label) label.textContent = loading ? 'Verificando...' : 'INGRESAR';
  }

  async function onLoginSubmit(event) {
    event.preventDefault();
    const dni = els.loginUser.value.trim();
    const password = els.loginPassword.value.trim();
    if (!dni || !password) return;

    setLoginLoading(true);

    if (navigator.onLine) {
      await refreshUsersIfPossible({ silent: true, forceOnline: true });
      await refreshPersonalIfPossible({ silent: true });
      fetchRemoteConfig().catch(console.error);
    }

    if (!state.usersCache.length) {
      setLoginLoading(false);
      showLoginFeedback('error', 'Sin base de usuarios local. Conéctese a internet e intente nuevamente.');
      return;
    }

    const activeUser = state.usersCache.find((user) => String(user.dni) === dni && String(user.contrasena) === password && user.estado === 'ACTIVO');
    if (!activeUser) {
      setLoginLoading(false);
      showLoginFeedback('error', 'Credenciales inválidas o usuario inactivo.');
      return;
    }

    localStorage.setItem(SESSION_KEY, JSON.stringify({
      dni: activeUser.dni,
      username: activeUser.dni,
      displayName: activeUser.nombre,
      cargo: activeUser.cargo,
      area: activeUser.area,
      guardia: activeUser.guardia,
      correo: activeUser.correo,
      estado: activeUser.estado,
    }));
    persistRememberedLogin(dni);
    loadSession();
    setLoginLoading(false);
    showLoginFeedback('success', `¡Bienvenido, ${activeUser.nombre || dni}!`, () => showView('historial'));
  }

  function toggleLoginPasswordVisibility() {
    const currentlyHidden = els.loginPassword.type === 'password';
    els.loginPassword.type = currentlyHidden ? 'text' : 'password';
    els.loginPasswordToggleIcon.textContent = currentlyHidden ? 'visibility_off' : 'visibility';
  }

  function persistRememberedLogin(dni) {
    if (els.rememberLogin.checked) {
      localStorage.setItem(REMEMBER_LOGIN_KEY, JSON.stringify({
        dni,
        remember: true,
      }));
      return;
    }

    localStorage.removeItem(REMEMBER_LOGIN_KEY);
  }

  function hydrateRememberedLogin() {
    try {
      const raw = localStorage.getItem(REMEMBER_LOGIN_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.remember || !parsed.dni) return;

      els.loginUser.value = String(parsed.dni);
      els.rememberLogin.checked = true;
    } catch {
      localStorage.removeItem(REMEMBER_LOGIN_KEY);
    }
  }

  function onForgotPassword() {
    const targetNumber = sanitizeWhatsappNumber(state.localConfig.supportWhatsappNumber || state.baseConfig.supportWhatsappNumber || '+51983113140');
    if (!targetNumber) {
      alert('No hay número de WhatsApp configurado para recuperación de clave.');
      return;
    }

    const dni = (els.loginUser.value || '').trim();
    const dniText = dni || '[INGRESE_SU_DNI]';
    const message = `Hola, olvidé mi contraseña de Control IPERC. Usuario (DNI): ${dniText}`;
    const whatsappUrl = `https://wa.me/${targetNumber}?text=${encodeURIComponent(message)}`;

    const popup = window.open(whatsappUrl, '_blank');
    if (!popup) {
      window.location.href = whatsappUrl;
    }
  }

  function sanitizeWhatsappNumber(value) {
    return String(value || '').replace(/[^\d]/g, '');
  }

  function loadSession() {
    const user = getLoggedUser();
    updateUsersDataInfo();
  }

  function getLoggedUser() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function adjustCantidad(delta) {
    const current = Number(els.cantidadProgramada.value || 1);
    const next = Math.max(1, current + delta);
    els.cantidadProgramada.value = String(next);
  }

  async function onProgramacionSubmit(event) {
    event.preventDefault();

    const now = new Date();
    const session = getLoggedUser();
    if (!session) {
      alert('Debe iniciar sesión para crear una programación.');
      showView('login');
      return;
    }

    if (!isInsideProgramacionWindow(now)) {
      const amStart = state.localConfig.amStart || '07:00';
      const amEnd = state.localConfig.amEnd || '08:00';
      const pmStart = state.localConfig.pmStart || '19:00';
      const pmEnd = state.localConfig.pmEnd || '20:00';
      const horaActual = now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
      showToast(`Fuera de horario (${horaActual}). Ventanas: ${amStart}–${amEnd} / ${pmStart}–${pmEnd}`, 'warning', 4000);
      return;
    }

    const programacionId = await generateShortId(DB_CONFIG.programacionesStore, 7);

    const programacion = {
      id: programacionId,
      fechaHoraProgramacion: now.toISOString(),
      fechaHoraLocal: formatDateTime(now),
      supervisor: session?.displayName || session?.username || '',
      guardia: els.guardia.value,
      turno: els.turno.value,
      cantidadProgramada: Number(els.cantidadProgramada.value || 0),
      actividadesTurno: els.actividadesTurno.value.trim(),
      estado: 'PROGRAMADO',
      syncStatus: 'PENDING',
      syncedAt: '',
    };

    await saveProgramacion(programacion);
    state.latestProgramacion = programacion;
    applyLatestProgramacionToRegistro();
    await refreshUIStats();
    showToast('Programación guardada. Continúe con el registro IPERC.', 'success', 3000);
    showView('registro');
  }

  function isInsideProgramacionWindow(dateObj) {
    const nowMinutes = dateObj.getHours() * 60 + dateObj.getMinutes();
    const amStart = toMinutes(state.localConfig.amStart);
    const amEnd = toMinutes(state.localConfig.amEnd);
    const pmStart = toMinutes(state.localConfig.pmStart);
    const pmEnd = toMinutes(state.localConfig.pmEnd);

    return inRange(nowMinutes, amStart, amEnd) || inRange(nowMinutes, pmStart, pmEnd);
  }

  function inRange(value, start, end) {
    return Number.isFinite(start) && Number.isFinite(end) && value >= start && value <= end;
  }

  function toMinutes(hhmm) {
    const parts = String(hhmm || '').split(':');
    if (parts.length !== 2) return NaN;
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
    return h * 60 + m;
  }

  function applyLatestProgramacionToRegistro() {
    if (!state.latestProgramacion) {
      els.programacionBanner.classList.add('hidden');
      return;
    }
    const p = state.latestProgramacion;
    els.registroGuardia.value = p.guardia;
    els.registroTurno.value = p.turno;
    els.programacionBannerText.textContent =
      `Guardia ${p.guardia} · Turno ${p.turno} · ${p.cantidadProgramada} programados · ${new Date(p.fechaHoraProgramacion).toLocaleString()}`;
    els.programacionBanner.classList.remove('hidden');
  }



  function clearPhoto() {
    state.latestCompressedBase64 = null;
    state.latestCompressedMeta = null;
    els.photoPreview.src = '';
    els.photoPreview.classList.add('hidden');
    if (els.btnClearPhoto) els.btnClearPhoto.classList.add('hidden');
    els.photoInput.value = '';
    els.photoMeta.textContent = 'Sin fotografía seleccionada.';
  }

  async function onPhotoSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    try {
      const imageSettings = {
        ...IMAGE_CONFIG,
        ...(state.localConfig.image || {}),
      };
      const compressed = await compressImage(file, imageSettings.maxImageWidth, imageSettings.quality, imageSettings.maxImageKB);
      state.latestCompressedBase64 = compressed.dataUrl;
      state.latestCompressedMeta = compressed;
      els.photoPreview.src = compressed.dataUrl;
      els.photoPreview.classList.remove('hidden');
      if (els.btnClearPhoto) els.btnClearPhoto.classList.remove('hidden');
      els.photoMeta.textContent = `Original: ${Math.round(file.size / 1024)} KB | Comprimida: ${compressed.sizeKB} KB`;
    } catch (error) {
      console.error(error);
      alert('No se pudo procesar la fotografía.');
    }
  }

  async function onRegistroSubmit(event) {
    event.preventDefault();

    const user = getLoggedUser();
    if (!user) {
      alert('Debe iniciar sesión.');
      showView('login');
      return;
    }

    if (!state.latestCompressedBase64) {
      alert('Debe capturar la evidencia fotográfica.');
      return;
    }

    const now = new Date();
    const latestProgram = state.latestProgramacion || await getLatestProgramacion();
    if (!latestProgram) {
      alert('Primero debe registrar una programación IPERC (DATA_PROGRAMA).');
      showView('programacion');
      return;
    }

    const trabajadorValue = els.trabajadorInput.value.trim();

    const registroId = await generateShortId(DB_CONFIG.recordsStore, 7);

    const record = {
      id: registroId,
      createdAt: now.toISOString(),
      createdAtEpoch: now.getTime(),
      fechaHoraLocal: formatDateTime(now),

      usuario: user.username,
      nombreUsuario: user.displayName,
      supervisor: user.displayName || user.username || '',

      guardia: els.registroGuardia.value,
      turno: els.registroTurno.value,
      trabajador: trabajadorValue,
      trabajadorOrigen: 'LISTA',
      bloqueoProgramadoId: latestProgram ? latestProgram.id : registroId,
      actividad: els.actividadInput.value.trim(),

      programacionId: latestProgram ? latestProgram.id : '',
      programacionCantidad: latestProgram ? latestProgram.cantidadProgramada : null,
      programacionActividades: latestProgram ? latestProgram.actividadesTurno : '',
      programacionFechaHora: latestProgram ? latestProgram.fechaHoraProgramacion : '',

      imagenBase64: state.latestCompressedBase64,
      imagenMimeType: 'image/jpeg',
      imagenKB: state.latestCompressedMeta?.sizeKB || null,
      imagenWidth: state.latestCompressedMeta?.width || null,
      imagenHeight: state.latestCompressedMeta?.height || null,
      imagenQuality: state.latestCompressedMeta?.quality || null,

      estado: 'PENDING',
      syncStatus: 'PENDING',
      origen: 'cordova-webview'
    };

    const requiredOk = record.guardia && record.turno && record.trabajador;
    if (!requiredOk) {
      alert('Complete Guardia, Turno y Trabajador.');
      return;
    }

    await saveRecord(record);
    resetRegistroForm();
    await refreshUIStats();
    showToast('Registro guardado. Pendiente de sincronización.', 'success', 3000);
    showView('historial');
  }

  function resetRegistroForm() {
    els.registroForm.reset();
    state.latestCompressedBase64 = null;
    state.latestCompressedMeta = null;
    els.photoPreview.src = '';
    els.photoPreview.classList.add('hidden');
    if (els.btnClearPhoto) els.btnClearPhoto.classList.add('hidden');
    els.photoMeta.textContent = 'Sin fotografía seleccionada.';
    state.formDirty = false;
    els.fechaHoraOculta.value = new Date().toISOString();
    loadSession();
    applyLatestProgramacionToRegistro();
  }

  async function handleSyncDetail() {
    if (!state.latestProgramacion) return;
    if (!navigator.onLine) {
      showToast('Sin conexión. Conéctate a internet para sincronizar.', 'error', 4000);
      return;
    }
    if (!state.localConfig.webhookUrl) {
      showToast('Falta Webhook URL en config.local.json.', 'error', 4000);
      return;
    }
    setSyncLoading(true);
    try {
      const prog = { ...state.latestProgramacion, syncStatus: 'PENDING' };
      await saveProgramacion(prog);
      state.latestProgramacion = prog;

      const retryMax = Math.max(1, Number(state.localConfig.syncRetryMax || 3));
      const responseData = await sendPayloadWithRetry({
        entity: 'programacion',
        programacion: prog,
        metadata: {
          appVersion: '1.2.0',
          syncedAt: new Date().toISOString(),
          localConfig: {
            sheetId: state.localConfig.sheetId,
            driveFolderId: state.localConfig.driveFolderId,
            programTab: state.localConfig.programTab,
            registrosTab: state.localConfig.registrosTab,
            usersTab: state.localConfig.usersTab,
            personalTab: state.localConfig.personalTab,
          }
        }
      }, retryMax);

      await markProgramacionSynced(prog.id, responseData.programaId || prog.id);
      state.latestProgramacion = { ...prog, syncStatus: 'SYNCED' };
      showToast('Programación sincronizada correctamente.', 'success', 3000);
      await refreshUIStats();
    } catch (err) {
      console.error(err);
      showToast(`Error al sincronizar: ${err.message}`, 'error', 5000);
    } finally {
      setSyncLoading(false);
    }
  }

  async function handleSync() {
    if (state.syncing) return;

    if (!navigator.onLine) {
      showToast('Sin conexión. Conéctate a internet para sincronizar.', 'error', 4000);
      return;
    }

    if (!state.localConfig.webhookUrl) {
      showToast('Falta Webhook URL. Edite config.local.json y recargue la app.', 'error', 4000);
      return;
    }

    setSyncLoading(true);
    try {
      if (!ensureSessionStillActive()) return;

      const batchSize = Math.max(1, Number(state.localConfig.syncBatchSize || 100));
      const retryMax = Math.max(1, Number(state.localConfig.syncRetryMax || 3));
      const pendingProgramaciones = (await getPendingProgramaciones()).slice(0, batchSize);
      const pending = (await getPendingRecords()).slice(0, batchSize);

      // 1. Upload pending programaciones
      for (const item of pendingProgramaciones) {
        const responseData = await sendPayloadWithRetry({
          entity: 'programacion',
          programacion: item,
          metadata: {
            appVersion: '1.2.0',
            syncedAt: new Date().toISOString(),
            localConfig: {
              sheetId: state.localConfig.sheetId,
              driveFolderId: state.localConfig.driveFolderId,
              programTab: state.localConfig.programTab,
              registrosTab: state.localConfig.registrosTab,
              usersTab: state.localConfig.usersTab,
              personalTab: state.localConfig.personalTab,
            }
          }
        }, retryMax);
        await markProgramacionSynced(item.id, responseData.programaId || item.id);
      }

      // 2. Upload pending registros
      for (const row of pending) {
        const payload = {
          entity: 'registro',
          source: 'iperc-mobile-hybrid',
          record: row,
          metadata: {
            appVersion: '1.2.0',
            syncedAt: new Date().toISOString(),
            localConfig: {
              sheetId: state.localConfig.sheetId,
              driveFolderId: state.localConfig.driveFolderId,
              programTab: state.localConfig.programTab,
              registrosTab: state.localConfig.registrosTab,
              usersTab: state.localConfig.usersTab,
              personalTab: state.localConfig.personalTab,
            }
          }
        };
        await sendPayloadWithRetry(payload, retryMax);
        await deleteRecord(row.id);
        await refreshPendingBadge();
      }

      // 3. Always pull latest from Sheets (programaciones + config + supporting caches)
      await refreshProgramacionesIfPossible({ silent: true });
      await fetchRemoteConfig();
      await refreshUIStats();
      Promise.all([
        refreshUsersIfPossible({ silent: true }),
        refreshPersonalIfPossible({ silent: true }),
      ]).catch(console.error);

      const uploaded = pendingProgramaciones.length + pending.length;
      showToast(
        uploaded > 0
          ? `Sincronizado: ${uploaded} subido(s) y datos actualizados.`
          : 'Datos actualizados desde Sheets.',
        'success',
        3000
      );
    } catch (error) {
      console.error(error);
      showToast(`Error en sincronización: ${error.message}`, 'error', 5000);
    } finally {
      setSyncLoading(false);
    }
  }

  async function sendPayloadWithRetry(payload, retryMax) {
    let lastHttp = 0;

    for (let attempt = 1; attempt <= retryMax; attempt += 1) {
      const response = await fetchWithTimeout(state.localConfig.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });

      lastHttp = response.status;
      if (response.ok) {
        let result;
        try {
          result = await response.json();
        } catch {
          result = { ok: false, error: 'Respuesta JSON inválida del backend' };
        }

        if (result && result.ok === true) {
          return result;
        }

        if (attempt >= retryMax) {
          throw new Error(result?.error || 'ok=false');
        }
      } else if (attempt >= retryMax) {
        throw new Error(`HTTP ${lastHttp} tras ${retryMax} intentos`);
      }

      if (attempt < retryMax) {
        await sleep(500 * attempt);
      }
    }

    throw new Error('No confirmado por backend');
  }
  function setSyncLoading(loading) {
    state.syncing = loading;
    els.btnSync.classList.toggle('syncing', loading);
    els.btnSync.disabled = loading;
    if (!loading) {
      const icon = document.getElementById('syncIcon');
      if (icon) icon.textContent = 'check_circle';
      els.btnSync.classList.add('sync-done');
      setTimeout(() => {
        els.btnSync.classList.remove('sync-done');
        if (icon) icon.textContent = 'sync';
      }, 2000);
    }
  }

  function updateNetworkUI() {
    const online = navigator.onLine;
    if (els.statusBar) {
      els.statusBar.classList.remove('online', 'offline');
      els.statusBar.classList.add(online ? 'online' : 'offline');
      els.statusBar.textContent = online ? '✓ Conexión disponible' : '✗ Sin conexión';
    }
  }

  function handleBackNavigation() {
    if (state.navStack.length) {
      const prev = state.navStack.pop();
      showView(prev, { push: false });
      return;
    }
    showView('dashboard', { push: false });
  }

  function handleBackOrMenu() {
    if (isRootView(state.currentView)) {
      toggleDrawer();
      return;
    }
    handleBackNavigation();
  }

  function isRootView(viewName) {
    return ['dashboard', 'programacion', 'historial'].includes(viewName);
  }

  function toggleDrawer() {
    if (state.drawerOpen) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }

  function openDrawer() {
    state.drawerOpen = true;
    els.sideDrawer.classList.add('open');
    els.drawerOverlay.classList.remove('hidden');
    els.sideDrawer.setAttribute('aria-hidden', 'false');
  }

  function closeDrawer() {
    state.drawerOpen = false;
    els.sideDrawer.classList.remove('open');
    els.drawerOverlay.classList.add('hidden');
    els.sideDrawer.setAttribute('aria-hidden', 'true');
  }

  function handleLogout() {
    closeDrawer();
    localStorage.removeItem(SESSION_KEY);
    state.navStack = [];
    loadSession();
    showView('login', { push: false });
  }

  function canAccessView(viewName) {
    if (viewName === 'login') return true;
    return Boolean(getLoggedUser());
  }

  function updateGlobalNavigationState(viewName) {
    const isLogin = viewName === 'login';
    const isDetail = viewName === 'programacion-detail';
    els.footerNav.classList.toggle('hidden', isLogin);
    els.topbar.classList.toggle('hidden', false);
    els.btnBack.classList.toggle('hidden', isLogin);

    els.btnSync.classList.toggle('hidden', isLogin);

    // Show/hide FAB only on detail view
    if (els.btnAddRecordFromDetail) {
      els.btnAddRecordFromDetail.classList.toggle('hidden', !isDetail);
    }

    els.btnBack.textContent = isRootView(viewName) ? '☰' : '←';
  }

  function showView(viewName, options = {}) {
    const { push = true } = options;

    if (!canAccessView(viewName)) {
      viewName = 'login';
      if (state.currentView !== 'login') {
        alert('Debe iniciar sesión para acceder a esa vista.');
      }
    }

    if (state.drawerOpen) {
      closeDrawer();
    }

    if (push && state.currentView && state.currentView !== viewName) {
      const last = state.navStack[state.navStack.length - 1];
      if (last !== state.currentView) {
        state.navStack.push(state.currentView);
      }
    }

    // Guard: warn if navigating away from dirty registro form
    if (state.currentView === 'registro' && viewName !== 'registro' && state.formDirty) {
      if (!window.confirm('¿Descartar el registro en curso? Los datos no guardados se perderán.')) return;
      state.formDirty = false;
      resetRegistroForm();
    }

    document.querySelectorAll('.view').forEach((view) => {
      view.classList.toggle('active', view.dataset.view === viewName);
    });

    document.querySelectorAll('.nav-btn').forEach((button) => {
      button.classList.toggle('active', button.dataset.target === viewName);
    });

    state.currentView = viewName;
    updateGlobalNavigationState(viewName);

    const titleMap = {
      login: 'Control IPERC',
      dashboard: 'Dashboard',
      programacion: 'Nueva Programación',
      historial: 'Historial',
      'programacion-detail': 'Registros',
      registro: 'Registro IPERC',
    };
    els.appTitle.textContent = titleMap[viewName] || 'Control IPERC';

    if (viewName === 'registro') {
      els.fechaHoraOculta.value = new Date().toISOString();
      applyLatestProgramacionToRegistro();
    }

    if (viewName === 'programacion') {
      syncPickerButtons();
      const amStart = state.localConfig.amStart || '07:00';
      const amEnd = state.localConfig.amEnd || '08:00';
      const pmStart = state.localConfig.pmStart || '19:00';
      const pmEnd = state.localConfig.pmEnd || '20:00';
      const inWindow = isInsideProgramacionWindow(new Date());
      const info = document.getElementById('programacionWindowInfo');
      if (info) {
        if (inWindow) {
          info.parentElement.style.background = '#daf4e4';
          info.parentElement.style.borderColor = '#157f41';
          info.parentElement.querySelector('.material-symbols-outlined').textContent = 'check_circle';
          info.parentElement.querySelector('.material-symbols-outlined').style.color = '#157f41';
          info.textContent = `Dentro del horario. Puedes guardar ahora.`;
          info.style.color = '#157f41';
        } else {
          info.parentElement.style.background = '#fff3e0';
          info.parentElement.style.borderColor = '#f57c00';
          info.parentElement.querySelector('.material-symbols-outlined').textContent = 'schedule';
          info.parentElement.querySelector('.material-symbols-outlined').style.color = '#f57c00';
          info.textContent = `Horario: ${amStart}–${amEnd} y ${pmStart}–${pmEnd}`;
          info.style.color = '#f57c00';
        }
      }
    }

    if (viewName === 'historial') {
      renderHistorial();
    }

    if (viewName === 'programacion-detail' && state.latestProgramacion) {
      renderProgramacionDetail(state.latestProgramacion);
    }

    if (isRootView(viewName)) {
      state.navStack = state.navStack.filter((v) => v !== viewName).slice(-8);
    }
  }

  function populateCatalogSelects() {
    const workers = state.personalCache.length ? state.personalCache : state.localConfig.workers;
    state.allWorkers = workers;
    renderTrabajadorDropdown('');
  }

  function renderTrabajadorDropdown(filterText) {
    const workers = state.allWorkers || [];
    const filtered = workers.filter((w) => w.toLowerCase().includes(filterText.toLowerCase()));
    
    els.trabajadorDropdown.innerHTML = '';
    if (filtered.length === 0) {
      const item = document.createElement('li');
      item.className = 'px-4 py-3 text-on-surface-variant text-sm italic';
      item.textContent = 'No hay resultados';
      els.trabajadorDropdown.appendChild(item);
      return;
    }
    
    filtered.forEach((worker) => {
      const li = document.createElement('li');
      li.className = 'px-4 py-3 hover:bg-primary/10 cursor-pointer transition-colors flex items-center gap-3 border-b border-primary/10 last:border-b-0';
      li.innerHTML = `
        <span class="material-symbols-outlined text-primary text-sm">person</span>
        <span class="text-on-surface font-medium text-sm">${worker}</span>
      `;
      li.addEventListener('click', () => {
        els.trabajadorInput.value = worker;
        els.trabajadorDropdown.classList.add('hidden');
      });
      els.trabajadorDropdown.appendChild(li);
    });
  }

  function syncPickerButtons() {
    const guardia = els.guardia.value || 'A';
    const turno = els.turno.value || 'DIA';
    [els.btnGuardiaA, els.btnGuardiaB, els.btnGuardiaC].forEach((b) => b.classList.remove('picker-btn--active'));
    const guardiaMap = { A: els.btnGuardiaA, B: els.btnGuardiaB, C: els.btnGuardiaC };
    if (guardiaMap[guardia]) guardiaMap[guardia].classList.add('picker-btn--active');
    [els.btnTurnoDia, els.btnTurnoNoche].forEach((b) => b.classList.remove('picker-btn--active'));
    const turnoMap = { DIA: els.btnTurnoDia, NOCHE: els.btnTurnoNoche };
    if (turnoMap[turno]) turnoMap[turno].classList.add('picker-btn--active');
  }

  function fillSelect(select, items, placeholder) {
    select.innerHTML = '';

    const first = document.createElement('option');
    first.value = '';
    first.textContent = placeholder;
    first.disabled = true;
    first.selected = true;
    select.appendChild(first);

    items.forEach((item) => {
      const opt = document.createElement('option');
      opt.value = item;
      opt.textContent = item;
      select.appendChild(opt);
    });
  }

  async function refreshUIStats() {
    await Promise.all([
      refreshPendingBadge(),
      refreshProgramacionMetric(),
      renderHistorial(),
    ]);
  }

  async function refreshPendingBadge() {
    const count = await getPendingCount();
    els.syncBadge.textContent = String(count);
    els.syncBadge.classList.toggle('hidden', count === 0);
  }

  async function refreshProgramacionMetric() {
    const latest = await getLatestProgramacion();
    state.latestProgramacion = latest;

    const allProgramaciones = filterDataBySessionAndAge(await getAllProgramaciones(), 'programacion');
    const allRecords = await getAllRecords();
    const recordsByProgram = new Map();
    for (const r of allRecords) {
      const key = String(r.programacionId);
      recordsByProgram.set(key, (recordsByProgram.get(key) || 0) + 1);
    }

    let completo = 0, enProgreso = 0, pendiente = 0;
    for (const item of allProgramaciones) {
      const localCount = recordsByProgram.get(String(item.id)) || 0;
      const realizados = Math.max(localCount, Number(item.realizadosRemoto || 0));
      const status = getProgramacionStatus(item, realizados);
      if (status === 'COMPLETO') completo++;
      else if (status === 'EN PROGRESO') enProgreso++;
      else pendiente++;
    }

    const elCompleto = document.getElementById('metricCompleto');
    const elEnProgreso = document.getElementById('metricEnProgreso');
    const elPendienteStatus = document.getElementById('metricPendienteStatus');
    if (elCompleto) elCompleto.textContent = String(completo);
    if (elEnProgreso) elEnProgreso.textContent = String(enProgreso);
    if (elPendienteStatus) elPendienteStatus.textContent = String(pendiente);
  }

  function getProgramacionStatus(item, realizados) {
    const meta = Number(item.cantidadProgramada || 0);
    if (meta > 0 && realizados >= meta) return 'COMPLETO';
    const progDate = new Date(item.fechaHoraProgramacion);
    const today = new Date();
    const isToday =
      progDate.getFullYear() === today.getFullYear() &&
      progDate.getMonth() === today.getMonth() &&
      progDate.getDate() === today.getDate();
    return isToday ? 'EN PROGRESO' : 'PENDIENTE';
  }

  async function renderHistorial() {
    const searchInput = document.getElementById('historialSearch');
    const query = searchInput ? normalizeStr(searchInput.value) : '';
    const allRecords = filterDataBySessionAndAge(await getAllRecords(), 'registro');
    const allProgramaciones = filterDataBySessionAndAge(await getAllProgramaciones(), 'programacion');

    // Wire search input once
    if (searchInput && !searchInput.dataset.wired) {
      searchInput.dataset.wired = '1';
      searchInput.addEventListener('input', () => renderHistorial());
    }

    els.historialList.innerHTML = '';

    // Filter by search query
    const filtered = query
      ? allProgramaciones.filter((item) => {
          const haystack = [
            item.guardia, item.turno, item.supervisor,
            item.actividadesTurno, item.fechaHoraLocal,
          ].map((v) => normalizeStr(v || '')).join(' ');
          return haystack.includes(query);
        })
      : allProgramaciones;

    if (!filtered.length && !allRecords.length) {
      els.historialList.innerHTML = '<article class="bg-white rounded-xl p-4 border border-slate-100"><p class="text-sm text-slate-500">Sin datos locales todavía.</p></article>';
      return;
    }
    if (!filtered.length) {
      els.historialList.innerHTML = '<article class="bg-white rounded-xl p-4 border border-slate-100"><p class="text-sm text-slate-500">Sin resultados para esa búsqueda.</p></article>';
      return;
    }

    const recordsByProgram = new Map();
    allRecords.forEach((record) => {
      const key = String(record.programacionId || '');
      if (!key) return;
      recordsByProgram.set(key, (recordsByProgram.get(key) || 0) + 1);
    });

    filtered.slice().reverse().forEach((item) => {
      const meta = Number(item.cantidadProgramada || 0);
      const localCount = recordsByProgram.get(String(item.id)) || 0;
      const realizados = Math.max(localCount, Number(item.realizadosRemoto || 0));
      const porcentaje = meta > 0 ? Math.round((realizados / meta) * 100) : 0;
      const statusText = getProgramacionStatus(item, realizados);
      const statusClass = statusText === 'COMPLETO' ? 'ok' : statusText === 'EN PROGRESO' ? 'mid' : 'pending';

      const card = document.createElement('article');
      card.className = 'history-card history-card--clickable';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div>
            <p class="text-[11px] uppercase tracking-widest text-slate-500 font-bold">Guardia ${item.guardia || '-'}</p>
            <strong class="text-slate-800 text-lg">${item.turno || '-'}</strong>
          </div>
          <div class="flex items-center gap-2">
            <span class="history-chip ${statusClass}">${statusText}</span>
            <button class="camera-btn material-symbols-outlined text-primary hover:text-primary/80 transition-colors" style="font-size:20px" data-programacion-id="${item.id}">add_a_photo</button>
          </div>
        </div>
        <div class="flex items-center gap-2 text-slate-600 text-xs font-semibold">
          <span class="material-symbols-outlined" style="font-size:16px">calendar_today</span>
          <span>${new Date(item.fechaHoraProgramacion).toLocaleString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
        </div>
        <div class="history-stats">
          <div class="history-stat">
            <p class="history-stat-label">Meta IPERC</p>
            <p class="history-stat-value">${meta}</p>
          </div>
          <div class="history-stat">
            <p class="history-stat-label">Realizados</p>
            <p class="history-stat-value">${realizados}</p>
          </div>
          <div class="history-stat">
            <p class="history-stat-label">% Cumpl.</p>
            <p class="history-stat-value">${porcentaje}%</p>
          </div>
        </div>
        <p class="text-xs text-slate-600">Supervisor: ${item.supervisor || '-'}</p>
        <p class="text-sm text-slate-700">${item.actividadesTurno || 'Sin actividades'}</p>
        <div class="flex items-end justify-between gap-2">
          <p class="text-[11px] text-primary font-bold flex items-center gap-1"><span class="material-symbols-outlined" style="font-size:13px">touch_app</span>Toca para ver detalle</p>
          <p class="text-[10px] text-slate-400 italic">#${item.id}</p>
        </div>
      `;
      card.addEventListener('click', (e) => {
        // Don't trigger if clicking on camera button
        if (e.target.classList.contains('camera-btn')) return;
        state.latestProgramacion = item;
        renderProgramacionDetail(item);
        showView('programacion-detail');
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
      });

      // Camera button click handler
      const cameraBtn = card.querySelector('.camera-btn');
      cameraBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const meta = Number(item.cantidadProgramada || 0);
        if (meta > 0) {
          const allRecords = await getAllRecords();
          const realizados = allRecords.filter(r => r.programacionId === item.id).length;
          if (realizados >= meta) {
            showToast(`Meta alcanzada (${realizados}/${meta}). No puedes agregar más registros.`, 'error', 4000);
            return;
          }
        }
        state.latestProgramacion = item;
        applyLatestProgramacionToRegistro();
        showView('registro');
      });
      els.historialList.appendChild(card);
    });
  }

  async function renderProgramacionDetail(programacion) {
    // Update header badges
    els.detailGuardiaBadge.textContent = `GUARDIA ${programacion.guardia}`;
    els.detailTurnoBadge.textContent = `TURNO: ${programacion.turno}`;

    const detailFechaLocal = document.getElementById('detailFechaLocal');
    if (detailFechaLocal) detailFechaLocal.textContent = programacion.fechaHoraLocal || '';

    // Update meta values
    const meta = Number(programacion.cantidadProgramada || 0);
    els.detailMetaValue.textContent = meta;
    els.detailMetaDisplay.textContent = meta;

    // Get records for this programacion — local first, then remote fallback
    const allRecords = await getAllRecords();
    let programacionRecords = allRecords.filter(r => r.programacionId === programacion.id);

    // If local count is less than server count, fetch from Sheets to fill the gap
    if (programacionRecords.length < Number(programacion.realizadosRemoto || 0)
        && navigator.onLine && state.localConfig.webhookUrl) {
      try {
        const remoteRecords = await fetchRegistrosFromServer(programacion.id);
        // Save them locally as SYNCED so future opens are instant
        for (const r of remoteRecords) await saveRecord(r);
        programacionRecords = remoteRecords;
      } catch (err) {
        console.error('fetchRegistrosFromServer:', err);
      }
    }

    const localRealizados = programacionRecords.length;
    const realizados = Math.max(localRealizados, Number(programacion.realizadosRemoto || 0));
    const progreso = meta > 0 ? Math.round((realizados / meta) * 100) : 0;

    els.detailRealizados.textContent = String(realizados).padStart(2, '0');
    els.detailProgreso.textContent = `${progreso}%`;

    // Update horario
    const turno = programacion.turno;
    const horario = turno === 'DIA'
      ? `${state.localConfig.amStart || '07:00'} - ${state.localConfig.amEnd || '08:00'}`
      : `${state.localConfig.pmStart || '19:00'} - ${state.localConfig.pmEnd || '20:00'}`;
    els.detailHorario.textContent = horario;

    // Render records list
    els.detailRecordsList.innerHTML = '';
    if (programacionRecords.length === 0) {
      els.detailRecordsList.innerHTML = `
        <div class="text-center py-8">
          <span class="material-symbols-outlined text-4xl mb-2 block text-[#75777f]">description</span>
          <p class="text-sm text-[#44464e]">No hay registros para este bloque</p>
          <p class="text-xs text-[#75777f] mt-1">Toque + para agregar un registro</p>
        </div>
      `;
    } else {
      programacionRecords.forEach((record) => {
        const card = document.createElement('div');
        card.className = 'bg-white p-4 rounded-lg flex items-center justify-between border-l-4 border-[#12254c] shadow-sm';
        card.innerHTML = `
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-lg bg-[#f3f3f3] flex items-center justify-center">
              <span class="material-symbols-outlined text-[#12254c]">description</span>
            </div>
            <div>
              <p class="text-sm font-bold text-[#1a1c1c]">${record.trabajador || 'Sin asignar'}</p>
              <p class="text-[11px] text-[#44464e]">${record.fechaHoraLocal || ''} • ${record.actividad || 'Sin actividad'}</p>
            </div>
          </div>
          <span class="material-symbols-outlined text-[#5e6476]" style="font-variation-settings: 'FILL' 1;">check_circle</span>
        `;
        els.detailRecordsList.appendChild(card);
      });
    }
  }

  async function fetchRegistrosFromServer(programacionId) {
    const query = new URLSearchParams({
      action: 'registros',
      sheetId: state.localConfig.sheetId || '',
      registrosTab: state.localConfig.registrosTab || 'DATA_REGISTROS',
      programacionId,
    });
    const url = `${state.localConfig.webhookUrl}${state.localConfig.webhookUrl.includes('?') ? '&' : '?'}${query.toString()}`;
    const response = await fetchWithTimeout(url, { method: 'GET' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || 'Error al leer registros');
    return data.registros || [];
  }

  async function incrementMeta() {
    if (!state.latestProgramacion) return;

    const currentMeta = Number(state.latestProgramacion.cantidadProgramada || 0);
    const newMeta = currentMeta + 1;

    // Update the programacion in database — mark as PENDING so the change syncs to Sheets
    const updatedProgramacion = { ...state.latestProgramacion, cantidadProgramada: newMeta, syncStatus: 'PENDING' };
    await saveProgramacion(updatedProgramacion);
    state.latestProgramacion = updatedProgramacion;

    // Update UI
    renderProgramacionDetail(updatedProgramacion);
    await refreshUIStats();
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_CONFIG.name, DB_CONFIG.version);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains(DB_CONFIG.recordsStore)) {
          const store = db.createObjectStore(DB_CONFIG.recordsStore, { keyPath: 'id' });
          store.createIndex('estado', 'estado', { unique: false });
          store.createIndex('createdAtEpoch', 'createdAtEpoch', { unique: false });
        }

        if (!db.objectStoreNames.contains(DB_CONFIG.programacionesStore)) {
          const store = db.createObjectStore(DB_CONFIG.programacionesStore, { keyPath: 'id' });
          store.createIndex('fechaHoraProgramacion', 'fechaHoraProgramacion', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function store(name, mode = 'readonly') {
    return state.db.transaction(name, mode).objectStore(name);
  }

  function saveRecord(record) {
    return new Promise((resolve, reject) => {
      const request = store(DB_CONFIG.recordsStore, 'readwrite').put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  function saveProgramacion(programacion) {
    return new Promise((resolve, reject) => {
      const request = store(DB_CONFIG.programacionesStore, 'readwrite').put(programacion);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  function getAllRecords() {
    return new Promise((resolve, reject) => {
      const request = store(DB_CONFIG.recordsStore).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  function getAllProgramaciones() {
    return new Promise((resolve, reject) => {
      const request = store(DB_CONFIG.programacionesStore).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async function getLatestProgramacion() {
    const all = filterDataBySessionAndAge(await getAllProgramaciones(), 'programacion');
    if (!all.length) return null;
    return all.sort((a, b) => new Date(b.fechaHoraProgramacion) - new Date(a.fechaHoraProgramacion))[0];
  }

  async function getPendingRecords() {
    const all = filterDataBySessionAndAge(await getAllRecords(), 'registro', { includePendingOnly: true, ignoreAge: true });
    return all.filter((item) => item.estado === 'PENDING' && item.syncStatus !== 'SYNCED');
  }

  async function getPendingProgramaciones() {
    const all = filterDataBySessionAndAge(await getAllProgramaciones(), 'programacion', { includePendingOnly: true, ignoreAge: true });
    return all.filter((item) => item.syncStatus !== 'SYNCED');
  }

  async function getPendingCount() {
    const [pendingReg, pendingProg] = await Promise.all([
      getPendingRecords(),
      getPendingProgramaciones(),
    ]);
    return pendingReg.length + pendingProg.length;
  }

  async function markProgramacionSynced(localId, syncedProgramaId) {
    const all = await getAllProgramaciones();
    const found = all.find((item) => item.id === localId);
    if (!found) return;

    found.syncStatus = 'SYNCED';
    found.syncedAt = new Date().toISOString();
    found.syncedProgramaId = syncedProgramaId || localId;
    await saveProgramacion(found);
  }

  function deleteRecord(id) {
    return new Promise((resolve, reject) => {
      const request = store(DB_CONFIG.recordsStore, 'readwrite').delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async function generateShortId(storeName, length = 7) {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const maxAttempts = 80;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const candidate = buildRandomId(alphabet, length);
      if (!hasLetterAndNumber(candidate)) continue;

      const exists = await recordExists(storeName, candidate);
      if (!exists) {
        return candidate;
      }
    }

    throw new Error(`No se pudo generar un ID unico de ${length} caracteres para ${storeName}`);
  }

  function buildRandomId(alphabet, length) {
    const bytes = new Uint8Array(length);
    if (window.crypto && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < length; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }

    let output = '';
    for (let i = 0; i < length; i += 1) {
      output += alphabet[bytes[i] % alphabet.length];
    }
    return output;
  }

  function hasLetterAndNumber(value) {
    return /[a-z]/.test(value) && /[0-9]/.test(value);
  }

  function recordExists(storeName, id) {
    return new Promise((resolve, reject) => {
      const request = store(storeName).get(id);
      request.onsuccess = () => resolve(Boolean(request.result));
      request.onerror = () => reject(request.error);
    });
  }

  function formatDateTime(dateObj) {
    return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(dateObj);
  }

  async function refreshProgramacionesIfPossible({ silent = true } = {}) {
    if (!state.localConfig.webhookUrl || !navigator.onLine) return;
    try {
      const remoteProgramaciones = await fetchProgramacionesFromServer();
      if (!Array.isArray(remoteProgramaciones) || !remoteProgramaciones.length) return;

      const session = getLoggedUser();
      const supervisorName = normalizeStr(session?.displayName || '');
      const existing = await getAllProgramaciones();
      // Index local records by their server-side id to detect duplicates
      const existingByServerId = new Map();
      const existingById = new Map();
      existing.forEach((p) => {
        existingById.set(p.id, p);
        if (p.syncedProgramaId) existingByServerId.set(p.syncedProgramaId, p);
      });

      let imported = 0;
      for (const remote of remoteProgramaciones) {
        const serverId = String(remote.programaId || remote.id || '').trim();
        if (!serverId) continue;

        // Filter to current supervisor only (accent+case insensitive)
        const remoteSupervisor = normalizeStr(remote.supervisor || '');
        if (supervisorName && remoteSupervisor !== supervisorName) continue;

        // Skip if already in local DB (matched by server id or local id) — but UPDATE meta/count
        const existingLocal = existingByServerId.get(serverId) || existingById.get(serverId);
        if (existingLocal) {
          // Merge all server fields into local record, but preserve syncStatus/pending state
          const merged = {
            ...existingLocal,
            fechaHoraProgramacion: remote.fechaHoraProgramacion || existingLocal.fechaHoraProgramacion,
            fechaHoraLocal:        remote.fechaHoraLocal || existingLocal.fechaHoraLocal,
            supervisor:            remote.supervisor || existingLocal.supervisor,
            guardia:               remote.guardia || existingLocal.guardia,
            turno:                 remote.turno || existingLocal.turno,
            cantidadProgramada:    remote.cantidadProgramada,
            actividadesTurno:      remote.actividadesTurno || existingLocal.actividadesTurno,
            estado:                remote.estado || existingLocal.estado,
            realizadosRemoto:      remote.realizadosRemoto || 0,
          };
          await saveProgramacion(merged);
          imported++;
          continue;
        }

        // Build local record from remote data
        const localRecord = {
          id: serverId,
          programacionId: serverId,
          syncedProgramaId: serverId,
          fechaHoraProgramacion: remote.fechaHoraProgramacion || new Date().toISOString(),
          fechaHoraLocal: remote.fechaHoraLocal || '',
          supervisor: remote.supervisor || '',
          guardia: remote.guardia || '',
          turno: remote.turno || '',
          cantidadProgramada: Number(remote.cantidadProgramada || 0),
          actividadesTurno: remote.actividadesTurno || '',
          estado: remote.estado || 'PROGRAMADO',
          realizadosRemoto: remote.realizadosRemoto || 0,
          syncStatus: 'SYNCED',
          syncedAt: new Date().toISOString(),
        };
        await saveProgramacion(localRecord);
        imported++;
      }

      // Always refresh UI after pull so historial reflects latest server data
      await refreshUIStats();
      if (imported > 0 && !silent) {
        showToast(`${imported} programación(es) actualizada(s) desde Sheets.`, 'success', 3000);
      }
    } catch (err) {
      console.error('refreshProgramacionesIfPossible:', err);
    }
  }

  async function fetchProgramacionesFromServer() {
    const query = new URLSearchParams({
      action: 'programaciones',
      sheetId: state.localConfig.sheetId || '',
      programTab: state.localConfig.programTab || 'DATA_PROGRAMA',
      registrosTab: state.localConfig.registrosTab || 'DATA_REGISTROS',
    });
    const url = `${state.localConfig.webhookUrl}${state.localConfig.webhookUrl.includes('?') ? '&' : '?'}${query.toString()}`;
    const response = await fetchWithTimeout(url, { method: 'GET' });
    if (!response.ok) throw new Error(`HTTP ${response.status} al cargar programaciones`);
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || 'Error al leer programaciones');
    return data.programaciones || [];
  }

  async function refreshUsersIfPossible(options = {}) {
    const { silent = true, forceOnline = false } = options;

    if (!state.localConfig.webhookUrl) {
      if (!silent) alert('Configure Webhook URL para cargar usuarios.');
      updateUsersDataInfo();
      return;
    }

    if (!navigator.onLine && forceOnline) {
      if (!silent) alert('Sin conexión para cargar usuarios.');
      updateUsersDataInfo();
      return;
    }

    if (!navigator.onLine) {
      updateUsersDataInfo();
      return;
    }

    try {
      const users = await fetchUsersFromServer();
      if (Array.isArray(users)) {
        setUsersCache(users);
        state.usersCache = users;
        updateUsersDataInfo();
        ensureSessionStillActive();
        if (!silent) alert(`Usuarios cargados: ${users.length}`);
      }
    } catch (error) {
      console.error(error);
      if (!silent) alert('No se pudo cargar usuarios del Sheets.');
    }
  }

  async function refreshPersonalIfPossible(options = {}) {
    const { silent = true } = options;

    if (!state.localConfig.webhookUrl || !navigator.onLine) {
      populateCatalogSelects();
      return;
    }

    try {
      const people = await fetchPersonalFromServer();
      if (Array.isArray(people) && people.length) {
        setPersonalCache(people);
        state.personalCache = people;
        populateCatalogSelects();
      }
    } catch (error) {
      console.error(error);
      if (!silent) alert('No se pudo cargar PERSONAL desde Sheets.');
    }
  }

  async function primeMasterDataForFirstUse() {
    const needsUsers = !state.usersCache.length;
    const needsPersonal = !state.personalCache.length;

    if (!needsUsers && !needsPersonal) {
      return;
    }

    if (!navigator.onLine || !state.localConfig.webhookUrl) {
      return;
    }

    await refreshUsersIfPossible({ silent: true, forceOnline: true });
    await refreshPersonalIfPossible({ silent: true });
  }

  function filterDataBySessionAndAge(items, type, options = {}) {
    const { ignoreAge = false } = options;
    const session = getLoggedUser();
    const supervisorName = normalizeStr(session?.displayName || '');
    const retentionDays = Math.max(1, Number(state.localConfig.retentionDays || 14));
    const limitDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    return (items || []).filter((item) => {
      const itemSupervisor = normalizeStr(item.supervisor || '');
      if (supervisorName) {
        if (!itemSupervisor) {
          return false;
        }
        if (itemSupervisor !== supervisorName) {
          return false;
        }
      }

      if (ignoreAge) {
        return true;
      }

      const rawDate = type === 'programacion' ? item.fechaHoraProgramacion : item.createdAt;
      const parsed = rawDate ? new Date(rawDate) : null;
      if (!parsed || Number.isNaN(parsed.getTime())) {
        return true;
      }

      return parsed >= limitDate;
    });
  }

  async function fetchPersonalFromServer() {
    const query = new URLSearchParams({
      action: 'personal',
      sheetId: state.localConfig.sheetId || '',
      personalTab: state.localConfig.personalTab || 'PERSONAL',
    });

    const url = `${state.localConfig.webhookUrl}${state.localConfig.webhookUrl.includes('?') ? '&' : '?'}${query.toString()}`;
    const response = await fetchWithTimeout(url, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} al cargar personal`);
    }
    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.error || 'Error al leer personal');
    }
    return (data.personal || []).map((name) => String(name || '').trim()).filter(Boolean);
  }

  function setPersonalCache(personal) {
    localStorage.setItem(PERSONAL_CACHE_KEY, JSON.stringify({
      updatedAt: new Date().toISOString(),
      personal,
    }));
  }

  function getPersonalCache() {
    try {
      const raw = localStorage.getItem(PERSONAL_CACHE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.personal) ? parsed.personal : [];
    } catch {
      return [];
    }
  }

  async function fetchUsersFromServer() {
    const query = new URLSearchParams({
      action: 'usuarios',
      sheetId: state.localConfig.sheetId || '',
      usersTab: state.localConfig.usersTab || 'USUARIOS',
    });

    const url = `${state.localConfig.webhookUrl}${state.localConfig.webhookUrl.includes('?') ? '&' : '?'}${query.toString()}`;
    const response = await fetchWithTimeout(url, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} al cargar usuarios`);
    }
    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.error || 'Error al leer usuarios');
    }
    return data.users || [];
  }

  function setUsersCache(users) {
    localStorage.setItem(USERS_CACHE_KEY, JSON.stringify({
      updatedAt: new Date().toISOString(),
      users,
    }));
  }

  function getUsersCache() {
    try {
      const raw = localStorage.getItem(USERS_CACHE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.users) ? parsed.users : [];
    } catch {
      return [];
    }
  }

  function updateUsersDataInfo() {
    try {
      const raw = localStorage.getItem(USERS_CACHE_KEY);
      if (!raw) {
        els.usersDataInfo.textContent = 'Usuarios sin cargar.';
        return;
      }
      const parsed = JSON.parse(raw);
      const count = Array.isArray(parsed.users) ? parsed.users.length : 0;
      const updated = parsed.updatedAt ? new Date(parsed.updatedAt).toLocaleString() : 's/f';
      els.usersDataInfo.textContent = `Usuarios activos cargados: ${count} (act: ${updated})`;
    } catch {
      els.usersDataInfo.textContent = 'Usuarios sin cargar.';
    }
  }

  function ensureSessionStillActive() {
    const session = getLoggedUser();
    if (!session || !session.dni) return true;
    if (!Array.isArray(state.usersCache) || state.usersCache.length === 0) return true;

    const current = state.usersCache.find((user) => String(user.dni) === String(session.dni));
    if (!current || current.estado !== 'ACTIVO') {
      localStorage.removeItem(SESSION_KEY);
      loadSession();
      showView('login', { push: false });
      alert('Su usuario cambió a INACTIVO. Debe volver a iniciar sesión.');
      return false;
    }

    return true;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function compressImage(file, maxWidth, quality, targetKB) {
    const bitmap = await createImageBitmap(file);
    const ratio = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
    const width = Math.round(bitmap.width * ratio);
    const height = Math.round(bitmap.height * ratio);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.drawImage(bitmap, 0, 0, width, height);

    let q = quality;
    let dataUrl = canvas.toDataURL('image/jpeg', q);
    let sizeKB = Math.round((dataUrl.length * 0.75) / 1024);

    while (sizeKB > targetKB && q > 0.2) {
      q = Math.max(0.2, q - 0.1);
      dataUrl = canvas.toDataURL('image/jpeg', q);
      sizeKB = Math.round((dataUrl.length * 0.75) / 1024);
    }

    return {
      dataUrl,
      width,
      height,
      quality: Number(q.toFixed(2)),
      sizeKB,
    };
  }
})();

