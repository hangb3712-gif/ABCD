/* ═══════════════════════════════════════════════════════════════════════════
   DATAMIND AI AGENT — FRONTEND LOGIC & AUTHENTICATION CONTROLLER
   Tuân thủ nghiêm ngặt bảng màu Pastel:
   #cdb4db | #ffc8dd | #ffafcc | #bde0fe | #a2d2ff
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── TIỆN ÍCH ĐỊNH DẠNG SỐ & CHUỖI ── */
const fmt = n => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));
const fmtDec = n => (n === null || n === undefined || isNaN(n)) ? '0' : (Math.abs(n) >= 100 ? fmt(n) : Number(n).toFixed(2));
const fmtS = n => {
  const a = Math.abs(n || 0);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + ' tỷ';
  if (a >= 1e6) return (n / 1e6).toFixed(2) + ' tr';
  if (a >= 1e3) return fmt(n);
  return fmtDec(n);
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = id => document.getElementById(id);

/* 5 MÃ MÀU PASTEL THƯƠNG HIỆU */
const PALETTE = [
  { hex: '#ffafcc', bg: '#ffc8dd', text: '#2b1d38' },
  { hex: '#a2d2ff', bg: '#bde0fe', text: '#16324f' },
  { hex: '#cdb4db', bg: '#f3e5f8', text: '#2b1d38' },
  { hex: '#ffc8dd', bg: '#fff0f6', text: '#591632' },
  { hex: '#bde0fe', bg: '#e6f4ff', text: '#16324f' }
];
const colStyle = idx => PALETTE[idx % PALETTE.length];

/* ── TRẠNG THÁI PHIÊN PHÂN TÍCH (ANALYSIS STATE) ── */
let currentSessionId = null;
let currentDatasetName = '';
let initialProfileData = null;
let cleaningRules = [];
let appliedRulesSnapshot = '';
let lastCleaningReport = null;
let currentCustomInstruction = '';
let manualCellEdits = [];
let analysisData = null;
let currentHtmlReport = '';
let isLiveEditEnabled = false;
let charts = [];

/* ── TRẠNG THÁI NGƯỜI DÙNG & XÁC THỰC (AUTH STATE) ── */
let currentUser = null;

/* ═══════════════════════════════════════════════════════════════════════════
   TOAST NOTIFICATION SYSTEM (THAY THẾ TOÀN BỘ ALERT TRÌNH DUYỆT)
   ═══════════════════════════════════════════════════════════════════════════ */
function showToast(title, msg, type = 'info', duration = 4000) {
  const container = $('toastContainer');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '⚠' : 'ℹ';
  t.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-content">
      <div class="toast-title">${esc(title)}</div>
      <div class="toast-msg">${esc(msg)}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;
  container.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'toastOut 0.25s forwards';
    setTimeout(() => t.remove(), 250);
  }, duration);
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODAL SCROLL LOCK & ACCESSIBILITY MANAGEMENT
   ═══════════════════════════════════════════════════════════════════════════ */
let activeModals = new Set();
let lockedScrollY = 0;

function showModal(modalId) {
  const modal = $(modalId);
  if (!modal) return;
  if (activeModals.size === 0) {
    lockedScrollY = window.pageYOffset || document.documentElement.scrollTop;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${lockedScrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflowY = 'scroll';
  }
  activeModals.add(modalId);
  modal.classList.add('show');

  // Auto focus first accessible input
  setTimeout(() => {
    const firstInput = modal.querySelector('input:not([type=hidden]), button:not(.modal-close-btn)');
    if (firstInput) firstInput.focus();
  }, 80);
}

function hideModal(modalId) {
  const modal = $(modalId);
  if (!modal) return;
  modal.classList.remove('show');
  activeModals.delete(modalId);
  if (activeModals.size === 0) {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    document.body.style.overflowY = '';
    window.scrollTo(0, lockedScrollY);
  }
}

// Bắt phím Escape để đóng modal đang mở
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && activeModals.size > 0) {
    const topModal = Array.from(activeModals).pop();
    if (topModal === 'authModal') closeAuthModal();
    else if (topModal === 'forgotModal') closeForgotModal();
    else if (topModal === 'changePasswordModal') closeChangePasswordModal();
    else if (topModal === 'accountModal') closeAccountModal();
    else if (topModal === 'guideModal') closeGuideModal();
  }
});

// Click ra ngoài backdrop để đóng modal
document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      if (backdrop.id === 'authModal') closeAuthModal();
      else if (backdrop.id === 'forgotModal') closeForgotModal();
      else if (backdrop.id === 'changePasswordModal') closeChangePasswordModal();
      else if (backdrop.id === 'accountModal') closeAccountModal();
      else if (backdrop.id === 'guideModal') closeGuideModal();
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   SLIDING ACTIVE NAVIGATION INDICATOR (NỀN HỒNG TRƯỢT THEO MỤC ĐIỀU HƯỚNG)
   ═══════════════════════════════════════════════════════════════════════════ */
let currentNavSection = 'heroBanner';

function positionNavIndicator(targetLink) {
  const indicator = $('navActivePill');
  const container = $('navCenter');
  if (!indicator || !container || !targetLink) return;

  const containerRect = container.getBoundingClientRect();
  const linkRect = targetLink.getBoundingClientRect();

  const left = linkRect.left - containerRect.left;
  const width = linkRect.width;

  indicator.style.transform = `translateX(${left}px)`;
  indicator.style.width = `${width}px`;
  indicator.style.opacity = '1';
}

function setActiveNav(navKey) {
  const links = document.querySelectorAll('.nav-link[data-nav]');
  let targetLink = null;
  links.forEach(l => {
    if (l.dataset.nav === navKey) {
      l.classList.add('active');
      targetLink = l;
    } else {
      l.classList.remove('active');
    }
  });
  if (targetLink) {
    currentNavSection = navKey;
    positionNavIndicator(targetLink);
  }
}

function initNavigation() {
  const links = document.querySelectorAll('.nav-link[data-nav]');
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      const navKey = link.dataset.nav;
      if (navKey === 'report') {
        e.preventDefault();
        if (maxStage >= 5) {
          showStage(5);
          setActiveNav('report');
          const el = $('p5');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          showToast('Chưa mở Báo cáo', 'Vui lòng hoàn thành 4 chặng trước để mở Báo cáo & Dashboard.', 'info');
        }
        return;
      }
      if (navKey === 'guide') {
        // Hướng dẫn mở modal, không thay đổi active section anchor
        return;
      }
      setActiveNav(navKey);
    });
  });

  // Căn chỉnh lại vị trí pill khi đổi kích thước cửa sổ
  window.addEventListener('resize', () => {
    const active = document.querySelector('.nav-link.active[data-nav]');
    if (active) positionNavIndicator(active);
  });

  // IntersectionObserver theo dõi vùng cuộn để trượt pill chính xác
  const sectionIds = ['heroBanner', 'featuresSection', 'stepper', 'p5'];
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        if (id === 'heroBanner') setActiveNav('heroBanner');
        else if (id === 'featuresSection') setActiveNav('featuresSection');
        else if (id === 'stepper') {
          if (curStage < 5) setActiveNav('pipeline');
          else setActiveNav('report');
        } else if (id === 'p5' && curStage === 5) {
          setActiveNav('report');
        }
      }
    });
  }, { threshold: 0.25 });

  sectionIds.forEach(id => {
    const el = $(id);
    if (el) observer.observe(el);
  });

  // Vị trí khởi tạo ban đầu
  setTimeout(() => {
    const initialLink = document.querySelector('.nav-link.active[data-nav]') || links[0];
    if (initialLink) positionNavIndicator(initialLink);
  }, 120);
}

/* ═══════════════════════════════════════════════════════════════════════════
   TRẠNG THÁI "SẴN SÀNG" MÀU XANH NỔI BẬT Ở HERO ORBIT
   ═══════════════════════════════════════════════════════════════════════════ */
function updateSystemStatus(state) {
  const textEl = $('orbitStatusText');
  const pillEl = $('orbitStatusPill');
  if (!textEl || !pillEl) return;

  if (state === 'processing') {
    textEl.textContent = 'ĐANG PHÂN TÍCH...';
    pillEl.style.background = '#eaf4ff';
    pillEl.style.borderColor = '#bde0fe';
    pillEl.style.color = '#1b5a96';
  } else if (state === 'complete') {
    textEl.textContent = 'ĐÃ HOÀN TẤT';
    pillEl.style.background = '#fef0f7';
    pillEl.style.borderColor = '#ffc8dd';
    pillEl.style.color = '#9e3b68';
  } else {
    textEl.textContent = 'SẴN SÀNG';
    pillEl.style.background = '#e8f8ef';
    pillEl.style.borderColor = '#a9e4c3';
    pillEl.style.color = '#16845b';
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCROLL REVEAL MOTION DESIGN (HIỆU ỨNG XUẤT HIỆN KHI CUỘN)
   ═══════════════════════════════════════════════════════════════════════════ */
function initScrollReveal() {
  const elements = document.querySelectorAll('.reveal-on-scroll');
  if (!elements.length) return;
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('revealed');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  elements.forEach(el => obs.observe(el));
}

/* ═══════════════════════════════════════════════════════════════════════════
   HỆ THỐNG XÁC THỰC NGƯỜI DÙNG (AUTHENTICATION CLIENT)
   ═══════════════════════════════════════════════════════════════════════════ */
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.ok && data.user) {
      setAuthenticatedUser(data.user);
    } else {
      setGuestUser();
    }
  } catch (err) {
    setGuestUser();
  }
}

function setAuthenticatedUser(user) {
  currentUser = user;
  const guestGroup = $('guestAuthGroup');
  const userWrapper = $('userMenuWrapper');
  if (guestGroup) guestGroup.style.display = 'none';
  if (userWrapper) userWrapper.style.display = 'block';

  const initials = (user.full_name || user.username || 'US').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  if ($('headerAvatar')) $('headerAvatar').textContent = initials;
  if ($('headerUserName')) $('headerUserName').textContent = user.full_name || user.username;
  if ($('dropdownUserName')) $('dropdownUserName').textContent = user.full_name || user.username;
  if ($('dropdownUserEmail')) $('dropdownUserEmail').textContent = user.email || '';
}

function setGuestUser() {
  currentUser = null;
  const guestGroup = $('guestAuthGroup');
  const userWrapper = $('userMenuWrapper');
  if (guestGroup) guestGroup.style.display = 'flex';
  if (userWrapper) userWrapper.style.display = 'none';
  const dropdown = $('userDropdown');
  if (dropdown) dropdown.classList.remove('show');
}

function toggleUserDropdown(e) {
  if (e) e.stopPropagation();
  const dropdown = $('userDropdown');
  if (dropdown) dropdown.classList.toggle('show');
}

document.addEventListener('click', () => {
  const dropdown = $('userDropdown');
  if (dropdown) dropdown.classList.remove('show');
});

/* Mở / Đóng Modal Xác thực (Centred Floating Glassmorphism) */
function openAuthModal(tab = 'login') {
  showModal('authModal');
  switchAuthTab(tab);
  clearAuthErrors();
}

function closeAuthModal() {
  hideModal('authModal');
  clearAuthErrors();
}

function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  $('tabLoginBtn').classList.toggle('active', isLogin);
  $('tabRegisterBtn').classList.toggle('active', !isLogin);
  $('tabLoginBtn').setAttribute('aria-selected', isLogin ? 'true' : 'false');
  $('tabRegisterBtn').setAttribute('aria-selected', isLogin ? 'false' : 'true');
  $('loginForm').style.display = isLogin ? 'block' : 'none';
  $('registerForm').style.display = isLogin ? 'none' : 'block';
  $('authModalTitle').textContent = isLogin ? 'Đăng nhập vào DataMind AI' : 'Tạo tài khoản DataMind AI';
  clearAuthErrors();

  // Reset thanh cuộn bên trong modal về đầu form khi chuyển tab
  const scrollContainer = $('authFormScrollable');
  if (scrollContainer) scrollContainer.scrollTop = 0;

  // Tự động focus ô đầu tiên
  const firstInput = isLogin ? $('loginEmail') : $('regFullName');
  if (firstInput) setTimeout(() => firstInput.focus(), 60);
}

function clearAuthErrors() {
  if ($('loginErrorMsg')) { $('loginErrorMsg').textContent = ''; $('loginErrorMsg').style.display = 'none'; }
  if ($('regErrorMsg')) { $('regErrorMsg').textContent = ''; $('regErrorMsg').style.display = 'none'; }
}

function togglePasswordVisibility(inputId, btnEl) {
  const inp = $(inputId);
  if (!inp) return;
  if (inp.type === 'password') {
    inp.type = 'text';
    btnEl.textContent = '🔒';
    btnEl.title = 'Ẩn mật khẩu';
  } else {
    inp.type = 'password';
    btnEl.textContent = '👁';
    btnEl.title = 'Hiện mật khẩu';
  }
}

function checkRegPasswordStrength(pwd) {
  const meter = $('regPwdMeter');
  const fill = $('regPwdMeterFill');
  const hint = $('regPwdHintText');
  const scoreTxt = $('regPwdScoreText');
  if (!meter || !fill) return;

  if (!pwd) {
    meter.style.display = 'none';
    hint.textContent = 'Độ mạnh mật khẩu';
    scoreTxt.textContent = '';
    return;
  }

  meter.style.display = 'block';
  let score = 0;
  if (pwd.length >= 8) score += 25;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score += 25;
  if (/\d/.test(pwd)) score += 25;
  if (/[^a-zA-Z0-9]/.test(pwd)) score += 25;

  fill.style.width = score + '%';
  if (score <= 25) {
    fill.style.background = 'var(--danger)';
    hint.textContent = 'Rất yếu (Thêm chữ hoa & số)';
    scoreTxt.textContent = '1/4';
  } else if (score <= 50) {
    fill.style.background = '#e69500';
    hint.textContent = 'Trung bình (Nên thêm ký tự đặc biệt)';
    scoreTxt.textContent = '2/4';
  } else if (score <= 75) {
    fill.style.background = 'var(--sky-blue)';
    hint.textContent = 'Khá mạnh';
    scoreTxt.textContent = '3/4';
  } else {
    fill.style.background = '#2b72a8';
    hint.textContent = 'Tuyệt vời (Rất bảo mật)';
    scoreTxt.textContent = '4/4';
  }
}

/* Xử lý Đăng nhập */
async function handleLogin(e) {
  e.preventDefault();
  const emailOrUser = $('loginEmail').value.trim();
  const password = $('loginPassword').value;
  const remember = $('loginRemember').checked;
  const btn = $('btnLoginSubmit');
  const errBox = $('loginErrorMsg');

  errBox.style.display = 'none';
  busy(btn, true, 'Đang đăng nhập...');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_or_username: emailOrUser, password, remember_me: remember })
    });
    const data = await res.json();
    busy(btn, false);

    if (data.ok && data.user) {
      setAuthenticatedUser(data.user);
      closeAuthModal();
      showToast('Đăng nhập thành công', `Chào mừng ${data.user.full_name || data.user.username} quay trở lại!`, 'success');
    } else {
      errBox.textContent = data.error || 'Đăng nhập không thành công';
      errBox.style.display = 'block';
    }
  } catch (err) {
    busy(btn, false);
    errBox.textContent = 'Lỗi kết nối máy chủ: ' + err.message;
    errBox.style.display = 'block';
  }
}

/* Xử lý Đăng ký */
async function handleRegister(e) {
  e.preventDefault();
  const fullName = $('regFullName').value.trim();
  const username = $('regUsername').value.trim();
  const email = $('regEmail').value.trim();
  const password = $('regPassword').value;
  const confirmPwd = $('regPasswordConfirm').value;
  const btn = $('btnRegSubmit');
  const errBox = $('regErrorMsg');

  errBox.style.display = 'none';

  if (password !== confirmPwd) {
    errBox.textContent = 'Mật khẩu nhập lại không khớp!';
    errBox.style.display = 'block';
    return;
  }

  busy(btn, true, 'Đang khởi tạo tài khoản...');

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: fullName, username, email, password, confirm_password: confirmPwd })
    });
    const data = await res.json();
    busy(btn, false);

    if (data.ok && data.user) {
      setAuthenticatedUser(data.user);
      closeAuthModal();
      showToast('Đăng ký thành công', `Chúc mừng ${data.user.full_name}, tài khoản của bạn đã được kích hoạt!`, 'success');
    } else {
      errBox.textContent = data.error || 'Đăng ký không thành công';
      errBox.style.display = 'block';
    }
  } catch (err) {
    busy(btn, false);
    errBox.textContent = 'Lỗi kết nối máy chủ: ' + err.message;
    errBox.style.display = 'block';
  }
}

/* Xử lý Đăng xuất */
async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (e) {
    // ignore
  }
  setGuestUser();
  showToast('Đăng xuất', 'Bạn đã đăng xuất khỏi hệ thống an toàn.', 'info');
}

/* Modal Quên mật khẩu */
function openForgotModal() {
  closeAuthModal();
  showModal('forgotModal');
  if ($('forgotErrorMsg')) $('forgotErrorMsg').style.display = 'none';
}

function closeForgotModal() {
  hideModal('forgotModal');
}

async function handleForgotPassword(e) {
  e.preventDefault();
  const email = $('forgotEmail').value.trim();
  const btn = $('btnForgotSubmit');
  const errBox = $('forgotErrorMsg');

  errBox.style.display = 'none';
  busy(btn, true, 'Đang kiểm tra email...');

  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    busy(btn, false);

    if (data.ok) {
      closeForgotModal();
      showToast('Yêu cầu đã gửi', data.message || 'Mã đặt lại mật khẩu đã được xử lý. Vui lòng kiểm tra email.', 'success', 6000);
    } else {
      errBox.textContent = data.error || 'Không thể xử lý yêu cầu';
      errBox.style.display = 'block';
    }
  } catch (err) {
    busy(btn, false);
    errBox.textContent = 'Lỗi kết nối: ' + err.message;
    errBox.style.display = 'block';
  }
}

/* Modal Đổi mật khẩu */
function openChangePasswordModal() {
  showModal('changePasswordModal');
  if ($('changePwdErrorMsg')) $('changePwdErrorMsg').style.display = 'none';
  const dropdown = $('userDropdown');
  if (dropdown) dropdown.classList.remove('show');
}

function closeChangePasswordModal() {
  hideModal('changePasswordModal');
}

async function handleChangePassword(e) {
  e.preventDefault();
  const currentPassword = $('currentPassword').value;
  const newPassword = $('newPassword').value;
  const confirmNewPassword = $('confirmNewPassword').value;
  const btn = $('btnChangePwdSubmit');
  const errBox = $('changePwdErrorMsg');

  errBox.style.display = 'none';
  if (newPassword !== confirmNewPassword) {
    errBox.textContent = 'Mật khẩu mới nhập lại không khớp!';
    errBox.style.display = 'block';
    return;
  }

  busy(btn, true, 'Đang cập nhật mật khẩu...');

  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
    });
    const data = await res.json();
    busy(btn, false);

    if (data.ok) {
      closeChangePasswordModal();
      showToast('Đổi mật khẩu thành công', 'Mật khẩu của bạn đã được cập nhật an toàn.', 'success');
      $('currentPassword').value = '';
      $('newPassword').value = '';
      $('confirmNewPassword').value = '';
    } else {
      errBox.textContent = data.error || 'Không thể đổi mật khẩu';
      errBox.style.display = 'block';
    }
  } catch (err) {
    busy(btn, false);
    errBox.textContent = 'Lỗi kết nối: ' + err.message;
    errBox.style.display = 'block';
  }
}

/* Modal Thông tin tài khoản */
function openAccountModal() {
  if (!currentUser) {
    openAuthModal('login');
    return;
  }
  const u = currentUser;
  const initials = (u.full_name || u.username || 'US').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  $('accModalAvatar').textContent = initials;
  $('accModalName').textContent = u.full_name || u.username;
  $('accModalEmail').textContent = u.email || 'Chưa cập nhật';
  $('accModalUsername').textContent = u.username;
  $('accModalRole').textContent = u.role || 'Chuyên viên Phân tích';
  $('accModalCreatedAt').textContent = u.created_at ? new Date(u.created_at).toLocaleString('vi-VN') : 'Không rõ';
  $('accModalLastLogin').textContent = u.last_login_at ? new Date(u.last_login_at).toLocaleString('vi-VN') : 'Hiện tại';
  $('accModalLoginCount').textContent = (u.login_count || 1) + ' lần';

  showModal('accountModal');
  const dropdown = $('userDropdown');
  if (dropdown) dropdown.classList.remove('show');
}

function closeAccountModal() {
  hideModal('accountModal');
}

/* Modal Hướng dẫn sử dụng */
function openGuideModal() {
  showModal('guideModal');
  const dropdown = $('userDropdown');
  if (dropdown) dropdown.classList.remove('show');
}

function closeGuideModal() {
  hideModal('guideModal');
}

function toggleMobileNav() {
  const nav = document.querySelector('.nav-center');
  if (!nav) return;
  const cur = nav.style.display;
  nav.style.display = (cur === 'flex') ? 'none' : 'flex';
}

/* ═══════════════════════════════════════════════════════════════════════════
   CUỘN MƯỢT XUỐNG VÙNG NHẬP DỮ LIỆU KHI BẤM "BẮT ĐẦU QUY TRÌNH ↓"
   ═══════════════════════════════════════════════════════════════════════════ */
function scrollToUpload() {
  const target = $('uploadBox') || $('p1');
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('drag');
    setTimeout(() => target.classList.remove('drag'), 1000);
  }
}

function busy(btn, on, text) {
  if (!btn) return;
  if (on) {
    btn.dataset.t = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="loading"></span> ' + (text || 'Đang xử lý...');
  } else {
    btn.disabled = false;
    if (btn.dataset.t) btn.innerHTML = btn.dataset.t;
  }
}

const alertBox = (type, title, items) =>
  `<div class="alert ${type}"><b>${title}</b>${items && items.length ? '<ul>' + items.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul>' : ''}</div>`;

/* ── STEPPER 5 CHẶNG TIẾN TRÌNH ── */
const STAGES = [
  ['Nhập dữ liệu', 'Kiểm tra file'],
  ['Làm sạch dữ liệu', 'Khử trùng, sửa lỗi'],
  ['Phân tích dữ liệu', 'Thống kê & Đánh giá'],
  ['Xác nhận', 'Duyệt kết quả'],
  ['Báo cáo & Trực quan', 'Nguyên nhân, Insight, Giải pháp'],
];
let maxStage = 1, curStage = 1;

function renderStepper() {
  $('stepper').innerHTML = STAGES.map((s, i) => {
    const n = i + 1;
    const c = n === curStage ? 'active' : (n < curStage || n < maxStage ? 'done' : 'pending');
    return `<div class="st ${c}" onclick="stepClick(${n})">
      <div class="st-dot">${c === 'done' ? '✓' : n}</div>
      <div class="st-label">${s[0]}</div><div class="st-sub">${s[1]}</div></div>`;
  }).join('');
}

function showStage(n) {
  curStage = n;
  if (n > maxStage) maxStage = n;
  for (let i = 1; i <= 5; i++) {
    const el = $('p' + i);
    if (el) el.classList.toggle('visible', i === n);
  }
  renderStepper();
  window.scrollTo({ top: $('stepper').offsetTop - 75, behavior: 'smooth' });
}

function stepClick(n) {
  if (n === curStage) return;
  if (n < curStage) return back(n);
  if (n <= maxStage) showStage(n);
}

function back(to) {
  if (maxStage >= 4 && to <= 2 && !confirm('Quay lại chặng ' + to + '? Kết quả xử lý hiện tại sẽ cần chạy lại sau khi chỉnh sửa làm sạch.')) return;
  if (to === 1) return resetAll();
  maxStage = to;
  if (to === 2 || to === 3) resetProcess();
  showStage(to);
}

/* ═══════════════════════════════════════════════════════════════════════════
   CƠ CHẾ BÁO LỖI NẠP FILE HỎNG (ERROR PERCEPTION GUARD)
   ═══════════════════════════════════════════════════════════════════════════ */
function showUploadError(filename, mainError, errorDetails) {
  const errBox = $('uploadErrorContainer');
  if (!errBox) return;

  const detailsList = errorDetails && errorDetails.length
    ? errorDetails.map(d => `<li>${esc(d)}</li>`).join('')
    : `<li>File thiếu dấu phân cách bảng, thiếu cột hoặc không thể chuyển đổi thành DataFrame.</li>
       <li>Tệp có thể bị rỗng (0 bytes), chỉ có dòng tiêu đề hoặc không đúng định dạng .xlsx / .csv / .json chuẩn.</li>`;

  errBox.innerHTML = `
    <div class="error-card" style="border:2px solid #ffafcc;background:#fff5f8;border-radius:14px;padding:20px 24px;margin-bottom:20px;box-shadow:0 6px 20px rgba(255, 175, 204, 0.28);">
      <div class="error-card-header" style="display:flex;align-items:center;gap:14px;margin-bottom:12px;">
        <div class="error-badge-icon" style="width:40px;height:40px;border-radius:50%;background:#ffafcc;color:#591632;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.2rem;flex-shrink:0;">✕</div>
        <div>
          <div class="error-card-title" style="font-size:1.1rem;font-weight:700;color:#591632;">⚠️ Cảnh Báo Lỗi: Không có dữ liệu hoặc lỗi nạp file "${esc(filename)}"</div>
          <div style="font-size:.82rem;color:#7c2348;margin-top:2px">AI Agent Perception Guard · Đã dừng xử lý và yêu cầu người dùng nạp lại file hợp lệ</div>
        </div>
      </div>
      <div class="error-card-body" style="font-size:.9rem;color:#2b1d38;line-height:1.6;margin-bottom:16px;">
        <p style="margin-bottom:8px"><strong>Lý do phát hiện:</strong> <span style="color:#a81c4e;font-weight:700;">${esc(mainError)}</span></p>
        <ul style="padding-left:22px;color:#591632;">${detailsList}</ul>
      </div>
      <div class="error-actions" style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" onclick="document.getElementById('fileInput').click()">
          📂 Yêu cầu nhập lại: Chọn file khác
        </button>
        <button class="btn btn-outline btn-sm" onclick="useSample('ecommerce_sales_dirty.csv', this)">
          📦 Sử dụng bộ dữ liệu mẫu chuẩn để tiếp tục
        </button>
      </div>
    </div>
  `;
  errBox.style.display = 'block';
  errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('p1Result').innerHTML = '';
  $('p1Actions').style.display = 'none';
  if (upBox) upBox.style.display = '';
  maxStage = 1;
  renderStepper();
  updateSystemStatus('ready');
  showToast('Lỗi nạp file', 'Tệp không có dữ liệu hoặc lỗi cấu trúc. Yêu cầu nhập lại!', 'error', 5000);
}

function clearUploadError() {
  const errBox = $('uploadErrorContainer');
  if (errBox) {
    errBox.innerHTML = '';
    errBox.style.display = 'none';
  }
}

/* Thử nghiệm nạp file lỗi để kiểm tra cơ chế báo lỗi */
async function testCorruptedFile(btnEl) {
  busy(btnEl, true, 'Đang kiểm tra file lỗi...');
  try {
    const res = await fetch('/api/load-sample', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sample_id: 'sample_corrupted_file.csv' })
    });
    const data = await res.json();
    busy(btnEl, false);
    if (data.error) {
      showUploadError('sample_corrupted_file.csv', data.error, [
        'Dòng dữ liệu không có dấu phân cách (dấu phẩy, chấm phẩy) hợp lệ.',
        'Thiếu định nghĩa tiêu đề cột chuẩn.',
        'File không đạt tiêu chuẩn cấu trúc tối thiểu 2 cột của hệ thống AI Agent.'
      ]);
    } else {
      showUploadError('sample_corrupted_file.csv', 'File thử nghiệm bị lỗi cấu trúc dữ liệu nghiêm trọng.', []);
    }
  } catch (e) {
    busy(btnEl, false);
    showUploadError('sample_corrupted_file.csv', 'Không thể đọc tệp dữ liệu kiểm thử lỗi: ' + e.message, []);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHẶNG 1: NHẬP & KIỂM TRA DỮ LIỆU
   ═══════════════════════════════════════════════════════════════════════════ */
const upBox = $('uploadBox');
if (upBox) {
  upBox.addEventListener('dragover', e => { e.preventDefault(); upBox.classList.add('drag'); });
  upBox.addEventListener('dragleave', () => upBox.classList.remove('drag'));
  upBox.addEventListener('drop', e => {
    e.preventDefault();
    upBox.classList.remove('drag');
    if (e.dataTransfer.files.length) uploadFile(e.dataTransfer.files[0]);
  });
}

function pickFile(inp) {
  if (inp.files.length) uploadFile(inp.files[0]);
  inp.value = '';
}

async function useSample(sampleId, btnEl) {
  clearUploadError();
  busy(btnEl, true, 'Đang quét dữ liệu...');
  try {
    const res = await fetch('/api/load-sample', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sample_id: sampleId })
    });
    const data = await res.json();
    busy(btnEl, false);
    if (data.error) {
      showUploadError(sampleId, data.error, [
        'Không thể nạp dữ liệu mẫu từ máy chủ.',
        'Yêu cầu kiểm tra lại file mẫu hoặc tải lên file dữ liệu cá nhân.'
      ]);
      return;
    }
    onDatasetLoaded(data);
  } catch (e) {
    busy(btnEl, false);
    showUploadError(sampleId, 'Không thể kết nối với máy chủ AI Agent: ' + e.message, []);
  }
}

function uploadFile(file) {
  clearUploadError();
  if (!file) return;

  // 1. Kiểm tra nhanh file rỗng (0 bytes) ngay tại client
  if (file.size === 0) {
    showUploadError(
      file.name,
      'Tệp tải lên hoàn toàn rỗng (0 bytes). Không có dữ liệu để phân tích.',
      [
        'Tệp không có nội dung dữ liệu trên ổ cứng máy tính của bạn.',
        'Yêu cầu nhập lại: Vui lòng chọn một tệp CSV, Excel (.xlsx, .xls) hoặc JSON có chứa các cột và dòng dữ liệu.',
        'Bạn cũng có thể bấm vào một trong các bộ dữ liệu mẫu bên dưới để kiểm thử ngay.'
      ]
    );
    return;
  }

  busy($('btnPick'), true, 'Đang phân tích cấu trúc...');
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const b64 = e.target.result.split(',')[1];
      const res = await fetch('/api/upload-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, content_base64: b64 })
      });
      const data = await res.json();
      busy($('btnPick'), false);
      if (data.error) {
        showUploadError(file.name, data.error, [
          'Yêu cầu nhập lại: Vui lòng kiểm tra lại cấu trúc bảng của file.',
          'Bộ dữ liệu hợp lệ cần có tối thiểu 2 cột và ít nhất 1 dòng quan sát.',
          'Định dạng được hỗ trợ: Excel (.xlsx, .xls), CSV (.csv phân tách bằng dấu phẩy) hoặc JSON (.json).'
        ]);
        return;
      }
      onDatasetLoaded(data);
    } catch (err) {
      busy($('btnPick'), false);
      showUploadError(file.name, 'Lỗi nạp tệp: ' + err.message, [
        'Yêu cầu nhập lại: Vui lòng chọn tệp khác hoặc kiểm tra kết nối với máy chủ.'
      ]);
    }
  };
  reader.onerror = () => {
    busy($('btnPick'), false);
    showUploadError(file.name, 'Không thể đọc nội dung tệp từ trình duyệt.', [
      'Tệp có thể đang bị khóa bởi ứng dụng khác (ví dụ: Microsoft Excel).',
      'Yêu cầu nhập lại: Vui lòng đóng ứng dụng đang mở tệp và thử tải lại.'
    ]);
  };
  reader.readAsDataURL(file);
}

function onDatasetLoaded(data) {
  clearUploadError();
  // Huỷ các biểu đồ cũ để giải phóng bộ nhớ & tránh dữ liệu file trước còn sót lại
  charts.forEach(c => { try { c.destroy(); } catch (e) {} });
  charts = [];

  currentSessionId = data.session_id;
  currentDatasetName = data.dataset_name;
  initialProfileData = data.initial_profile;
  cleaningRules = JSON.parse(JSON.stringify(data.initial_profile.cleaning_proposals || []));
  appliedRulesSnapshot = JSON.stringify(cleaningRules);
  lastCleaningReport = data.cleaning_report;
  analysisData = null;
  currentHtmlReport = '';
  currentCustomInstruction = '';
  manualCellEdits = [];
  if ($('customInstructionInput')) $('customInstructionInput').value = '';
  if ($('customEditStatus')) $('customEditStatus').textContent = '';

  const prof = initialProfileData;
  const warnings = (prof.reasoning_trace || []).map(t => `${t.step}: ${t.observation}`);

  let html = '';
  html += alertBox(
    'ok',
    `✓ File "${esc(currentDatasetName)}" (${fmt(prof.total_rows)} dòng × ${fmt(prof.total_columns)} cột) đã được AI Agent quét thành công. Điểm chất lượng ban đầu: ${prof.health_score.overall}/100.`,
    []
  );
  if (warnings.length) {
    html += alertBox('warn', `AI Agent phát hiện ${prof.total_issues_detected} nhóm vấn đề cần làm sạch ở Chặng 2:`, warnings);
  }

  // 1. Thẻ cấu trúc từng cột
  const colCards = (prof.columns_profile || []).map(c => {
    const hasIssue = c.issues && c.issues.length > 0;
    const typeLabel = {
      numeric: 'Biến định lượng (Số)',
      categorical: 'Biến phân loại (Nhóm)',
      date: 'Biến thời gian (Ngày)',
      identifier: 'Mã định danh (ID)',
      text: 'Văn bản (Chuỗi)'
    }[c.semantic_type] || c.semantic_type;

    return `<div class="sheet ${hasIssue ? 'bad' : 'ok'}">
      <div class="nm">${esc(c.name)}</div>
      <div class="lb">${esc(typeLabel)} · ${fmt(c.unique_count)} giá trị riêng biệt</div>
      <div class="ct">${hasIssue ? '⚠ ' + esc(c.issues[0]) : '✓ Hợp lệ (' + fmt(prof.total_rows - c.missing_count) + ' dòng)'}</div>
      ${c.issues && c.issues.length > 1 ? `<div class="lb" style="margin-top:4px">+ ${esc(c.issues.slice(1).join('; '))}</div>` : ''}
    </div>`;
  }).join('');

  html += `<div class="card"><h3>Cấu trúc các cột trong file (${prof.total_columns} cột dữ liệu)</h3><div class="sheet-grid">${colCards}</div></div>`;

  // 2. Bảng Xem trước dữ liệu ban đầu (Trước khi làm sạch)
  const rawRows = (prof.raw_preview || []).slice(0, 12);
  if (rawRows.length) {
    const rawCols = Object.keys(rawRows[0]);
    html += `
      <div class="card" style="margin-top:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px">
          <h3 style="margin-bottom:0">Xem trước dữ liệu ban đầu (Trước khi làm sạch — 12 dòng đầu)</h3>
          <span class="badge m">Dữ liệu gốc chưa làm sạch</span>
        </div>
        <p class="muted" style="font-size:.8rem;margin-bottom:10px">Đây là dữ liệu gốc của file "${esc(currentDatasetName)}". Hãy chuyển sang Chặng 2 để đối chiếu các ô lỗi sẽ được làm sạch.</p>
        <div class="tbl-wrap"><table>
          <thead><tr><th>#</th>${rawCols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
          <tbody>${rawRows.map((r, i) => `<tr><td class="muted">${i + 1}</td>${rawCols.map(c => {
            const val = r[c];
            const empty = (val === null || val === undefined || val === 'nan' || val === '');
            return `<td>${empty ? '<span class="muted" style="color:var(--danger)">(trống)</span>' : esc(val)}</td>`;
          }).join('')}</tr>`).join('')}</tbody>
        </table></div>
      </div>
    `;
  }

  $('p1Result').innerHTML = html;
  upBox.style.display = 'none';
  $('p1Actions').style.display = 'flex';
  maxStage = 2;
  resetProcess();
  renderStepper();
  updateSystemStatus('ready');
  showToast('Đã quét dữ liệu', `Tệp "${currentDatasetName}" sẵn sàng để làm sạch!`, 'success');
}

function resetAll() {
  currentSessionId = null;
  maxStage = 1;
  charts.forEach(c => { try { c.destroy(); } catch (e) {} });
  charts = [];
  clearUploadError();
  $('p1Result').innerHTML = '';
  if (upBox) upBox.style.display = '';
  $('uploadTitle').textContent = 'Tải lên file dữ liệu của bạn';
  $('p1Actions').style.display = 'none';
  resetProcess();
  showStage(1);
  updateSystemStatus('ready');
  setActiveNav('pipeline');
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHẶNG 2: LÀM SẠCH DỮ LIỆU & KIỂM DUYỆT (HUMAN-IN-THE-LOOP)
   ═══════════════════════════════════════════════════════════════════════════ */
async function goClean() {
  if (!currentSessionId || !initialProfileData || !initialProfileData.total_rows || initialProfileData.total_rows <= 0) {
    showToast('Chặn tiến trình', 'Tệp không có dữ liệu quan sát nào (chỉ có tiêu đề cột). Yêu cầu nhập lại file có dữ liệu!', 'error');
    showStage(1);
    return;
  }
  busy($('btnToClean'), true, 'Đang chuẩn bị quy tắc...');
  renderCleanStage();
  busy($('btnToClean'), false);
  showStage(2);
}

async function runClean() {
  if (!currentSessionId) return false;
  const btn = $('btnReclean');
  busy(btn, true, 'Đang làm sạch...');
  updateSystemStatus('processing');
  try {
    currentCustomInstruction = ($('customInstructionInput')?.value || '').trim();
    const res = await fetch('/api/preview-cleaning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: currentSessionId,
        approved_rules: cleaningRules,
        custom_instruction: currentCustomInstruction,
        manual_cell_edits: manualCellEdits
      })
    });
    const data = await res.json();
    busy(btn, false);
    updateSystemStatus('ready');
    if (data.error) {
      $('cleanAlert').innerHTML = alertBox('err', 'Không làm sạch được', [data.error]);
      return false;
    }
    lastCleaningReport = data.cleaning_report;
    appliedRulesSnapshot = JSON.stringify(cleaningRules);
    maxStage = 2;
    resetProcess();
    renderCleanStage();
    renderStepper();
    showToast('Hoàn tất làm sạch', `Dữ liệu đã được cập nhật: ${lastCleaningReport.rows_after} bản ghi đạt chuẩn.`, 'success');
    return true;
  } catch (e) {
    busy(btn, false);
    updateSystemStatus('ready');
    $('cleanAlert').innerHTML = alertBox('err', 'Lỗi kết nối khi làm sạch', [e.message]);
    return false;
  }
}

function applyCustomInstruction() {
  const input = $('customInstructionInput');
  const val = (input?.value || '').trim();
  currentCustomInstruction = val;
  const statusEl = $('customEditStatus');
  if (statusEl) statusEl.innerHTML = '<span style="color:#25669b">⚡ Đang áp dụng yêu cầu sửa...</span>';
  runClean().then(ok => {
    if (statusEl) {
      if (ok) {
        const editsCount = lastCleaningReport?.custom_applied_count || (lastCleaningReport?.cell_changes || []).filter(c => (c.reason || '').includes('yêu cầu') || (c.reason || '').includes('thủ công')).length;
        statusEl.innerHTML = `<span style="color:#1d7044">✓ Đã áp dụng xong (${editsCount} ô/dòng được sửa theo yêu cầu)</span>`;
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 4500);
      } else {
        statusEl.innerHTML = '<span style="color:var(--danger)">✕ Có lỗi khi thực thi</span>';
      }
    }
  });
}

function resetCustomInstruction() {
  if ($('customInstructionInput')) $('customInstructionInput').value = '';
  currentCustomInstruction = '';
  manualCellEdits = [];
  const statusEl = $('customEditStatus');
  if (statusEl) statusEl.textContent = '';
  showToast('Đã xóa yêu cầu', 'Toàn bộ chỉ thị tùy chỉnh và ô sửa thủ công đã được xóa sạch.', 'info');
  runClean();
}

function addCustomChip(chipText) {
  const input = $('customInstructionInput');
  if (!input) return;
  const cur = input.value.trim();
  if (!cur) {
    input.value = chipText;
  } else if (!cur.includes(chipText)) {
    input.value = cur + '; ' + chipText;
  }
  input.focus();
}

function startInlineEdit(td, rowNum, colName) {
  if (td.querySelector('input')) return;
  const currentText = td.textContent.trim() === '(trống)' ? '' : td.textContent.trim();
  td.innerHTML = `<input type="text" class="inline-edit-input" value="${esc(currentText)}">`;
  const inp = td.querySelector('input');
  inp.focus();
  inp.select();

  function saveEdit() {
    const newVal = inp.value.trim();
    if (newVal !== currentText) {
      manualCellEdits = manualCellEdits.filter(e => !(e.row_index === rowNum && e.column === colName));
      manualCellEdits.push({ row_index: rowNum, column: colName, new_value: newVal });
      td.innerHTML = esc(newVal) || '<span class="muted">(trống)</span>';
      td.className = 'cell-custom-modified cell-editable';
      td.title = `Đã sửa thủ công: "${currentText}" ➔ "${newVal}"`;
      showToast('Đã ghi nhận sửa ô', `Dòng #${rowNum}, Cột ${colName} ➔ "${newVal}". Đang làm mới dữ liệu...`, 'info', 3000);
      runClean();
    } else {
      td.innerHTML = esc(currentText) || '<span class="muted">(trống)</span>';
    }
  }

  inp.addEventListener('blur', saveEdit);
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      inp.removeEventListener('blur', saveEdit);
      saveEdit();
    } else if (e.key === 'Escape') {
      inp.removeEventListener('blur', saveEdit);
      td.innerHTML = esc(currentText) || '<span class="muted">(trống)</span>';
    }
  });
}

function renderCleanStage() {
  const prof = initialProfileData;
  const rpt = lastCleaningReport;
  if (!prof || !rpt) return;

  // 1. Danh sách quy tắc làm sạch
  $('optList').innerHTML = cleaningRules.map((rule, idx) => {
    const stratOptions = (rule.available_strategies || []).map(st =>
      `<option value="${esc(st.value)}" ${st.value === rule.strategy ? 'selected' : ''}>${esc(st.label)}</option>`
    ).join('');

    return `<div class="opt" style="flex-direction:column;align-items:stretch">
      <label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer;width:100%">
        <input type="checkbox" ${rule.enabled ? 'checked' : ''} onchange="toggleRuleOpt(${idx}, this.checked)">
        <span style="flex:1"><b>${esc(rule.column_label)}</b>: ${esc(rule.issue_badge)}</span>
        <span class="cnt ${rule.affected_count ? 'hit' : ''}" title="Số dòng/ô phát hiện">${fmt(rule.affected_count)}</span>
      </label>
      <div style="padding-left:26px">
        <select class="strat-select" onchange="changeRuleStrat(${idx}, this.value)" ${rule.enabled ? '' : 'disabled'}>
          ${stratOptions}
        </select>
      </div>
    </div>`;
  }).join('');

  updDirty();

  // 2. Thẻ KPI chặng làm sạch
  const hBefore = prof.health_score?.overall || 0;
  const hAfter = rpt.health_after?.overall || 100;
  $('cleanKpi').innerHTML = `
    <div class="kpi"><div class="kpi-label">Bản ghi ban đầu</div><div class="kpi-val">${fmt(rpt.rows_before)}</div><div class="kpi-sub">Phát hiện ${fmt(prof.total_issues_detected)} nhóm vấn đề</div></div>
    <div class="kpi"><div class="kpi-label">Sau làm sạch</div><div class="kpi-val" style="color:#25669b">${fmt(rpt.rows_after)}</div><div class="kpi-sub">Đạt chuẩn phân tích</div></div>
    <div class="kpi"><div class="kpi-label">Dòng trùng / bị loại</div><div class="kpi-val" style="color:${rpt.rows_dropped ? 'var(--danger)' : 'var(--t1)'}">${fmt(rpt.rows_dropped)}</div><div class="kpi-sub">Đã lọc bỏ bản ghi nhân bản</div></div>
    <div class="kpi" title="Mức độ sạch của dữ liệu (thang điểm 100): Phản ánh dữ liệu đã đầy đủ, không còn ô trống lỗi và không bị trùng lặp"><div class="kpi-label">Mức độ sạch của dữ liệu</div><div class="kpi-val" style="color:var(--accent-pink)">${hAfter}/100</div>
      <div class="kpi-sub"><span class="badge m">Gốc: ${hBefore}/100</span> <span class="badge b">Đã sửa ${fmt(rpt.cells_modified_count)} ô</span></div></div>`;

  // 3. Hộp thông báo chặng làm sạch
  $('cleanAlert').innerHTML = alertBox(
    'info',
    'Quy trình Human-in-the-Loop: Kết quả làm sạch được hiển thị trực quan để bạn duyệt trước khi phân tích.',
    [
      `Đã chuẩn hóa ${fmt(rpt.cells_modified_count)} ô dữ liệu (điền khuyết, sửa sai miền logic, kẹp biên ngoại lai bất thường, đồng nhất chuỗi & ngày tháng) và loại bỏ ${fmt(rpt.rows_dropped)} bản ghi trùng lặp.`,
      'Bấm vào từng dòng trong bảng "Kết quả từng quy tắc" bên dưới để xem chi tiết giá trị Trước → Sau của từng ô dữ liệu.'
    ]
  );

  // 4. Bảng kết quả từng quy tắc
  const cellChanges = rpt.cell_changes || [];
  $('ruleTable').innerHTML = (rpt.execution_summary || []).map((step, i) => {
    const relatedChanges = cellChanges.filter(ch => ch.column === step.column || (step.column === 'Toàn bộ bảng' && ch.reason.includes('trùng')));
    const hasSample = relatedChanges.length > 0;
    const isApplied = step.status === 'applied';
    const actBadge = !isApplied
      ? '<span class="badge m">bỏ qua (giữ nguyên)</span>'
      : (step.issue_badge.includes('Trùng') ? '<span class="badge r">xoá trùng</span>'
        : (step.issue_badge.includes('Thiếu') ? '<span class="badge b">điền khuyết</span>' : '<span class="badge o">chuẩn hóa</span>'));

    return `<tr class="rule-row ${hasSample ? 'has' : ''}" onclick="toggleSample(${i}, this)">
      <td style="white-space:normal"><b>${esc(step.issue_badge)}</b> — <span class="muted">${esc(step.detail)}</span></td>
      <td><code>${esc(step.column)}</code></td>
      <td class="amt" style="font-weight:700;color:${step.rows_affected ? 'var(--accent-pink)' : 'var(--t4)'}">${fmt(step.rows_affected)}</td>
      <td>${actBadge}</td>
    </tr>
    <tr class="expand" id="sample${i}" style="display:none">
      <td colspan="4">${hasSample ? renderDiffSampleTable(relatedChanges) : ''}</td>
    </tr>`;
  }).join('');

  // 5. Bảng Xem trước 15 dòng đầu sau làm sạch
  const modifiedMap = new Map();
  cellChanges.forEach(ch => {
    const isCustom = (ch.reason || '').toLowerCase().includes('yêu cầu') || (ch.reason || '').toLowerCase().includes('thủ công');
    modifiedMap.set(`${ch.row_index}__${ch.column}`, { reason: ch.reason, isCustom });
  });

  const rows = (rpt.cleaned_preview || []).slice(0, 15);
  if (rows.length) {
    const cols = Object.keys(rows[0]);
    $('previewTable').innerHTML = '<thead><tr><th>#</th>' + cols.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map((x, idx) => {
        const rNum = idx + 1;
        return '<tr><td class="muted">' + rNum + '</td>' + cols.map(c => {
          const mod = modifiedMap.get(`${rNum}__${c}`);
          const isMod = !!mod;
          const isCustom = mod?.isCustom;
          const v = x[c];
          const cellContent = (v === null || v === undefined || v === 'nan') ? '<span class="muted">(trống)</span>' : esc(v);
          const cellCls = isCustom ? 'cell-custom-modified cell-editable' : (isMod ? 'cell-cleaned cell-editable' : 'cell-editable');
          const tip = isCustom ? `Sửa theo yêu cầu: ${mod.reason} (Nhấp đúp để đổi giá trị)`
            : (isMod ? `Đã chuẩn hóa: ${mod.reason} (Nhấp đúp để đổi giá trị)` : 'Nhấp đúp hoặc bấm để sửa trực tiếp ô này');
          return `<td class="${cellCls}" title="${tip}" ondblclick="startInlineEdit(this, ${rNum}, '${esc(c)}')">${cellContent}</td>`;
        }).join('') + '</tr>';
      }).join('') + '</tbody>';
  } else {
    $('previewTable').innerHTML = '<tbody><tr><td class="muted">Không có dữ liệu</td></tr></tbody>';
  }
}

function renderDiffSampleTable(changes) {
  return `<div class="muted" style="font-size:.75rem;margin-bottom:6px">Chi tiết biến đổi (${changes.length} ô dữ liệu):</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Dòng #</th><th>Cột</th><th>Giá trị Trước (Lỗi)</th><th>Giá trị Sau (Đã làm sạch)</th><th>Phương pháp xử lý</th></tr></thead>
      <tbody>${changes.map(c => `<tr>
        <td><b>Dòng #${c.row_index}</b></td>
        <td><code>${esc(c.column)}</code></td>
        <td style="color:var(--danger);text-decoration:line-through">${esc(c.before)}</td>
        <td style="color:#1d4e78;font-weight:700">${esc(c.after)}</td>
        <td>${esc(c.reason)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
}

function toggleSample(i, tr) {
  const el = $('sample' + i);
  if (!el || !el.innerHTML.trim().length) return;
  const open = el.style.display === 'none';
  el.style.display = open ? '' : 'none';
  tr.classList.toggle('open', open);
}

function toggleRuleOpt(idx, checked) {
  cleaningRules[idx].enabled = checked;
  renderCleanStage();
}

function changeRuleStrat(idx, val) {
  cleaningRules[idx].strategy = val;
  updDirty();
}

function isDirty() {
  return JSON.stringify(cleaningRules) !== appliedRulesSnapshot;
}

function updDirty() {
  const d = isDirty();
  $('dirtyNote').style.display = d ? 'block' : 'none';
  $('btnAcceptClean').disabled = d;
  $('btnAcceptClean').title = d ? 'Hãy bấm "Làm sạch lại" trước' : '';
}

function acceptClean() {
  resetProcess();
  showStage(3);
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHẶNG 3: XỬ LÝ & SUY LUẬN AI AGENT
   ═══════════════════════════════════════════════════════════════════════════ */
const PROC = [
  ['Kiểm toán & Chuẩn hóa Kiểu dữ liệu', 'Xác thực bảng dữ liệu sạch sau khi người dùng duyệt và đồng bộ kiểu số / ngày tháng'],
  ['Phân tích Thống kê Đa chiều & Gom nhóm', 'Tính toán hệ thống KPIs, phân rã tỷ trọng theo các chiều danh mục và chuỗi thời gian'],
  ['Tính Ma trận Tương quan Pearson (r)', 'Đánh giá cường độ và chiều hướng liên kết giữa các biến định lượng trong bộ dữ liệu'],
  ['Suy luận AI Agent & Kết xuất Báo cáo HTML', 'Tổng hợp phát hiện chuyên sâu, khuyến nghị hành động và dựng báo cáo HTML5 trực tiếp']
];

function resetProcess() {
  analysisData = null;
  $('procList').innerHTML = PROC.map((p, i) =>
    `<div class="proc" id="proc${i}"><div class="dot">${i + 1}</div><div><div class="t">${p[0]}</div><div class="d">${p[1]}</div><div class="r" id="procR${i}"></div></div></div>`
  ).join('');
  $('procAlert').innerHTML = '';
  $('btnProcess').style.display = '';
  $('btnProcess').disabled = false;
  $('btnProcess').innerHTML = '▶ Bắt đầu phân tích';
  if ($('btnToConfirm')) $('btnToConfirm').style.display = 'none';
  if ($('chkConfirm')) {
    $('chkConfirm').checked = false;
    updConfirm();
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runProcess() {
  if (!currentSessionId || !lastCleaningReport || !lastCleaningReport.rows_after || lastCleaningReport.rows_after <= 0) {
    showToast('Chặn tiến trình', 'Không có dữ liệu sạch để phân tích. Hệ thống không thể xuất kết quả hay báo cáo.', 'error');
    showStage(1);
    return;
  }
  const btn = $('btnProcess');
  busy(btn, true, 'Đang phân tích...');
  updateSystemStatus('processing');
  $('btnProcBack').disabled = true;
  $('proc0').className = 'proc run';

  try {
    const resPromise = fetch('/api/approve-and-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: currentSessionId,
        approved_rules: cleaningRules,
        custom_instruction: currentCustomInstruction,
        manual_cell_edits: manualCellEdits,
        report_title: `Báo Cáo Phân Tích & Làm Sạch Dữ Liệu: ${currentDatasetName}`
      })
    }).then(r => r.json());

    const r = await resPromise;
    if (r.error) throw new Error(r.error);

    analysisData = r.analysis_result;
    lastCleaningReport = r.cleaning_report;
    currentHtmlReport = r.html_report;

    const cb0 = (analysisData.category_breakdowns && analysisData.category_breakdowns[0]) || { items: [] };
    const topCorr = (analysisData.correlations && analysisData.correlations[0]) || null;
    const stepTexts = [
      `✓ Đã chuẩn hóa ${fmt(lastCleaningReport.rows_after)} bản ghi sạch · Điểm chất lượng đạt ${lastCleaningReport.health_after.overall}/100`,
      `✓ Đã phân tích ${cb0.items.length} phân khúc trên cột '${analysisData.primary_metric || ''}'`,
      topCorr ? `✓ Phát hiện tương quan mạnh nhất: ${topCorr.col_a} ↔ ${topCorr.col_b} (r = ${topCorr.r})` : '✓ Hoàn tất kiểm tra ma trận tương quan các biến số',
      `✓ Đã sinh ${analysisData.ai_insights.key_findings.length} phát hiện chuyên sâu & ${analysisData.ai_insights.recommendations.length} khuyến nghị kèm Báo cáo HTML`
    ];

    for (let i = 0; i < PROC.length; i++) {
      const el = $('proc' + i);
      el.className = 'proc run';
      await sleep(380);
      el.className = 'proc done';
      el.querySelector('.dot').textContent = '✓';
      $('procR' + i).textContent = stepTexts[i];
    }

    $('btnProcBack').disabled = false;
    btn.style.display = 'none';
    if ($('btnToConfirm')) $('btnToConfirm').style.display = '';
    $('procAlert').innerHTML = alertBox('ok', '✓ Đã phân tích dữ liệu xong. Bấm "Sang bước xác nhận" để duyệt kết quả trước khi xuất báo cáo.', []);
    maxStage = 4;
    renderConfirmStage();
    renderStepper();
    updateSystemStatus('ready');
  } catch (e) {
    $('btnProcBack').disabled = false;
    busy(btn, false);
    btn.innerHTML = '↻ Chạy lại';
    $('procAlert').innerHTML = alertBox('err', 'Phân tích thất bại', [e.message]);
    updateSystemStatus('ready');
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHẶNG 4: XÁC NHẬN KẾT QUẢ (HUMAN-IN-THE-LOOP)
   ═══════════════════════════════════════════════════════════════════════════ */
function buildKpiHtml() {
  if (!analysisData) return '';
  return (analysisData.kpis || []).slice(0, 4).map((k, idx) => {
    const color = idx === 1 ? '#1d4e78' : (idx === 2 ? '#b56598' : 'var(--t1)');
    return `<div class="kpi">
      <div class="kpi-label">${esc(k.label)}</div>
      <div class="kpi-val" style="color:${color}">${esc(k.value)}</div>
      <div class="kpi-sub">${esc(k.subtext)}</div>
    </div>`;
  }).join('');
}

function renderConfirmStage() {
  if (!analysisData || !lastCleaningReport) return;

  const findingsList = (analysisData.ai_insights?.key_findings || []).map(f => `${f.title}: ${f.detail}`);
  if ($('confirmRecon')) {
    $('confirmRecon').innerHTML = alertBox(
      'ok',
      `✓ Đối soát dữ liệu khớp hoàn toàn: ${fmt(lastCleaningReport.rows_before)} dòng gốc − ${fmt(lastCleaningReport.rows_dropped)} dòng loại = ${fmt(lastCleaningReport.rows_after)} dòng sạch (Đã chuẩn hóa ${fmt(lastCleaningReport.cells_modified_count)} ô).`,
      findingsList.slice(0, 3)
    );
  }

  if ($('confirmKpi')) $('confirmKpi').innerHTML = buildKpiHtml();

  const cb0 = (analysisData.category_breakdowns && analysisData.category_breakdowns[0]) || null;
  if (cb0 && cb0.items && $('confirmTable')) {
    if ($('confirmTableTitle')) $('confirmTableTitle').textContent = `Kết quả phân tích '${cb0.metric_col}' theo nhóm '${cb0.category_col}'`;
    $('confirmTable').innerHTML = cb0.items.map((it, idx) => {
      const recBadge = idx === 0
        ? '<span class="badge g">Chủ lực (Mở rộng)</span>'
        : (idx === cb0.items.length - 1 ? '<span class="badge o">Cần tối ưu</span>' : '<span class="badge b">Duy trì ổn định</span>');
      return `<tr>
        <td style="font-weight:700">${esc(it.category)}</td>
        <td class="amt">${fmt(it.count)}${it.count_before && it.count_before !== it.count ? ` <span class="badge m" style="font-size:.7rem" title="Số dòng gốc trước khi lọc trùng">gốc: ${fmt(it.count_before)}</span>` : ''}</td>
        <td class="amt" style="font-weight:600">${fmtDec(it.sum)}</td>
        <td class="amt">${fmtDec(it.mean)}</td>
        <td class="amt">${fmtDec(it.median)}</td>
        <td class="amt" style="color:var(--accent-pink);font-weight:700">${it.share_pct}%</td>
        <td>${recBadge}</td>
      </tr>`;
    }).join('');
  }

  if ($('chkConfirm')) {
    $('chkConfirm').checked = false;
    updConfirm();
  }
}

function updConfirm() {
  if ($('btnConfirm') && $('chkConfirm')) {
    $('btnConfirm').disabled = !$('chkConfirm').checked;
  }
}

function confirmExport() {
  if (!analysisData || !lastCleaningReport || !lastCleaningReport.rows_after || lastCleaningReport.rows_after <= 0) {
    showToast('Chặn xuất báo cáo', 'Tệp không có dữ liệu thực tế. Không thể tạo dashboard hay xuất báo cáo HTML.', 'error');
    showStage(1);
    return;
  }
  maxStage = 5;
  showStage(5);
  renderReportStage();
  updateSystemStatus('complete');
  setActiveNav('report');
  showToast('Đã xác nhận', 'Báo cáo & Dashboard phân tích đã được tạo thành công!', 'success');
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHẶNG 5: BÁO CÁO & DASHBOARD ĐA BIỂU ĐỒ TRỰC QUAN HÓA
   ═══════════════════════════════════════════════════════════════════════════ */
function renderReportStage() {
  if (!analysisData || !lastCleaningReport) return;
  isReportTableExpanded = false;

  const nowStr = new Date().toLocaleString('vi-VN');
  $('reportMeta').textContent = `File: ${currentDatasetName} · Xuất lúc ${nowStr} · Đã làm sạch ${fmt(lastCleaningReport.rows_before)} → ${fmt(lastCleaningReport.rows_after)} bản ghi (${fmt(lastCleaningReport.cells_modified_count)} ô chuẩn hóa)`;

  $('reportKpi').innerHTML = buildKpiHtml();

  const cb0 = (analysisData.category_breakdowns && analysisData.category_breakdowns[0]) || { items: [], category_col: 'Phân khúc', metric_col: 'Giá trị' };
  const items = cb0.items || [];

  // Tính toán các chỉ số doanh thu & tài chính tổng hợp
  const summary = analysisData?.before_after_summary || {};
  const primaryCol = (analysisData.primary_metric || cb0.metric_col || '').toLowerCase();
  const isMoney = ['revenue', 'doanh_thu', 'sales', 'amount', 'gia', 'price', 'luong', 'salary'].some(k => primaryCol.includes(k));
  const metricName = isMoney ? 'Doanh Thu' : (analysisData.primary_metric || cb0.metric_col || 'Chỉ Số');
  const currUnit = isMoney ? ' ₫' : '';
  const cleanSum = (summary.primary_sum_after !== undefined && summary.primary_sum_after !== null)
    ? summary.primary_sum_after
    : items.reduce((acc, it) => acc + (Number(it.sum) || 0), 0);
  const rawSum = (summary.primary_sum_before !== undefined && summary.primary_sum_before !== null)
    ? summary.primary_sum_before
    : cleanSum;
  const diffSum = rawSum - cleanSum;
  const avgVal = cleanSum / Math.max(lastCleaningReport.rows_after, 1);
  const topItem = items.length ? items[0] : { category: 'N/A', sum: 0, share_pct: 0 };

  // Hiển thị Khung Tổng Hợp Doanh Thu & Hiệu Suất
  const bannerEl = $('revenueExecutiveBanner');
  if (bannerEl) {
    bannerEl.style.display = 'block';
    const diffText = diffSum > 0
      ? `Đã lọc giảm ${fmt(diffSum)}${currUnit} (trùng lặp & ngoại lai)`
      : (diffSum < 0 ? `Đã chuẩn hóa +${fmt(Math.abs(diffSum))}${currUnit}` : 'Khớp 100% dữ liệu sạch');

    bannerEl.innerHTML = `
      <div class="revenue-banner-grid">
        <div class="rev-card" style="--rev-accent:#ffafcc">
          <div class="rev-card-title">💰 TỔNG ${metricName.toUpperCase()} SẠCH</div>
          <div class="rev-card-val" style="color:#b52b65">${fmt(cleanSum)}${currUnit}</div>
          <div class="rev-card-sub">Tính trên <b>${fmt(lastCleaningReport.rows_after)}</b> dòng sạch đạt chuẩn</div>
        </div>
        <div class="rev-card" style="--rev-accent:#a2d2ff">
          <div class="rev-card-title">🏷️ ${metricName.toUpperCase()} GỐC BAN ĐẦU</div>
          <div class="rev-card-val" style="color:#1d4e78">${fmt(rawSum)}${currUnit}</div>
          <div class="rev-card-sub">${diffText}</div>
        </div>
        <div class="rev-card" style="--rev-accent:#cdb4db">
          <div class="rev-card-title">📈 TRUNG BÌNH / BẢN GHI</div>
          <div class="rev-card-val" style="color:#4a355b">${fmt(avgVal)}${currUnit}</div>
          <div class="rev-card-sub">Trung vị (Median): <b>${fmtDec(topItem.median || avgVal)}${currUnit}</b></div>
        </div>
        <div class="rev-card" style="--rev-accent:#ffc8dd">
          <div class="rev-card-title">🏆 PHÂN KHÚC CAO NHẤT</div>
          <div class="rev-card-val" style="font-size:1.15rem;color:#7c2348">${esc(topItem.category)}</div>
          <div class="rev-card-sub"><b>${fmt(topItem.sum)}${currUnit}</b> (Chiếm <b>${topItem.share_pct}%</b> tổng số)</div>
        </div>
      </div>
    `;
  }

  // 0. Tóm tắt Điều hành (Executive Summary)
  const execSum = analysisData?.ai_insights?.executive_summary || '';
  if ($('reportExecSummary') && $('reportExecSummaryCard')) {
    if (execSum) {
      $('reportExecSummaryCard').style.display = 'block';
      $('reportExecSummary').textContent = execSum;
    } else {
      $('reportExecSummaryCard').style.display = 'none';
    }
  }

  // 1. Phân tích Nguyên nhân Gốc rễ (Root Cause Analysis - RCA)
  const rca = analysisData?.ai_insights?.root_cause_analysis || [];
  const elRca = $('rootCauseTable');
  if (elRca) {
    elRca.innerHTML = rca.map(item => {
      const sev = String(item.severity || 'Cao');
      const sevClass = sev.toLowerCase().includes('nghiêm') ? 'prio-high' : 'prio-med';
      return `
      <tr>
        <td>
          <div style="font-weight:700;font-size:.82rem;color:var(--t1);margin-bottom:4px">${esc(item.stage || 'Quy trình')}</div>
          <span class="prio-badge ${sevClass}">${esc(sev)}</span>
        </td>
        <td style="font-weight:700; color:#b52b65;">${esc(item.issue)}</td>
        <td style="line-height:1.5;">${esc(item.root_cause)}</td>
        <td style="color:#4a355b; font-size:.84rem;">${esc(item.impact)}</td>
        <td style="color:#1b5a96; font-weight:600; font-size:.84rem;">${esc(item.solution)}</td>
      </tr>
    `;
    }).join('') || '<tr><td colspan="5" class="muted">Không có vấn đề cần xử lý</td></tr>';
  }

  // 2. Nhận định & Insights từ AI
  const findings = analysisData?.ai_insights?.key_findings || [];
  const elFindings = $('reportFindingsList');
  if (elFindings) {
    elFindings.innerHTML = findings.map((f, idx) => `
      <div class="finding-card">
        <div style="font-weight:700; color:#1d4e78; margin-bottom:4px; display:flex; align-items:center; gap:8px;">
          <span style="background:var(--pastel-blue); color:#1d4e78; width:22px; height:22px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:12px; font-weight:800;">${idx + 1}</span>
          ${esc(f.title)}
        </div>
        <div style="color:var(--t2); font-size:.85rem; padding-left:30px;">${esc(f.detail)}</div>
      </div>
    `).join('') || '<div class="muted">Không có nhận định</div>';
  }

  // 3. Đề xuất Giải pháp Chiến lược & Lộ trình Triển khai
  const recs = analysisData?.ai_insights?.recommendations || [];
  const elRecs = $('reportRecsTable');
  if (elRecs) {
    elRecs.innerHTML = recs.map(r => {
      const prio = String(r.priority || 'Cao');
      const pClass = prio.toLowerCase().includes('cao') || prio.toLowerCase().includes('trọng') ? 'prio-high' : 'prio-med';
      return `
        <tr>
          <td><span class="prio-badge ${pClass}">${esc(prio)}</span></td>
          <td><strong>${esc(r.action)}</strong></td>
          <td style="font-size:.83rem;color:#1d4e78;font-weight:600">${esc(r.owner || 'Bộ phận liên quan')}</td>
          <td style="font-size:.82rem"><span class="badge b">${esc(r.timeline || 'Trong tháng')}</span></td>
          <td style="color:#4a355b;font-size:.84rem">${esc(r.impact)}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="5" class="muted">Không có khuyến nghị</td></tr>';
  }

  // 3b. Thống kê Mô tả Chi tiết & Ma trận Tương quan Pearson
  const numStats = analysisData?.numeric_summaries || [];
  const elStats = $('reportStatsTable');
  if (elStats) {
    elStats.innerHTML = numStats.map(st => `
      <tr>
        <td style="font-weight:700">${esc(st.column)}</td>
        <td class="amt">${fmt(st.count)}</td>
        <td class="amt">${fmtDec(st.mean)}</td>
        <td class="amt">${fmtDec(st.std)}</td>
        <td class="amt">${fmtDec(st.min)}</td>
        <td class="amt">${fmtDec(st.q25)}</td>
        <td class="amt" style="font-weight:700;color:#b52b65">${fmtDec(st.median)}</td>
        <td class="amt">${fmtDec(st.q75)}</td>
        <td class="amt">${fmtDec(st.max)}</td>
      </tr>
    `).join('') || '<tr><td colspan="9" class="muted">Không có biến định lượng</td></tr>';
  }

  const corrs = analysisData?.correlations || [];
  const elCorrWrap = $('reportCorrWrap');
  const elCorr = $('reportCorrTable');
  if (elCorrWrap && elCorr) {
    if (corrs.length > 0) {
      elCorrWrap.style.display = 'block';
      elCorr.innerHTML = corrs.slice(0, 6).map(c => {
        const rVal = Number(c.r || 0);
        const pct = Math.min(100, Math.round(Math.abs(rVal) * 100));
        const col = rVal >= 0 ? '#16845b' : '#c03957';
        return `
          <tr>
            <td><strong>${esc(c.col_a)}</strong> ↔ <strong>${esc(c.col_b)}</strong></td>
            <td class="amt" style="font-weight:700;color:${col}">${rVal >= 0 ? '+' : ''}${rVal.toFixed(3)}</td>
            <td>
              <div style="background:#f3e9f8;height:8px;border-radius:4px;overflow:hidden;width:130px">
                <div style="width:${pct}%;height:100%;background:${col}"></div>
              </div>
            </td>
            <td style="font-size:.84rem">${esc(c.strength)} (${esc(c.direction)})</td>
          </tr>
        `;
      }).join('');
    } else {
      elCorrWrap.style.display = 'none';
    }
  }

  // 4. Bảng tổng hợp & Khuyến nghị (Tối đa 10 dòng + Nút hiển thị toàn bộ nếu vượt quá 10 dòng)
  renderReportTable();

  // 5. Thẻ chi tiết từng phân khúc
  $('programCards').innerHTML = items.map((it, idx) => {
    const pal = colStyle(idx);
    const badgeText = idx === 0 ? 'Hạng 1' : (idx === 1 ? 'Hạng 2' : (idx === 2 ? 'Hạng 3' : `Hạng ${idx + 1}`));
    return `<div class="p-card reveal-on-scroll" style="border-top-color:${pal.hex}">
      <div class="p-card-head">
        <div>
          <div class="p-title">${esc(it.category)}</div>
          <div class="p-sub">${fmt(it.count)} bản ghi · Tỷ trọng: <b>${it.share_pct}%</b></div>
        </div>
        <span class="p-badge" style="background:${pal.bg};color:${pal.text}">${badgeText}</span>
      </div>
      <div class="p-stats">
        <div class="stat"><div class="stat-l">Tổng ${esc(cb0.metric_col)}</div><div class="stat-v">${fmtS(it.sum)}${currUnit}</div></div>
        <div class="stat"><div class="stat-l">Trung bình (Mean)</div><div class="stat-v">${fmtDec(it.mean)}${currUnit}</div></div>
        <div class="stat"><div class="stat-l">Trung vị (Median)</div><div class="stat-v">${fmtDec(it.median)}${currUnit}</div></div>
        <div class="stat"><div class="stat-l">Giá trị lớn nhất</div><div class="stat-v">${fmtDec(it.max)}${currUnit}</div></div>
      </div>
      <div class="p-rec"><b>Khuyến nghị AI:</b> ${esc(it.ai_recommendation || 'Duy trì hiệu suất và theo dõi biến động định kỳ.')}</div>
    </div>`;
  }).join('');

  // Hiển thị iframe báo cáo HTML
  const iframe = $('html-report-iframe');
  if (iframe) {
    iframe.srcdoc = currentHtmlReport;
  }

  // Khởi tạo 4 biểu đồ
  setTimeout(renderMultiCharts, 80);
  setTimeout(initScrollReveal, 120);
}

let isReportTableExpanded = false;

function renderReportTable() {
  const cb0 = (analysisData?.category_breakdowns && analysisData.category_breakdowns[0]) || { items: [] };
  const items = cb0.items || [];
  const primaryCol = (analysisData?.primary_metric || cb0.metric_col || '').toLowerCase();
  const isMoney = ['revenue', 'doanh_thu', 'sales', 'amount', 'gia', 'price', 'luong', 'salary'].some(k => primaryCol.includes(k));
  const currUnit = isMoney ? ' ₫' : '';
  const tbody = $('reportTable');
  const toggleWrap = $('reportTableToggleWrap');
  const toggleBtn = $('btnToggleReportTable');
  const badge = $('reportTableBadge');
  if (!tbody) return;

  const total = items.length;
  // Giới hạn hiển thị tối đa 10 dòng ban đầu theo yêu cầu người dùng
  const displayItems = (isReportTableExpanded || total <= 10) ? items : items.slice(0, 10);

  tbody.innerHTML = displayItems.map((it, idx) => {
    return `<tr>
      <td style="font-weight:700">${esc(it.category)}</td>
      <td class="amt">${fmt(it.count)}${it.count_before && it.count_before !== it.count ? ` <span class="badge m" style="font-size:.7rem" title="Số dòng gốc trước khi lọc trùng">gốc: ${fmt(it.count_before)}</span>` : ''}</td>
      <td class="amt" style="font-weight:600">${fmtDec(it.sum)}${currUnit}</td>
      <td class="amt">${fmtDec(it.mean)}${currUnit}</td>
      <td class="amt">${fmtDec(it.median)}${currUnit}</td>
      <td class="amt" style="color:var(--accent-pink);font-weight:700">${it.share_pct}%</td>
      <td style="font-size:.82rem">${esc(it.ai_recommendation || 'Duy trì chiến lược hiện hành.')}</td>
    </tr>`;
  }).join('');

  if (toggleWrap && toggleBtn) {
    if (total > 10) {
      toggleWrap.style.display = 'flex';
      if (isReportTableExpanded) {
        toggleBtn.innerHTML = `▲ Thu gọn về 10 dòng đầu ↑`;
        if (badge) badge.textContent = `Đang hiển thị toàn bộ ${total} dòng`;
      } else {
        toggleBtn.innerHTML = `👁️ Hiển thị toàn bộ bảng (Tổng số ${fmt(total)} dòng) ↓`;
        if (badge) badge.textContent = `Mặc định hiển thị 10 / ${total} dòng`;
      }
    } else {
      toggleWrap.style.display = 'none';
      if (badge) badge.textContent = `Hiển thị đầy đủ ${total} dòng`;
    }
  }
}

function toggleReportTableExpand() {
  isReportTableExpanded = !isReportTableExpanded;
  renderReportTable();
}

function renderMultiCharts() {
  charts.forEach(c => { try { c.destroy(); } catch (e) {} });
  charts = [];

  const cb0 = (analysisData?.category_breakdowns && analysisData.category_breakdowns[0]) || null;
  if (!cb0 || !cb0.items || !cb0.items.length) return;

  const labels = cb0.items.map(it => it.category);
  const sums = cb0.items.map(it => it.sum);
  const shares = cb0.items.map(it => it.share_pct);
  const metricCol = cb0.metric_col || 'Giá trị';

  const summary = analysisData?.before_after_summary || {};
  const primaryCol = (analysisData.primary_metric || metricCol || '').toLowerCase();
  const isMoney = ['revenue', 'doanh_thu', 'sales', 'amount', 'gia', 'price', 'luong', 'salary'].some(k => primaryCol.includes(k));
  const metricName = isMoney ? 'Doanh Thu' : (analysisData.primary_metric || metricCol || 'Chỉ Số');
  const currUnit = isMoney ? ' ₫' : '';
  const cleanSum = (summary.primary_sum_after !== undefined && summary.primary_sum_after !== null)
    ? summary.primary_sum_after
    : items_sum(cb0.items);
  const rawSum = (summary.primary_sum_before !== undefined && summary.primary_sum_before !== null)
    ? summary.primary_sum_before
    : cleanSum;

  function items_sum(its) { return (its || []).reduce((a, b) => a + (Number(b.sum) || 0), 0); }

  // Cập nhật nhãn tóm tắt chỉ số trên từng thẻ biểu đồ
  if ($('chart1Stat')) {
    $('chart1Stat').innerHTML = `Tổng ${metricName.toLowerCase()} sạch: <b>${fmt(cleanSum)}${currUnit}</b> · Gốc: <b>${fmt(rawSum)}${currUnit}</b>`;
  }
  if ($('chart2Stat')) {
    $('chart2Stat').innerHTML = `Cơ cấu phân bổ trên <b>${cb0.items.length}</b> phân khúc · Tổng: <b>${fmt(cleanSum)}${currUnit}</b>`;
  }
  if ($('chart3Stat')) {
    const ts = analysisData?.time_series;
    if (ts && ts.has_time_series && ts.values && ts.values.length) {
      const peakVal = Math.max(...ts.values);
      $('chart3Stat').innerHTML = `${ts.labels.length} mốc chuỗi thời gian · Đỉnh ${metricName.toLowerCase()}: <b>${fmt(peakVal)}${currUnit}</b>`;
    } else {
      $('chart3Stat').innerHTML = `Tiến trình tích lũy <b>${cb0.items.length}</b> phân khúc · Đạt: <b>${fmt(cleanSum)}${currUnit}</b>`;
    }
  }
  if ($('chart4Stat')) {
    const hInit = initialProfileData?.health_score?.overall || 0;
    const hClean = lastCleaningReport?.health_after?.overall || 100;
    const hDelta = Math.round((hClean - hInit) * 10) / 10;
    $('chart4Stat').innerHTML = `Độ sạch &amp; tin cậy: <b>${hClean}/100</b> (Gốc: ${hInit}/100 · ${hDelta >= 0 ? `+${hDelta}` : hDelta} điểm)`;
  }

  // 1. BIỂU ĐỒ CỘT KÉP ĐỐI CHIẾU TRƯỚC VS SAU LÀM SẠCH (GROUPED BAR CHART)
  const elMargin = $('marginChart');
  if (elMargin) {
    const dataBefore = cb0.items.map(it => it.metric_value_before ?? it.sum_before ?? it.metric_value ?? it.sum);
    const dataAfter = cb0.items.map(it => it.metric_value ?? it.sum);

    charts.push(new Chart(elMargin, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Chưa làm sạch (Dữ liệu gốc)',
            data: dataBefore,
            backgroundColor: 'rgba(255, 175, 204, 0.75)',
            borderColor: '#ffafcc',
            borderWidth: 1.5,
            borderRadius: 6,
            barThickness: 15
          },
          {
            label: 'Đã làm sạch (Chuẩn hóa)',
            data: dataAfter,
            backgroundColor: 'rgba(162, 210, 255, 0.9)',
            borderColor: '#3b7db8',
            borderWidth: 1.5,
            borderRadius: 6,
            barThickness: 15
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { color: '#f3e5f8' },
            ticks: { color: '#4a355b', callback: v => fmtS(v) + currUnit }
          },
          y: {
            grid: { display: false },
            ticks: { color: '#2b1d38', font: { weight: '600' } }
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              boxWidth: 14,
              padding: 10,
              color: '#2b1d38',
              font: { size: 11, weight: '600' }
            }
          },
          tooltip: {
            callbacks: {
              label: c => {
                const it = cb0.items[c.dataIndex] || {};
                const isBefore = c.datasetIndex === 0;
                const cnt = isBefore ? (it.count_before ?? it.count) : it.count;
                return ` ${c.dataset.label}: ${fmt(c.raw)}${currUnit} (${fmt(cnt)} dòng)`;
              }
            }
          }
        }
      }
    }));
  }

  // 2. BIỂU ĐỒ DONUT CƠ CẤU TỶ TRỌNG
  const elRev = $('revenueChart');
  if (elRev) {
    charts.push(new Chart(elRev, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: shares,
          backgroundColor: labels.map((_, i) => colStyle(i).hex),
          borderWidth: 2,
          borderColor: '#ffffff',
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 14, padding: 12, color: '#2b1d38', font: { size: 11, weight: '500' } } },
          tooltip: {
            callbacks: {
              label: c => {
                const it = cb0.items[c.dataIndex] || {};
                const beforeCnt = it.count_before ? ` (Gốc: ${fmt(it.count_before)} dòng)` : '';
                return ` ${c.label}: ${c.raw}% · ${fmt(it.sum)}${currUnit} (${fmt(it.count)} dòng sạch${beforeCnt})`;
              }
            }
          }
        }
      }
    }));
  }

  // 3. BIỂU ĐỒ VÙNG (AREA / LINE)
  const elTrend = $('trendChart');
  if (elTrend) {
    const ts = analysisData?.time_series;
    let trendLabels = [];
    let trendValues = [];
    let chartMetricName = metricName;

    if (ts && ts.has_time_series && ts.labels && ts.labels.length > 1) {
      $('trendChartTitle').textContent = `3. Xu hướng Chuỗi Thời gian: ${esc(ts.metric_col)} theo ${esc(ts.date_col)} (${esc(ts.aggregation)})`;
      trendLabels = ts.labels;
      trendValues = ts.values;
      chartMetricName = `${ts.aggregation} ${ts.metric_col}`;
    } else {
      $('trendChartTitle').textContent = `3. Tiến trình Tích lũy Doanh số / Chỉ số theo Phân khúc (${esc(metricName)})`;
      trendLabels = labels;
      let acc = 0;
      trendValues = sums.map(v => { acc += (Number(v) || 0); return Math.round(acc * 100) / 100; });
      chartMetricName = `Tích lũy ${metricName}`;
    }

    charts.push(new Chart(elTrend, {
      type: 'line',
      data: {
        labels: trendLabels,
        datasets: [{
          label: chartMetricName,
          data: trendValues,
          fill: true,
          backgroundColor: 'rgba(189, 224, 254, 0.45)',
          borderColor: '#ffafcc',
          borderWidth: 2.5,
          tension: 0.35,
          pointBackgroundColor: '#cdb4db',
          pointBorderColor: '#2b1d38',
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { color: '#f3e5f8' }, ticks: { color: '#4a355b', maxRotation: 45 } },
          y: { grid: { color: '#f3e5f8' }, ticks: { color: '#4a355b', callback: v => fmtS(v) + currUnit } }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => ` ${chartMetricName}: ${fmt(c.raw)}${currUnit}` } }
        }
      }
    }));
  }

  // 4. BIỂU ĐỒ CỘT NGANG (HORIZONTAL BAR) - XẾP HẠNG TOP PHÂN KHÚC (KHÔNG DÙNG RADAR LẠ)
  const elHBar = $('horizontalBarChart');
  if (elHBar) {
    if ($('chart4Stat')) {
      $('chart4Stat').innerHTML = `Xếp hạng <b>${Math.min(labels.length, 8)}</b> phân khúc dẫn đầu theo ${metricName.toLowerCase()}`;
    }
    charts.push(new Chart(elHBar, {
      type: 'bar',
      data: {
        labels: labels.slice(0, 8),
        datasets: [{
          label: `${metricName} (${currUnit.trim() || 'đơn vị'})`,
          data: sums.slice(0, 8),
          backgroundColor: [
            'rgba(255, 175, 204, 0.85)',
            'rgba(162, 210, 255, 0.85)',
            'rgba(205, 180, 219, 0.85)',
            'rgba(255, 200, 221, 0.85)',
            'rgba(189, 224, 254, 0.85)',
            'rgba(181, 148, 204, 0.85)',
            'rgba(247, 182, 210, 0.85)',
            'rgba(141, 198, 255, 0.85)'
          ],
          borderColor: '#2b1d38',
          borderWidth: 1.2,
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${metricName}: ${fmt(ctx.raw)}${currUnit}`
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(205, 180, 219, 0.2)' },
            ticks: { callback: v => fmtS(v) }
          },
          y: {
            grid: { display: false },
            ticks: { font: { weight: '600' } }
          }
        }
      }
    }));
  }

  // 5. BIỂU ĐỒ CỘT ĐỨNG KÉP: SO SÁNH SỐ LƯỢNG BẢN GHI (GỐC VS SẠCH) THEO PHÂN KHÚC
  const elCount = $('countCompareChart');
  if (elCount) {
    const countsClean = cb0.items.slice(0, 8).map(it => Number(it.count || 0));
    const countsRaw = cb0.items.slice(0, 8).map(it => Number(it.count_before ?? it.count ?? 0));
    const totalCleanCnt = countsClean.reduce((a, b) => a + b, 0);
    const totalRawCnt = countsRaw.reduce((a, b) => a + b, 0);
    if ($('chart5Stat')) {
      $('chart5Stat').innerHTML = `Tổng bản ghi sạch: <b>${fmt(totalCleanCnt)}</b> · Trước làm sạch: <b>${fmt(totalRawCnt)}</b>`;
    }
    charts.push(new Chart(elCount, {
      type: 'bar',
      data: {
        labels: labels.slice(0, 8),
        datasets: [
          {
            label: 'Số dòng gốc (Chưa làm sạch)',
            data: countsRaw,
            backgroundColor: 'rgba(205, 180, 219, 0.72)',
            borderColor: '#7c5c96',
            borderWidth: 1.2,
            borderRadius: 5
          },
          {
            label: 'Số dòng sạch (Đã chuẩn hóa)',
            data: countsClean,
            backgroundColor: 'rgba(162, 210, 255, 0.88)',
            borderColor: '#1d4e78',
            borderWidth: 1.2,
            borderRadius: 5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12, color: '#2b1d38' } },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)} dòng`
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#2b1d38', font: { size: 11 } } },
          y: { beginAtZero: true, grid: { color: 'rgba(205, 180, 219, 0.2)' }, ticks: { precision: 0 } }
        }
      }
    }));
  }

  // 6. BIỂU ĐỒ KẾT HỢP CỘT & ĐƯỜNG: PHÂN TÍCH PARETO 80/20 (GIÁ TRỊ & TỶ LỆ TÍCH LŨY %)
  const elPareto = $('paretoChart');
  if (elPareto) {
    const pItems = cb0.items.slice(0, 8);
    const pLabels = pItems.map(it => it.category);
    const pVals = pItems.map(it => Number(it.sum || 0));
    const totalSumForPareto = Math.max(cb0.items.reduce((a, b) => a + Number(b.sum || 0), 0), 1e-6);
    let running = 0;
    const cumPct = pVals.map(v => {
      running += v;
      return Number(Math.min(100, (running / totalSumForPareto) * 100).toFixed(1));
    });
    const top2Share = cumPct.length >= 2 ? cumPct[1] : (cumPct[0] || 0);
    if ($('chart6Stat')) {
      $('chart6Stat').innerHTML = `Top 2 phân khúc đầu tiên chiếm <b>${top2Share}%</b> tổng ${metricName.toLowerCase()}`;
    }
    charts.push(new Chart(elPareto, {
      data: {
        labels: pLabels,
        datasets: [
          {
            type: 'bar',
            label: `${metricName} (${currUnit.trim() || 'đơn vị'})`,
            data: pVals,
            backgroundColor: 'rgba(255, 175, 204, 0.82)',
            borderColor: '#b52b65',
            borderWidth: 1.2,
            borderRadius: 6,
            yAxisID: 'y'
          },
          {
            type: 'line',
            label: 'Tỷ lệ tích lũy (%)',
            data: cumPct,
            borderColor: '#1d4e78',
            backgroundColor: '#a2d2ff',
            borderWidth: 2.6,
            pointRadius: 4.5,
            pointBackgroundColor: '#ffffff',
            pointBorderColor: '#1d4e78',
            pointBorderWidth: 2,
            tension: 0.25,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12, color: '#2b1d38' } },
          tooltip: {
            callbacks: {
              label: ctx => ctx.dataset.yAxisID === 'y1'
                ? ` Tích lũy: ${ctx.raw}%`
                : ` ${metricName}: ${fmt(ctx.raw)}${currUnit}`
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#2b1d38', font: { size: 11 } } },
          y: {
            type: 'linear',
            position: 'left',
            beginAtZero: true,
            grid: { color: 'rgba(205, 180, 219, 0.2)' },
            ticks: { callback: v => fmtS(v) }
          },
          y1: {
            type: 'linear',
            position: 'right',
            min: 0,
            max: 100,
            grid: { drawOnChartArea: false },
            ticks: { callback: v => v + '%', color: '#1d4e78' }
          }
        }
      }
    }));
  }

  // 7. BIỂU ĐỒ CỘT KÉP: ĐỐI CHIẾU TRUNG BÌNH (MEAN) VS TRUNG VỊ (MEDIAN) THEO PHÂN KHÚC
  const elMM = $('meanMedianChart');
  if (elMM) {
    const mmItems = cb0.items.slice(0, 8);
    const mmLabels = mmItems.map(it => it.category);
    const mmMeans = mmItems.map(it => Number(it.mean || 0));
    const mmMedians = mmItems.map(it => Number(it.median || 0));
    if ($('chart7Stat')) {
      $('chart7Stat').innerHTML = `So sánh độ ổn định phân phối giữa <b>Mean</b> và <b>Median</b> trên ${mmItems.length} phân khúc`;
    }
    charts.push(new Chart(elMM, {
      type: 'bar',
      data: {
        labels: mmLabels,
        datasets: [
          {
            label: 'Trung bình (Mean)',
            data: mmMeans,
            backgroundColor: 'rgba(255, 200, 221, 0.9)',
            borderColor: '#b52b65',
            borderWidth: 1.2,
            borderRadius: 5
          },
          {
            label: 'Trung vị (Median)',
            data: mmMedians,
            backgroundColor: 'rgba(189, 224, 254, 0.92)',
            borderColor: '#1d4e78',
            borderWidth: 1.2,
            borderRadius: 5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12, color: '#2b1d38' } },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${fmtDec(ctx.raw)}${currUnit}`
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#2b1d38', font: { size: 11 } } },
          y: { beginAtZero: true, grid: { color: 'rgba(205, 180, 219, 0.2)' }, ticks: { callback: v => fmtS(v) } }
        }
      }
    }));
  }

  // 8. BIỂU ĐỒ CỘT NGANG ĐỐI CHIẾU: CẢI THIỆN MỨC ĐỘ SẠCH DỮ LIỆU (TRƯỚC VS SAU)
  const elQual = $('qualityCompareChart');
  if (elQual) {
    const hInit = initialProfileData?.health_score || {};
    const hClean = lastCleaningReport?.health_after || {};
    const beforeScore = Number(hInit.overall ?? 0);
    const afterScore = Number(hClean.overall ?? 98);
    if ($('chart8Stat')) {
      $('chart8Stat').innerHTML = `Mức độ sạch tăng từ <b>${beforeScore}/100</b> ➔ <b>${afterScore}/100</b> (+${(afterScore - beforeScore).toFixed(1)} điểm)`;
    }
    charts.push(new Chart(elQual, {
      type: 'bar',
      data: {
        labels: [
          'Đầy đủ (Không trống ô)',
          'Không trùng lặp bản ghi',
          'Đúng định dạng chuẩn',
          'Giá trị hợp lý (Không lỗi)',
          'Mức độ sạch tổng thể'
        ],
        datasets: [
          {
            label: 'Trước làm sạch (Gốc)',
            data: [
              Number(hInit.completeness ?? 0),
              Number(hInit.uniqueness ?? 0),
              Number(hInit.consistency ?? 0),
              Number(hInit.validity ?? 0),
              beforeScore
            ],
            backgroundColor: 'rgba(255, 175, 204, 0.8)',
            borderColor: '#b52b65',
            borderWidth: 1.2,
            borderRadius: 5
          },
          {
            label: 'Sau làm sạch (Đã duyệt)',
            data: [
              Number(hClean.completeness ?? 98),
              Number(hClean.uniqueness ?? 100),
              Number(hClean.consistency ?? 98),
              Number(hClean.validity ?? 98),
              afterScore
            ],
            backgroundColor: 'rgba(162, 210, 255, 0.9)',
            borderColor: '#1d4e78',
            borderWidth: 1.2,
            borderRadius: 5
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12, color: '#2b1d38' } },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${ctx.raw}/100 điểm`
            }
          }
        },
        scales: {
          x: { min: 0, max: 100, grid: { color: 'rgba(205, 180, 219, 0.2)' }, ticks: { callback: v => v + 'đ' } },
          y: { grid: { display: false }, ticks: { font: { weight: '600', size: 11 }, color: '#2b1d38' } }
        }
      }
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SINH GIẢI THÍCH & CHÚ THÍCH CHI TIẾT DƯỚI MỖI BIỂU ĐỒ (1 ĐẾN 8)
  // ═══════════════════════════════════════════════════════════════════════════
  const setExplain = (id, explainText, noteText) => {
    const el = $(id);
    if (!el) return;
    el.innerHTML = `
      <div class="ce-row"><span class="ce-tag">📖 Giải thích:</span> ${explainText}</div>
      <div class="ce-row ce-note"><span class="ce-tag">🏷️ Chú thích:</span> ${noteText}</div>
    `;
  };

  const top1 = cb0.items[0] || { category: 'N/A', sum: 0, share_pct: 0, mean: 0, median: 0 };
  const top2 = cb0.items[1] || null;
  const bottom1 = cb0.items[cb0.items.length - 1] || top1;
  const diffCleanRaw = rawSum - cleanSum;
  const diffPhrase = diffCleanRaw > 0
    ? `giảm <b>${fmt(diffCleanRaw)}${currUnit}</b> sau khi loại bỏ trùng lặp và giá trị bất thường`
    : (diffCleanRaw < 0 ? `tăng thêm <b>${fmt(Math.abs(diffCleanRaw))}${currUnit}</b> sau khi điền khuyết và chuẩn hóa` : 'giữ nguyên độ chính xác 100%');

  // Giải thích & Chú thích Biểu đồ 1
  setExplain(
    'chart1Explain',
    `Đối chiếu tổng <b>${esc(metricName)}</b> giữa dữ liệu gốc và dữ liệu đã làm sạch theo từng nhóm <b>${esc(cb0.category_col)}</b>. Tổng giá trị sạch đạt <b>${fmt(cleanSum)}${currUnit}</b> (${diffPhrase}); phân khúc dẫn đầu là <b>${esc(top1.category)}</b> đạt <b>${fmt(top1.sum)}${currUnit}</b>.`,
    `Cột màu tím nhạt = Dữ liệu gốc chưa làm sạch · Cột màu hồng = Dữ liệu sạch đã chuẩn hóa · Trục đứng = Tổng giá trị · Trục ngang = Các phân khúc.`
  );

  // Giải thích & Chú thích Biểu đồ 2
  setExplain(
    'chart2Explain',
    `Hiển thị cơ cấu tỷ trọng đóng góp (%) của <b>${cb0.items.length}</b> phân khúc vào tổng ${esc(metricName.toLowerCase())}. Nhóm <b>${esc(top1.category)}</b> chiếm tỷ trọng lớn nhất (<b>${top1.share_pct}%</b>), trong khi nhóm thấp nhất là <b>${esc(bottom1.category)}</b> (<b>${bottom1.share_pct}%</b>).`,
    `Mỗi mảng màu tương ứng với 1 phân khúc có độ rộng tỷ lệ thuận với % đóng góp · Di chuột vào từng phần để xem giá trị tuyệt đối và tỷ lệ chi tiết.`
  );

  // Giải thích & Chú thích Biểu đồ 3
  const tsObj = analysisData?.time_series;
  if (tsObj && tsObj.has_time_series && tsObj.values && tsObj.values.length) {
    const peakVal = Math.max(...tsObj.values);
    const peakIdx = tsObj.values.indexOf(peakVal);
    const peakLbl = tsObj.labels[peakIdx] || '';
    setExplain(
      'chart3Explain',
      `Theo dõi diễn biến xu hướng <b>${esc(metricName)}</b> qua <b>${tsObj.labels.length}</b> mốc thời gian. Giá trị đạt đỉnh cao nhất là <b>${fmt(peakVal)}${currUnit}</b> tại mốc <b>${esc(peakLbl)}</b>, giúp nhận diện chu kỳ tăng trưởng hoặc mùa vụ.`,
      `Đường viền & vùng tô màu = Xu hướng biến động theo thời gian · Trục ngang = Các mốc thời gian · Trục đứng = Giá trị ${esc(metricName.toLowerCase())}.`
    );
  } else {
    setExplain(
      'chart3Explain',
      `Minh họa đường cộng dồn tích lũy <b>${esc(metricName)}</b> qua <b>${cb0.items.length}</b> phân khúc, chạm mức tổng <b>${fmt(cleanSum)}${currUnit}</b>. Độ dốc càng lớn cho thấy phân khúc đó đóng góp bước nhảy giá trị càng mạnh.`,
      `Đường biểu diễn = Tổng giá trị tích lũy cộng dồn · Mỗi điểm tròn = 1 phân khúc dữ liệu xếp theo thứ tự.`
    );
  }

  // Giải thích & Chú thích Biểu đồ 4
  const top2Text = top2 ? `, theo sau là <b>${esc(top2.category)}</b> (<b>${fmt(top2.sum)}${currUnit}</b>)` : '';
  setExplain(
    'chart4Explain',
    `Xếp hạng trực quan các phân khúc từ cao xuống thấp để nhận diện nhóm đóng góp chủ lực. Đứng đầu bảng là <b>${esc(top1.category)}</b> với <b>${fmt(top1.sum)}${currUnit}</b>${top2Text}.`,
    `Thanh ngang càng dài thể hiện quy mô giá trị càng lớn · Trục ngang = Giá trị ${esc(metricName.toLowerCase())} sạch · Trục dọc = Tên phân khúc xếp hạng.`
  );

  // Giải thích & Chú thích Biểu đồ 5
  const cntCleanSum = cb0.items.reduce((a, b) => a + Number(b.count || 0), 0);
  const cntRawSum = cb0.items.reduce((a, b) => a + Number(b.count_before ?? b.count ?? 0), 0);
  const cntDropped = Math.max(0, cntRawSum - cntCleanSum);
  setExplain(
    'chart5Explain',
    `So sánh số lượng bản ghi (đơn hàng/hồ sơ) trước và sau khi AI lọc trùng lặp. Hệ thống đã chuẩn hóa từ <b>${fmt(cntRawSum)}</b> dòng gốc còn <b>${fmt(cntCleanSum)}</b> dòng sạch hợp lệ (loại bỏ <b>${fmt(cntDropped)}</b> dòng trùng/lỗi).`,
    `Cột màu tím = Số lượng bản ghi gốc ban đầu · Cột màu xanh dương = Số bản ghi sạch sau xử lý · Trục đứng = Số lượng dòng dữ liệu.`
  );

  // Giải thích & Chú thích Biểu đồ 6
  const pTot = Math.max(cb0.items.reduce((a, b) => a + Number(b.sum || 0), 0), 1e-6);
  const top2Sum = Number(top1.sum || 0) + (top2 ? Number(top2.sum || 0) : 0);
  const top2Pct = Math.min(100, (top2Sum / pTot) * 100).toFixed(1);
  setExplain(
    'chart6Explain',
    `Áp dụng nguyên tắc <b>Pareto 80/20</b> để tìm ra nhóm thiểu số tạo ra đa số giá trị. Chỉ riêng 2 nhóm dẫn đầu (<b>${esc(top1.category)}</b>${top2 ? ` & <b>${esc(top2.category)}</b>` : ''}) đã đóng góp tới <b>${top2Pct}%</b> tổng ${esc(metricName.toLowerCase())}.`,
    `Cột màu hồng (trục trái) = Giá trị riêng từng phân khúc · Đường màu xanh đậm (trục phải 0%–100%) = Tỷ lệ % tích lũy cộng dồn.`
  );

  // Giải thích & Chú thích Biểu đồ 7
  const skewNote = Math.abs(Number(top1.mean || 0) - Number(top1.median || 0)) > (Number(top1.median || 1) * 0.25)
    ? `Tại nhóm <b>${esc(top1.category)}</b>, có sự chênh lệch rõ giữa Mean (${fmtDec(top1.mean)}${currUnit}) và Median (${fmtDec(top1.median)}${currUnit}), cho thấy tồn tại các giao dịch giá trị đột biến.`
    : `Tại nhóm <b>${esc(top1.category)}</b>, Mean (${fmtDec(top1.mean)}${currUnit}) và Median (${fmtDec(top1.median)}${currUnit}) khá cân bằng, chứng tỏ dữ liệu phân bổ đồng đều.`;
  setExplain(
    'chart7Explain',
    `Đánh giá độ đồng đều phân phối bên trong từng phân khúc thông qua đối chiếu Trung bình (Mean) và Trung vị (Median). ${skewNote}`,
    `Cột màu hồng nhạt = Giá trị Trung bình (Mean) · Cột màu xanh nhạt = Giá trị Trung vị (Median — mức giữa phân khúc).`
  );

  // Giải thích & Chú thích Biểu đồ 8
  const hB = Number(initialProfileData?.health_score?.overall ?? 0);
  const hA = Number(lastCleaningReport?.health_after?.overall ?? 98);
  setExplain(
    'chart8Explain',
    `Đo lường trực tiếp mức độ cải thiện chất lượng dữ liệu sau khi áp dụng quy tắc làm sạch AI. Mức độ sạch tổng thể tăng từ <b>${hB}/100</b> lên <b>${hA}/100</b> (+<b>${(hA - hB).toFixed(1)}</b> điểm), giảm thiểu tối đa rủi ro sai số báo cáo.`,
    `Thanh màu hồng = Điểm chất lượng trước làm sạch (thang 0–100) · Thanh màu xanh dương = Điểm chất lượng sau khi làm sạch và được phê duyệt.`
  );
}

function toggleDirectEditReport() {
  const iframe = $('html-report-iframe');
  if (!iframe || !iframe.contentDocument) return;
  isLiveEditEnabled = !isLiveEditEnabled;
  iframe.contentDocument.body.contentEditable = isLiveEditEnabled ? 'true' : 'false';
  iframe.contentDocument.body.style.outline = isLiveEditEnabled ? '3px dashed #ffafcc' : 'none';
  $('btnLiveEdit').textContent = isLiveEditEnabled ? '💾 Lưu chỉnh sửa báo cáo' : '✏️ Sửa trực tiếp trên báo cáo';
  if (!isLiveEditEnabled && iframe.contentDocument.documentElement) {
    currentHtmlReport = '<!DOCTYPE html>\n' + iframe.contentDocument.documentElement.outerHTML;
    showToast('Đã lưu nội dung', 'Các thay đổi trực tiếp trên báo cáo HTML đã được ghi nhận!', 'success');
  }
}

function syncEditedHtml() {
  const iframe = $('html-report-iframe');
  if (iframe && iframe.contentDocument && iframe.contentDocument.documentElement) {
    currentHtmlReport = '<!DOCTYPE html>\n' + iframe.contentDocument.documentElement.outerHTML;
  }
}

function printHtmlReport() {
  const iframe = $('html-report-iframe');
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  }
}

function copyHtmlSource() {
  syncEditedHtml();
  navigator.clipboard.writeText(currentHtmlReport).then(() => {
    showToast('Thành công', 'Đã sao chép toàn bộ mã nguồn HTML vào Clipboard!', 'success');
  }).catch(() => {
    showToast('Lỗi', 'Không thể sao chép tự động. Trình duyệt có thể đã chặn Clipboard API.', 'error');
  });
}

function downloadCleanedCSV() {
  if (!currentSessionId) return;
  window.location.href = `/api/download-csv?session_id=${encodeURIComponent(currentSessionId)}`;
  showToast('Đang tải xuống', 'File CSV dữ liệu sạch đang được tải về máy của bạn.', 'info');
}

function downloadStandaloneHTML() {
  syncEditedHtml();
  if (!currentHtmlReport) return;
  const blob = new Blob([currentHtmlReport], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const cleanBase = currentDatasetName ? currentDatasetName.replace(/\.[^/.]+$/, '') : 'Dataset';
  a.download = `Bao_Cao_Phan_Tich_${cleanBase}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Đã xuất báo cáo', 'File HTML độc lập đã được lưu về máy!', 'success');
}

/* ═══════════════════════════════════════════════════════════════════════════
   KHỞI TẠO ỨNG DỤNG KHI TẢI TRANG
   ═══════════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  renderStepper();
  checkAuth();
  initNavigation();
  initScrollReveal();
  updateSystemStatus('ready');
});
