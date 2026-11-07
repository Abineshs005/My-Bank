const $ = (s, r = document) => r.querySelector(s);
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }, set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };
const users = () => store.get('mb_users', []);
/* Login lasts only for this browser tab/session, so opening the site again always starts at the login page. */
const sess = { get: () => { try { return JSON.parse(sessionStorage.getItem('mb_session')) } catch { return null } }, set: v => sessionStorage.setItem('mb_session', JSON.stringify(v)), clear: () => sessionStorage.removeItem('mb_session') };
localStorage.removeItem('mb_session');
const me = () => users().find(u => u.email === sess.get());
/* First page opened in a new browser session: show the login page (unless already on login/signup). */
(() => { const pg = location.pathname.split('/').pop() || 'index.html';
  if (!sessionStorage.getItem('mb_opened')) { sessionStorage.setItem('mb_opened', '1'); if (!sess.get() && pg !== 'login.html' && pg !== 'signup.html') location.replace('login.html') } })();
const norm = e => String(e || '').trim().toLowerCase();
/* Create an account. Returns 'ok', 'exists' (email used), 'taken' (username used) or 'fail' (storage blocked). Saved, then read back to confirm. */
function register(d) {
  const all = users(), email = norm(d.email), username = norm(d.username);
  if (all.some(u => u.email === email)) return 'exists';
  if (all.some(u => u.username === username)) return 'taken';
  all.push({ ...d, email, username });
  try { store.set('mb_users', all) } catch { return 'fail' }
  return users().some(u => u.email === email) ? 'ok' : 'fail';
}
/* Check login. ID can be username, email or full name (case-insensitive). Several accounts may share a name, so the password picks the right one. */
function authenticate(id, pw) {
  const k = norm(id);
  const c = users().filter(x => x.email === k || (x.username && x.username === k) || norm(x.name) === k);
  if (!c.length) return { error: `No account found for "${id.trim()}". Check the spelling, or create an account first.` };
  const u = c.find(x => x.password === pw);
  if (!u) return { error: 'Wrong password. Try again.' };
  return { user: u };
}
const save = u => store.set('mb_users', users().map(x => x.email === u.email ? u : x));
const money = n => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const page = location.pathname.split('/').pop() || 'index.html';
function toast(m, ok = true) { const t = document.createElement('div'); t.className = 'toast ' + (ok ? 'ok' : 'bad'); t.setAttribute('role', 'status'); t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 3000) }
function say(el, m, ok) { el.textContent = m; el.className = 'msg ' + (ok ? 'ok' : 'bad') }

/* ===== Shared helpers ===== */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const digits = s => String(s || '').replace(/\D/g, '');
const IFSC = 'MYBK0001234';
const upiOf = x => `${x.username || norm(x.name).replace(/\W+/g, '')}@mybank`;
const inr0 = n => '₹' + Math.round(n).toLocaleString('en-IN');
/* Add a notification to a user object. The caller saves the user. */
function notify(user, title, text, icon = 'fa-bell') {
  user.notes = user.notes || [];
  user.notes.push({ id: Date.now() + Math.random(), ts: Date.now(), title, text, icon, read: false });
  if (user.notes.length > 100) user.notes.shift();
}
const unread = u => (u && u.notes ? u.notes.filter(n => !n.read).length : 0);
function refreshBell() { const u = me(), b = $('#bellN'); if (b) { const n = unread(u); b.textContent = n; b.hidden = !n } }

/* ===== Dark mode ===== */
const theme = {
  get: () => document.documentElement.dataset.theme || 'light',
  set(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem('mb_theme', t) } catch { } const i = $('#theme i'); if (i) i.className = 'fa-solid ' + (t === 'dark' ? 'fa-sun' : 'fa-moon') }
};

/* ===== EMI + FD calculators (used on calculators.html and in the dashboard) ===== */
const emi = (P, rate, n) => { const r = rate / 1200; return r ? P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1) : P / n };
function calcInit(sel) {
  const root = $(sel); if (!root) return;
  root.innerHTML = `<div class="calcgrid">
  <div class="panel"><h3><i class="fa-solid fa-calculator"></i> EMI calculator</h3>
    <label class="lbl" for="eP">Loan amount: <b id="ePv"></b></label><input type="range" id="eP" min="10000" max="10000000" step="10000" value="500000">
    <label class="lbl" for="eR">Interest rate (% per year): <b id="eRv"></b></label><input type="range" id="eR" min="5" max="24" step="0.1" value="10.5">
    <label class="lbl" for="eN">Tenure (months): <b id="eNv"></b></label><input type="range" id="eN" min="6" max="360" step="6" value="60">
    <div class="res"><div>Monthly EMI<span class="big" id="eE"></span></div><div>Total interest<b id="eI"></b></div><div>Total payable<b id="eT"></b></div></div>
    <div class="bar" aria-hidden="true"><span id="eB1" style="background:var(--p2)"></span><span id="eB2" style="background:var(--a)"></span></div>
    <small class="muted">Blue: principal · Yellow: interest</small></div>
  <div class="panel"><h3><i class="fa-solid fa-piggy-bank"></i> Fixed deposit calculator</h3>
    <label class="lbl" for="fP">Deposit amount: <b id="fPv"></b></label><input type="range" id="fP" min="1000" max="10000000" step="1000" value="100000">
    <label class="lbl" for="fR">Interest rate (% per year): <b id="fRv"></b></label><input type="range" id="fR" min="3" max="9" step="0.05" value="6.8">
    <label class="lbl" for="fN">Tenure (years): <b id="fNv"></b></label><input type="range" id="fN" min="1" max="10" step="0.5" value="5">
    <label class="check"><input type="checkbox" id="fS"> Senior citizen (+0.5% interest)</label>
    <div class="res"><div>Maturity amount<span class="big" id="fM"></span></div><div>Interest earned<b id="fI"></b></div><div>Effective rate<b id="fE"></b></div></div>
    <div class="bar" aria-hidden="true"><span id="fB1" style="background:var(--p2)"></span><span id="fB2" style="background:var(--ok)"></span></div>
    <small class="muted">Blue: deposit · Green: interest. Interest is compounded quarterly.</small></div></div>`;
  const g = id => $('#' + id, root), v = id => Number(g(id).value);
  const run = () => {
    const P = v('eP'), R = v('eR'), N = v('eN'), E = emi(P, R, N), T = E * N;
    g('ePv').textContent = inr0(P); g('eRv').textContent = R + '%'; g('eNv').textContent = N + ' (' + (N / 12).toFixed(1) + ' yrs)';
    g('eE').textContent = inr0(E); g('eI').textContent = inr0(T - P); g('eT').textContent = inr0(T);
    g('eB1').style.width = P / T * 100 + '%'; g('eB2').style.width = (T - P) / T * 100 + '%';
    const fp = v('fP'), fr = v('fR') + (g('fS').checked ? 0.5 : 0), fn = v('fN'), M = fp * Math.pow(1 + fr / 400, 4 * fn);
    g('fPv').textContent = inr0(fp); g('fRv').textContent = fr.toFixed(2) + '%'; g('fNv').textContent = fn + ' yrs';
    g('fM').textContent = inr0(M); g('fI').textContent = inr0(M - fp); g('fE').textContent = ((Math.pow(1 + fr / 400, 4) - 1) * 100).toFixed(2) + '% a year';
    g('fB1').style.width = fp / M * 100 + '%'; g('fB2').style.width = (M - fp) / M * 100 + '%';
  };
  root.querySelectorAll('input').forEach(i => i.oninput = run); run();
}

function layout() {
  const u = me(), L = [['index.html', 'Home'], ['services.html', 'Services'], ['calculators.html', 'Calculators'], ['about.html', 'About'], ['contact.html', 'Contact']];
  const a = (h, t) => `<a href="${h}" class="${h === page ? 'active' : ''}">${t}</a>`;
  $('#hdr').innerHTML = `<header><a class="logo" href="index.html"><i class="fa-solid fa-building-columns"></i>MyBank</a>
  <button id="menu" aria-label="Open menu" aria-expanded="false"><i class="fa-solid fa-bars"></i></button>
  <nav id="nav">${L.map(x => a(...x)).join('')}${u ? a('dashboard.html', 'Dashboard') + `<a href="dashboard.html#notif" class="bell hbtn" aria-label="Notifications"><i class="fa-regular fa-bell"></i><span class="badge" id="bellN" hidden></span></a>` + '<a href="#" id="out" class="cta-btn">Logout</a>' : '<a href="login.html" class="cta-btn">Login</a>'}<button type="button" id="theme" class="hbtn" aria-label="Toggle dark mode"><i class="fa-solid fa-moon"></i></button></nav></header>`;
  $('#theme').onclick = () => theme.set(theme.get() === 'dark' ? 'light' : 'dark'); theme.set(theme.get()); refreshBell();
  $('#ftr').innerHTML = '<p>© 2026 MyBank. All rights reserved.</p>';
  $('#menu').onclick = e => { const o = $('#nav').classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', o) };
  document.querySelectorAll('[data-open]').forEach(el => { if (u) { el.href = 'dashboard.html'; el.textContent = 'Go to dashboard' } });
  if ($('#out')) $('#out').onclick = e => { e.preventDefault(); sess.clear(); location = 'login.html' };
}

document.addEventListener('click', e => {
  const b = e.target.closest('.eye'); if (!b) return;
  const i = b.parentElement.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password';
  b.innerHTML = `<i class="fa-solid fa-eye${i.type === 'password' ? '' : '-slash'}"></i>`;
});

/* title, summary, features, facts (sample demo details, replace with real data) */
const SERVICES = {
  savings: ['Savings Account', 'Grow your money safely with interest paid on your balance.', ['No minimum balance', 'Free online transfers', 'Instant balance alerts'], [['Interest rate', 'Up to 4% a year'], ['Minimum age', '18 years'], ['Documents', 'ID proof and address proof']]],
  current: ['Current Account', 'Everyday banking built for businesses and professionals.', ['Unlimited transactions', 'Online access 24/7', 'Overdraft option'], [['Monthly fee', 'None for the first year'], ['Best for', 'Shops, startups, freelancers'], ['Documents', 'ID, address and business proof']]],
  personal: ['Personal Loan', 'Quick funds for study, travel, medical needs or any plan.', ['Decision in minutes', 'Low interest rates', 'No collateral needed'], [['Loan amount', 'Up to 500,000'], ['Interest rate', 'From 9% a year'], ['Repayment', '12 to 60 months']]],
  home: ['Home Loan', 'Finance the purchase or building of your home.', ['Long repayment terms', 'Affordable rates', 'Free eligibility check'], [['Loan amount', 'Up to 80% of property value'], ['Interest rate', 'From 7.5% a year'], ['Repayment', 'Up to 30 years']]],
  card: ['Credit Cards', 'Earn rewards on everyday spending with full control from the app.', ['Cashback on purchases', 'Travel benefits', 'Zero fraud liability'], [['Cashback', 'Up to 5%'], ['Annual fee', 'Waived on first year'], ['Credit limit', 'Based on your income']]],
  mobile: ['Mobile Banking', 'Do your banking from your phone, any time.', ['Pay bills instantly', 'Send money in seconds', 'Lock your card anytime'], [['Cost', 'Free for all customers'], ['Works on', 'Android and iOS'], ['Sign in with', 'Your MyBank login']]]
};
function initServices() {
  document.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
    const key = b.dataset.s, [t, d, l, f] = SERVICES[key], u = me(), m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = `<div role="dialog" aria-modal="true" aria-label="${t}"><h3>${t}</h3><p>${d}</p>
    <h4>Features</h4><ul>${l.map(x => `<li>${x}</li>`).join('')}</ul>
    <h4>Key details</h4><dl class="facts">${f.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    <p class="muted"><small>Sample details for this demo project.</small></p>
    <div class="row">${u ? '<button class="btn" id="apply">Apply now</button>' : '<a class="btn" href="signup.html">Open account</a>'}<button class="btn alt" id="x">Close</button></div></div>`;
    document.body.append(m); const close = () => m.remove();
    m.onclick = e => { if (e.target === m) close() }; $('#x', m).onclick = close; $('#x', m).focus();
    if (u) $('#apply', m).onclick = () => {
      u.requests = u.requests || [];
      if (u.requests.some(r => r.key === key)) toast('You already applied for this service.', false);
      else { u.requests.push({ key, title: t, date: new Date().toLocaleString() }); save(u); toast('Application sent for ' + t + '.') }
      close();
    };
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', k) } });
  });
}

function initLogin() {
  if (me()) return location.replace('dashboard.html');
  const last = sessionStorage.getItem('mb_last'); if (last) { $('#username').value = last; sessionStorage.removeItem('mb_last'); $('#password').focus() }
  $('#loginForm').onsubmit = e => {
    e.preventDefault();
    const r = authenticate($('#username').value, $('#password').value);
    if (r.error) return say($('#msg'), r.error, false);
    const u = r.user; notify(u, 'New login', 'You signed in on ' + new Date().toLocaleString('en-IN'), 'fa-right-to-bracket'); save(u);
    sess.set(u.email); say($('#msg'), 'Signed in. Redirecting…', true);
    setTimeout(() => location = 'dashboard.html', 500);
  };
}


/* Date of birth: three dropdowns (day / month / year) fill a hidden ISO date, so the format is never unclear. */
function initDob() {
  const d = $('#dobD'), m = $('#dobM'), y = $('#dobY'), h = $('#dob'); if (!d) return;
  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], yr = new Date().getFullYear();
  d.innerHTML = '<option value="">Day</option>' + Array.from({ length: 31 }, (_, i) => `<option>${i + 1}</option>`).join('');
  m.innerHTML = '<option value="">Month</option>' + MON.map((n, i) => `<option value="${i + 1}">${n}</option>`).join('');
  y.innerHTML = '<option value="">Year</option>' + Array.from({ length: 100 }, (_, i) => `<option>${yr - i}</option>`).join('');
  const set = () => { const D = +d.value, M = +m.value, Y = +y.value; const dt = new Date(Y, M - 1, D); h.value = D && M && Y && dt.getDate() === D && dt.getMonth() === M - 1 ? `${Y}-${String(M).padStart(2, '0')}-${String(D).padStart(2, '0')}` : '' };
  [d, m, y].forEach(e => e.onchange = set);
}
function initSignup() {
  initDob();
  if (me()) return location.replace('dashboard.html');
  const pw = $('#password');
  pw.oninput = () => {
    const v = pw.value, s = (v.length >= 8) + /[A-Z]/.test(v) + /\d/.test(v) + /[^\w]/.test(v);
    $('#strength').textContent = v ? ['Weak', 'Weak', 'Fair', 'Good', 'Strong'][s] + ' password. Use 8+ characters with a capital, number and symbol.' : '';
  };
  $('#signupForm').onsubmit = e => {
    e.preventDefault();
    const f = id => $('#' + id).value.trim(), bad = m => say($('#msg'), m, false);
    const email = f('email').toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/i.test(f('username'))) return bad('Username must be 3 to 20 letters, numbers or underscores.');
    if (!/^\d{10}$/.test(f('phone').replace(/\D/g, '').slice(-10))) return bad('Enter a valid 10-digit phone number.');
    if (!$('#dob').value) return bad('Select a valid date of birth.');
    if (new Date($('#dob').value) > new Date(Date.now() - 18 * 31557600000)) return bad('You must be 18 or older to open an account.');
    if (pw.value.length < 6) return bad('Password must be at least 6 characters.');
    if (pw.value !== $('#confirmPassword').value) return bad('Passwords do not match.');
    const res = register({ name: f('fullname'), username: f('username'), email, phone: f('phone'), dob: $('#dob').value, type: $('#accountType').selectedOptions[0].text, password: pw.value, acc: 'MB' + Math.floor(1e7 + Math.random() * 9e7), balance: 0, tx: [], address: '', beneficiaries: [], loans: [], notes: [{ id: Date.now(), ts: Date.now(), title: 'Welcome to MyBank', text: 'Your account is ready. Deposit money to get started.', icon: 'fa-hand-holding-heart', read: false }] });
    if (res === 'taken') return bad('This username is taken. Choose another.');
    if (res === 'exists') return bad('This email already has an account. Log in instead.');
    if (res === 'fail') return bad('Could not save your account. Allow browser storage, or open the site with a local server (e.g. VS Code Live Server).');
    sessionStorage.setItem('mb_last', f('username'));
    say($('#msg'), 'Account created. Redirecting to login…', true);
    setTimeout(() => location = 'login.html', 900);
  };
}

function initContact() {
  $('#contactForm').onsubmit = e => {
    e.preventDefault();
    const m = store.get('mb_messages', []); m.push({ at: Date.now(), name: e.target.elements[0].value }); store.set('mb_messages', m);
    e.target.reset(); toast('Message sent. We reply within one working day.');
  };
}

document.addEventListener('DOMContentLoaded', () => {
  layout();
  if ($('#loginForm')) initLogin();
  if ($('#signupForm')) initSignup();
  if ($('#dash')) initDash();
  if ($('#contactForm')) initContact();
  if ($('#calcs') && !$('#dash')) calcInit('#calcs');
  initServices();
});
