/* MyBank dashboard: every feature here is frontend only. Data lives in localStorage. */
const CREDIT = k => k === 'Deposit' || k === 'Received';
const tsOf = t => t.ts || Date.parse(t.date) || 0;
const fdate = t => t.ts ? new Date(t.ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : (t.date || '');
const txnId = () => 'MB' + Date.now().toString().slice(-8) + Math.floor(1000 + Math.random() * 9000);
const ICON = { Deposit: 'fa-circle-plus', Withdrawal: 'fa-building-columns', Sent: 'fa-paper-plane', Received: 'fa-arrow-down' };
const txTitle = t => ({ Deposit: 'Money deposited' + (t.src ? ' · ' + t.src : ''), Withdrawal: 'Withdrawn' + (t.dest ? ' · ' + t.dest : ''), Sent: 'Paid to ' + t.to, Received: 'Received from ' + t.from }[t.kind] || t.kind);
const catOf = t => t.cat || (t.kind === 'Withdrawal' ? 'Cash withdrawal' : 'Others');
const CATS = ['Food', 'Shopping', 'Bills', 'Travel', 'Rent', 'Health', 'Others'];
const COLORS = ['#4c8dff', '#ffb020', '#2fbf71', '#ef5350', '#9b6bff', '#26c6da', '#ff7ab6', '#8d99ae', '#c0ca33'];
const LOAN_RATE = { Personal: 10.5, Home: 8.5, Education: 9, Vehicle: 9.5, Gold: 8 };
const LIMIT = 100000;

function openModal(html, { dismiss = true, cls = '' } = {}) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div role="dialog" aria-modal="true" class="${cls}">${html}</div>`; document.body.append(m);
  const onKey = e => { if (e.key === 'Escape' && dismiss) close() };
  const close = () => { m.remove(); document.removeEventListener('keydown', onKey); if (m.onclose) m.onclose() };
  document.addEventListener('keydown', onKey); if (dismiss) m.onclick = e => { if (e.target === m) close() };
  return { m, box: m.firstElementChild, close };
}

function initDash() {
  let u = me(); if (!u) return location.replace('login.html');
  const sync = () => { u = me() || u; u.tx = u.tx || []; u.notes = u.notes || []; u.beneficiaries = u.beneficiaries || []; u.loans = u.loans || []; u.balance = Number(u.balance) || 0 };
  sync();
  const hashPin = p => btoa(p + ':' + u.acc);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const R2 = n => +Number(n).toFixed(2);

  /* ---------- who is being paid ---------- */
  function resolvePayee(input) {
    const v = norm(input).replace(/\s+/g, ''); if (!v) return { error: 'Enter who you want to pay.' };
    const d = digits(v), ten = d.length >= 10 ? d.slice(-10) : '';
    const hit = users().find(x => v === x.email || v === x.username || v === upiOf(x) || v === norm(x.acc) || (ten && /^[+\d]+$/.test(v) && digits(x.phone).slice(-10) === ten));
    if (hit) return hit.email === u.email ? { error: 'You cannot send money to yourself.' } : { type: 'internal', user: hit, name: hit.name, key: upiOf(hit) };
    if (/@mybank$/.test(v)) return { error: 'No MyBank account found for this UPI ID.' };
    if (/^[a-z0-9._-]{2,}@[a-z][a-z0-9]{1,}$/i.test(v)) return { type: 'upi', name: v.split('@')[0], key: v };
    if (/^(\+?91)?\d{10}$/.test(v)) return { type: 'mobile', name: '+91 ' + d.slice(-10), key: d.slice(-10) + '@upi' };
    return { error: 'Enter a valid UPI ID (name@bank), 10-digit mobile number or MyBank account number.' };
  }
  function resolveAccount(name, acc, ifsc) {
    const a = acc.trim().toUpperCase(), i = ifsc.trim().toUpperCase();
    if (!/^(MB\d{8}|\d{9,18})$/.test(a)) return { error: 'Enter a valid account number (9 to 18 digits).' };
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(i)) return { error: 'Enter a valid 11-character IFSC code, like MYBK0001234.' };
    if (a === u.acc) return { error: 'You cannot transfer to your own account.' };
    const hit = users().find(x => x.acc === a);
    if (hit) return { type: 'internal', user: hit, name: hit.name, key: 'A/c ' + a };
    if (a.startsWith('MB')) return { error: 'No MyBank account found with this number.' };
    if (!name.trim()) return { error: 'Enter the account holder name.' };
    return { type: 'bank', name: name.trim(), key: 'A/c ••' + a.slice(-4) + ' · ' + i };
  }
  const post = (user, t) => { const row = { id: txnId(), ts: Date.now(), date: new Date().toLocaleString(), status: 'Success', ...t, bal: user.balance }; user.tx.push(row); return row };

  /* ---------- UPI PIN screen ---------- */
  function askPin({ amount, line, busy: busyText = 'Processing payment…' }) {
    return new Promise(resolve => {
      let stage = u.pin ? 'enter' : 'create', first = '', val = '', tries = 0, busy = false;
      const { box, close } = openModal('', { dismiss: false, cls: 'sm' });
      const finish = ok => { document.removeEventListener('keydown', onKey); close(); resolve(ok) };
      const heads = { enter: 'Enter UPI PIN', create: 'Create a 4-digit UPI PIN', confirm: 'Confirm your UPI PIN' };
      const setMsg = (t, ok) => { const el = $('#pmsg', box); if (el) say(el, t, ok) };
      const dots = () => $$('#dots span', box).forEach((s, i) => s.classList.toggle('on', i < val.length));
      function render() {
        if (stage === 'reset') {
          box.innerHTML = `<h3>Reset UPI PIN</h3><p class="muted sp">Enter your MyBank login password to set a new PIN.</p><div class="field"><i class="fa-solid fa-lock"></i><input id="rpw" type="password" autocomplete="current-password" aria-label="Login password"></div>
          <p class="msg bad" id="rmsg"></p><div class="row"><button class="btn dark" id="rok" type="button">Verify</button><button class="btn alt" id="rback" type="button">Back</button></div>`;
          const go = () => { if ($('#rpw', box).value === u.password) { delete u.pin; stage = 'create'; val = ''; render() } else say($('#rmsg', box), 'Wrong password.', false) };
          $('#rok', box).onclick = go; $('#rpw', box).onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') go() };
          $('#rback', box).onclick = () => { stage = 'enter'; val = ''; render() }; $('#rpw', box).focus(); return;
        }
        box.innerHTML = `<div class="pin-top"><span><i class="fa-solid fa-shield-halved"></i>MyBank UPI</span><span class="pin-amt">${amount != null ? money(amount) : ''}</span></div>
        <p class="pin-line">${esc(line)}</p><h3>${heads[stage]}</h3><div class="dots" id="dots" role="img" aria-label="PIN digits entered">${'<span></span>'.repeat(4)}</div><p class="msg" id="pmsg" aria-live="polite"></p>
        <div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" class="key" data-k="${n}">${n}</button>`).join('')}
        <button type="button" class="key small" data-k="cancel">Cancel</button><button type="button" class="key" data-k="0">0</button><button type="button" class="key" data-k="del" aria-label="Delete"><i class="fa-solid fa-delete-left"></i></button></div>
        ${stage === 'enter' ? '<button type="button" class="forgot" id="forgot">Forgot UPI PIN?</button>' : '<p class="hint" style="margin:12px 0 0">Demo project: this PIN is stored only in your browser.</p>'}`;
        $$('[data-k]', box).forEach(b => b.onclick = () => press(b.dataset.k));
        if ($('#forgot', box)) $('#forgot', box).onclick = () => { stage = 'reset'; render() };
        dots();
      }
      function press(k) {
        if (busy) return; if (k === 'cancel') return finish(false);
        if (k === 'del') val = val.slice(0, -1); else if (val.length < 4) val += k;
        dots(); if (val.length === 4) setTimeout(submit, 150);
      }
      function success() { busy = true; box.innerHTML = `<div class="spin" role="status"></div><h3>${esc(busyText)}</h3><p class="muted">Please do not close or go back.</p>`; setTimeout(() => finish(true), 1200) }
      function submit() {
        if (stage === 'create') { first = val; val = ''; stage = 'confirm'; return render() }
        if (stage === 'confirm') {
          if (val !== first) { val = first = ''; stage = 'create'; render(); return setMsg('PINs did not match. Try again.', false) }
          u.pin = hashPin(val); notify(u, 'UPI PIN set', 'Your UPI PIN was created or changed.', 'fa-key'); save(u); return success();
        }
        if (hashPin(val) === u.pin) return success();
        tries++; val = ''; dots(); const d = $('#dots', box); d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake');
        if (tries >= 3) { toast('Too many wrong PIN attempts. Cancelled.', false); return finish(false) }
        setMsg(`Incorrect PIN. ${3 - tries} attempt${3 - tries > 1 ? 's' : ''} left.`, false);
      }
      function onKey(e) {
        if (stage === 'reset') { if (e.key === 'Escape') { stage = 'enter'; val = ''; render() } return }
        if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); else if (e.key === 'Escape') press('cancel');
      }
      document.addEventListener('keydown', onKey); render();
    });
  }

  /* ---------- receipt ---------- */
  function receipt(t) {
    const head = { Deposit: 'Money deposited', Withdrawal: 'Withdrawal successful', Sent: 'Payment successful', Received: 'Money received' }[t.kind] || 'Transaction';
    const rows = [['Type', t.kind + (t.mode ? ' · ' + t.mode : '')], t.kind === 'Sent' && ['Paid to', t.to], t.kind === 'Sent' && ['To', t.toId], t.kind === 'Received' && ['Received from', t.from], t.kind === 'Received' && ['From', t.fromId],
    t.src && ['Source', t.src], t.dest && ['Withdrawn to', t.dest], t.cat && t.kind === 'Sent' && ['Category', t.cat], t.note && ['Note', t.note], ['Date', fdate(t)], t.id && ['Transaction ID', t.id], ['Status', t.status || 'Success'], t.bal != null && ['Balance after', money(t.bal)]].filter(Boolean);
    const { box, close } = openModal(`<div class="rcpt"><div class="tick"><i class="fa-solid fa-check"></i></div><h3>${head}</h3><div class="big">${money(t.amt)}</div>
    <dl class="facts">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl><button class="btn dark" id="rcl" type="button">Done</button></div>`, { cls: 'sm' });
    $('#rcl', box).onclick = close; $('#rcl', box).focus();
  }

  /* ---------- one place that moves money out ---------- */
  async function pay({ p, amt, note, cat, mode, line }) {
    sync(); if (amt > u.balance) return toast('Insufficient balance. Available: ' + money(u.balance), false);
    if (!await askPin({ amount: amt, line })) return;
    sync(); if (amt > u.balance) return toast('Insufficient balance. Payment cancelled.', false);
    const id = txnId(); u.balance = R2(u.balance - amt);
    const t = post(u, { id, kind: 'Sent', amt, to: p.name, toId: p.key, note, cat, mode });
    notify(u, mode ? 'Transfer successful' : 'Payment sent', `${money(amt)} sent to ${p.name}`, 'fa-paper-plane');
    if (u.balance < 500) notify(u, 'Low balance', 'Your balance is below ₹500.', 'fa-triangle-exclamation');
    if (p.type === 'internal') {
      const r = users().find(x => x.email === p.user.email);
      if (r) { r.tx = r.tx || []; r.balance = R2((Number(r.balance) || 0) + amt); post(r, { id, kind: 'Received', amt, from: u.name, fromId: upiOf(u), note }); notify(r, 'Money received', `${money(amt)} received from ${u.name}`, 'fa-arrow-down'); save(r) }
    }
    save(u); draw(); receipt(t); return t;
  }
  const amtOf = id => Math.round(Number($(id).value) * 100) / 100;
  const badAmt = a => !(a >= 1) ? 'Enter an amount of at least ₹1.' : a > LIMIT ? `Limit is ${money(LIMIT)} per transaction.` : '';

  /* ---------- drawing ---------- */
  const f = { type: 'all', q: '' };
  const rowHtml = ({ t, i }) => `<li><button type="button" class="txr" data-i="${i}"><span class="ico ${CREDIT(t.kind) ? 'in' : 'out'}"><i class="fa-solid ${ICON[t.kind] || 'fa-receipt'}"></i></span>
    <span class="tmain"><b>${esc(txTitle(t))}</b><small>${esc(fdate(t))}${t.id ? ' · ' + esc(t.id) : ''}</small></span><span class="${CREDIT(t.kind) ? 'plus' : 'minus'}">${CREDIT(t.kind) ? '+' : '−'}${money(t.amt)}</span></button></li>`;
  const allTx = () => u.tx.map((t, i) => ({ t, i })).reverse();
  const when = ts => new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  function drawHist() {
    const q = f.q.toLowerCase();
    const list = allTx().filter(({ t }) => (f.type === 'all' || (f.type === 'in') === CREDIT(t.kind)) && (!q || [txTitle(t), t.id, t.note, t.toId, t.fromId, String(t.amt)].join(' ').toLowerCase().includes(q)));
    $('#hist').innerHTML = list.length ? list.map(rowHtml).join('') : '<li class="empty">No payments found.</li>';
    $('#hcount').textContent = `${list.length} payment${list.length === 1 ? '' : 's'}`;
  }
  function drawMini() {
    const l = allTx().slice(0, 5);
    $('#mini').innerHTML = l.length ? l.map(({ t }) => `<tr><td>${esc(fdate(t))}</td><td>${esc(txTitle(t))}</td><td class="r ${CREDIT(t.kind) ? 'plus' : 'minus'}">${CREDIT(t.kind) ? '+' : '−'}${money(t.amt)}</td><td class="r">${t.bal != null ? money(t.bal) : '–'}</td></tr>`).join('') : '<tr><td colspan="4" class="empty">No transactions yet.</td></tr>';
  }
  function drawBenef() {
    $('#bList').innerHTML = u.beneficiaries.length ? u.beneficiaries.map(b => `<li><span class="ico in"><i class="fa-solid fa-building-columns"></i></span><span class="tmain"><b>${esc(b.nick || b.name)}</b><small>${esc(b.name)} · A/c ${esc(b.acc)} · ${esc(b.ifsc)}</small></span>
      <button class="btn alt small" data-bsend="${b.id}" type="button">Send</button><button class="btn danger small" data-bdel="${b.id}" type="button" aria-label="Delete ${esc(b.name)}"><i class="fa-solid fa-trash"></i></button></li>`).join('') : '<li class="empty">No beneficiaries yet.</li>';
    const cur = $('#trBen').value;
    $('#trBen').innerHTML = '<option value="">Select a saved beneficiary</option>' + u.beneficiaries.map(b => `<option value="${b.id}">${esc(b.nick || b.name)} · A/c ${esc(b.acc)}</option>`).join('') + '<option value="new">+ New account</option>';
    $('#trBen').value = [...$('#trBen').options].some(o => o.value === cur) ? cur : (u.beneficiaries.length ? '' : 'new'); $('#trNew').hidden = $('#trBen').value !== 'new';
  }
  const stat = () => ({ Pending: 'warn', Approved: 'ok', Rejected: 'bad', Cancelled: '' });
  function drawLoans() {
    $('#lnList').innerHTML = u.loans.length ? u.loans.slice().reverse().map(l => `<li><span class="ico in"><i class="fa-solid fa-hand-holding-dollar"></i></span><span class="tmain"><b>${esc(l.type)} loan · ${money(l.amt)}</b><small>${esc(l.ref)} · EMI ${money(l.emi)} × ${l.months} months @ ${l.rate}% · ${esc(l.why || '')}</small></span>
      <span class="pill ${stat()[l.status] || ''}">${l.status === 'Pending' ? 'Under review' : l.status}</span>${l.status === 'Pending' ? `<button class="btn alt small" data-lcancel="${l.ref}" type="button">Cancel</button>` : ''}</li>`).join('') : '<li class="empty">No loan applications yet.</li>';
  }
  function drawNotes() {
    const n = unread(u), l = u.notes.slice().reverse();
    $('#nList').innerHTML = l.length ? l.map(x => `<li class="note ${x.read ? '' : 'unread'}"><span class="ico in"><i class="fa-solid ${x.icon || 'fa-bell'}"></i></span><span class="tmain"><b>${esc(x.title)}</b><small>${esc(x.text)}<br>${when(x.ts)}</small></span>${x.read ? '' : '<span class="dotu" aria-label="Unread"></span>'}</li>`).join('') : '<li class="empty">You have no notifications.</li>';
    $('#sideN').textContent = n; $('#sideN').hidden = !n; refreshBell();
  }
  function drawProfile() {
    $('#avatar').textContent = u.name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    $('#pfName').value = u.name; $('#pfPhone').value = u.phone || ''; $('#pfEmail').value = u.email; $('#pfDob').value = u.dob ? new Date(u.dob).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : ''; $('#pfAddr').value = u.address || '';
    $('#pinState').textContent = u.pin ? 'Your UPI PIN is set. You need your login password to change it.' : 'You have not set a UPI PIN yet. You will create one with your first payment.';
  }
  function draw() {
    $('#who').textContent = u.name.split(' ')[0]; $('#acc').textContent = `${u.type} · Account ${u.acc}`;
    $('#balance').textContent = money(u.balance); $('#upi').textContent = upiOf(u);
    $('#wdBal').textContent = money(u.balance); $$('.balTxt').forEach(e => e.textContent = money(u.balance));
    const now = new Date(), mon = u.tx.filter(t => { const d = new Date(tsOf(t)); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() });
    const sum = inn => money(mon.filter(t => CREDIT(t.kind) === inn).reduce((a, t) => a + t.amt, 0));
    $('#sIn').textContent = sum(true); $('#sOut').textContent = sum(false);
    $('#recent').innerHTML = u.tx.length ? allTx().slice(0, 5).map(rowHtml).join('') : '<li class="empty">No transactions yet. Deposit money to get started.</li>';
    const seen = new Set(), pay = allTx().filter(({ t }) => t.kind === 'Sent' && t.toId && !t.mode && !seen.has(t.toId) && seen.add(t.toId)).slice(0, 5);
    $('#payeesBox').hidden = !pay.length; $('#payees').innerHTML = pay.map(({ t }) => `<button type="button" data-p="${esc(t.toId)}">${esc(t.to)}</button>`).join('');
    $('#beFacts').innerHTML = [['Account holder', u.name], ['Account number', u.acc], ['Account type', u.type], ['IFSC', IFSC], ['Branch', 'MyBank Main Branch'], ['UPI ID', upiOf(u)], ['Status', 'Active']].map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
    drawHist(); drawMini(); drawBenef(); drawLoans(); drawNotes(); stCount(); drawAnalytics();
  }

  /* ---------- tabs ---------- */
  const TABS = ['overview', 'balance', 'add', 'withdraw', 'send', 'qr', 'transfer', 'benef', 'history', 'statement', 'analytics', 'loan', 'calc', 'notif', 'profile'];
  const show = n => {
    if (!TABS.includes(n)) n = 'overview';
    TABS.forEach(x => { $('#t-' + x).hidden = x !== n; $(`.side [data-tab="${x}"]`).setAttribute('aria-current', x === n) });
    history.replaceState(null, '', '#' + n); window.scrollTo(0, 0);
    if (n === 'qr') drawQR(); if (n === 'profile') drawProfile(); if (n === 'analytics') drawAnalytics(); if (n === 'calc' && !$('#calcs').children.length) calcInit('#calcs'); if (n === 'loan') loanPrev();
  };
  $('#dash').addEventListener('click', e => {
    const t = e.target.closest('[data-tab]'); if (t) return show(t.dataset.tab);
    const r = e.target.closest('.txr'); if (r) return receipt(u.tx[r.dataset.i]);
    const c = e.target.closest('[data-amt]');
    if (c) { const b = $(c.closest('[data-fill]').dataset.fill), v = c.dataset.amt; b.value = v === 'all' ? u.balance : (e.target.closest('#t-add') ? (Number(b.value) || 0) + Number(v) : v) }
    const p = e.target.closest('[data-p]'); if (p) { $('#payTo').value = p.dataset.p; $('#payTo').dispatchEvent(new Event('input')); $('#payAmt').focus() }
    const bs = e.target.closest('[data-bsend]'); if (bs) { show('transfer'); $('#trBen').value = bs.dataset.bsend; $('#trNew').hidden = true; $('#trAmt').focus() }
    const bd = e.target.closest('[data-bdel]'); if (bd) { const b = u.beneficiaries.find(x => String(x.id) === bd.dataset.bdel); if (b && confirm(`Remove ${b.name} from beneficiaries?`)) { u.beneficiaries = u.beneficiaries.filter(x => x !== b); notify(u, 'Beneficiary removed', b.name + ' was removed.', 'fa-user-minus'); save(u); draw(); toast('Beneficiary removed.') } }
    const lc = e.target.closest('[data-lcancel]'); if (lc) { const l = u.loans.find(x => x.ref === lc.dataset.lcancel); if (l && l.status === 'Pending') { l.status = 'Cancelled'; notify(u, 'Loan application cancelled', l.ref, 'fa-ban'); save(u); draw() } }
  });
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  $('#copyUpi').onclick = () => { try { navigator.clipboard.writeText(upiOf(u)); toast('UPI ID copied.') } catch { toast('Could not copy.', false) } };
  $$('.catsel').forEach(s => s.innerHTML = CATS.map(c => `<option>${c}</option>`).join(''));

  /* ---------- deposit / withdraw ---------- */
  $('#addBtn').onclick = async () => {
    sync(); const a = amtOf('#addAmt'), err = badAmt(a); if (err) return toast(err, false);
    const src = $('#addSrc').value; if (!await askPin({ amount: a, line: `Deposit via ${src}` })) return;
    sync(); u.balance = R2(u.balance + a); const t = post(u, { kind: 'Deposit', amt: a, src }); notify(u, 'Deposit successful', `${money(a)} added via ${src}.`, 'fa-circle-plus');
    save(u); $('#addAmt').value = ''; draw(); receipt(t);
  };
  $('#wdBtn').onclick = async () => {
    sync(); const a = amtOf('#wdAmt'), err = badAmt(a); if (err) return toast(err, false);
    if (a > u.balance) return toast('Not enough balance for this withdrawal.', false);
    const dest = $('#wdTo').value; if (!await askPin({ amount: a, line: `Withdraw to ${dest}` })) return;
    sync(); if (a > u.balance) return toast('Not enough balance for this withdrawal.', false);
    u.balance = R2(u.balance - a); const t = post(u, { kind: 'Withdrawal', amt: a, dest }); notify(u, 'Withdrawal successful', `${money(a)} withdrawn to ${dest}.`, 'fa-building-columns');
    if (u.balance < 500) notify(u, 'Low balance', 'Your balance is below ₹500.', 'fa-triangle-exclamation');
    save(u); $('#wdAmt').value = ''; draw(); receipt(t);
  };

  /* ---------- balance enquiry ---------- */
  let hideT;
  $('#beBtn').onclick = async () => {
    sync(); if (!await askPin({ line: 'Balance enquiry', busy: 'Fetching balance…' })) return;
    sync(); $('#beBal').textContent = money(u.balance); $('#beAsOf').textContent = 'As of ' + new Date().toLocaleString('en-IN') + ' · hides in 30 seconds';
    clearTimeout(hideT); hideT = setTimeout(() => { $('#beBal').textContent = '₹ ••••••'; $('#beAsOf').textContent = 'Balance is hidden. Verify with your UPI PIN to view.' }, 30000);
  };

  /* ---------- UPI payment ---------- */
  $('#payTo').oninput = () => {
    const v = $('#payTo').value.trim(), c = $('#payee'); if (!v) return c.hidden = true;
    const p = resolvePayee(v); c.hidden = false;
    if (p.error) { c.className = 'payee ' + (p.error.startsWith('You cannot') ? 'bad' : 'idle'); c.textContent = p.error; return }
    c.className = 'payee ' + (p.type === 'internal' ? 'ok' : 'warn');
    c.innerHTML = p.type === 'internal' ? `<i class="fa-solid fa-circle-check"></i> <b>${esc(p.name)}</b> · MyBank customer (${esc(p.key)})` : `<i class="fa-solid fa-triangle-exclamation"></i> <b>${esc(p.name)}</b> · ${esc(p.key)}<br><small>Name not verified. Check the ID before you pay.</small>`;
  };
  $('#payBtn').onclick = async () => {
    sync(); const p = resolvePayee($('#payTo').value); if (p.error) return toast(p.error, false);
    const a = amtOf('#payAmt'), err = badAmt(a); if (err) return toast(err, false);
    const t = await pay({ p, amt: a, note: $('#payNote').value.trim().slice(0, 50), cat: $('#payCat').value, line: `Paying ${p.name} (${p.key})` });
    if (t) { ['#payTo', '#payAmt', '#payNote'].forEach(s => $(s).value = ''); $('#payee').hidden = true }
  };

  /* ---------- QR payment ---------- */
  const upiLink = () => { const a = Number($('#qrAmt').value); return `upi://pay?pa=${encodeURIComponent(upiOf(u))}&pn=${encodeURIComponent(u.name)}&cu=INR${a > 0 ? '&am=' + a.toFixed(2) : ''}` };
  function drawQR() {
    const box = $('#qrBox'); box.innerHTML = '';
    if (window.QRCode) new QRCode(box, { text: upiLink(), width: 200, height: 200, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    else box.innerHTML = '<p class="muted" style="color:#333">QR library could not load. Check your internet connection.</p>';
    $('#qrLink').textContent = upiLink();
  }
  $('#qrAmt').oninput = drawQR;
  $('#qrCp').onclick = () => { try { navigator.clipboard.writeText(upiLink()); toast('Payment link copied.') } catch { toast('Could not copy.', false) } };
  $('#qrDl').onclick = () => { const c = $('#qrBox canvas'); if (!c) return toast('QR is not ready.', false); const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'mybank-qr.png'; a.click() };
  let qrP = null;
  function readQR(text) {
    qrP = null; $('#qrPay').hidden = true; const c = $('#qrPayee');
    const s = String(text || '').trim(), m = s.match(/^upi:\/\/pay\?(.*)$/i);
    if (!m) { c.hidden = false; c.className = 'payee bad'; c.textContent = 'This is not a valid UPI QR code.'; return }
    const q = new URLSearchParams(m[1]), pa = q.get('pa'), p = pa ? resolvePayee(pa) : { error: 'QR has no payee.' };
    c.hidden = false; if (p.error) { c.className = 'payee bad'; c.textContent = p.error; return }
    if (p.type !== 'internal' && q.get('pn')) p.name = q.get('pn');
    qrP = p; c.className = 'payee ' + (p.type === 'internal' ? 'ok' : 'warn');
    c.innerHTML = `<i class="fa-solid fa-qrcode"></i> <b>${esc(p.name)}</b> · ${esc(p.key)}${p.type === 'internal' ? '' : '<br><small>Name from the QR code. Check before you pay.</small>'}`;
    const am = Number(q.get('am')); $('#qrPAmt').value = am > 0 ? am : ''; $('#qrPAmt').readOnly = am > 0; $('#qrPay').hidden = false; $('#qrPAmt').focus();
  }
  $('#qrRead').onclick = () => readQR($('#qrIn').value);
  $('#qrPayBtn').onclick = async () => {
    if (!qrP) return; const a = amtOf('#qrPAmt'), err = badAmt(a); if (err) return toast(err, false);
    const t = await pay({ p: qrP, amt: a, cat: $('#qrCat').value, note: 'QR payment', line: `Paying ${qrP.name} via QR` });
    if (t) { $('#qrIn').value = ''; $('#qrPay').hidden = true; $('#qrPayee').hidden = true; qrP = null }
  };
  const canScan = () => 'BarcodeDetector' in window ? true : (toast('QR scanning is not supported in this browser. Paste the UPI link instead.', false), false);
  $('#qrFile').onchange = async e => {
    const file = e.target.files[0]; e.target.value = ''; if (!file || !canScan()) return;
    try { const r = await new BarcodeDetector({ formats: ['qr_code'] }).detect(await createImageBitmap(file)); if (!r.length) return toast('No QR code found in this image.', false); $('#qrIn').value = r[0].rawValue; readQR(r[0].rawValue) } catch { toast('Could not read this image.', false) }
  };
  $('#qrScan').onclick = async () => {
    if (!canScan()) return; if (!navigator.mediaDevices?.getUserMedia) return toast('Camera is not available here.', false);
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }) } catch { return toast('Camera permission was denied.', false) }
    const { m, box, close } = openModal('<h3>Scan QR code</h3><video id="qv" playsinline muted style="width:100%;border-radius:12px;background:#000"></video><p class="muted">Point the camera at a UPI QR code.</p><button class="btn alt" id="qx" type="button">Cancel</button>', { cls: 'sm' });
    const v = $('#qv', box); v.srcObject = stream; v.play(); let live = true; const det = new BarcodeDetector({ formats: ['qr_code'] });
    m.onclose = () => { live = false; stream.getTracks().forEach(t => t.stop()) }; $('#qx', box).onclick = close;
    (async function loop() { while (live) { try { const r = await det.detect(v); if (r.length) { const raw = r[0].rawValue; close(); $('#qrIn').value = raw; return readQR(raw) } } catch { } await new Promise(r => setTimeout(r, 300)) } })();
  };

  /* ---------- beneficiaries + fund transfer ---------- */
  $('#bAdd').onclick = () => {
    const name = $('#bName').value.trim(), acc = $('#bAcc').value.trim().toUpperCase(), ifsc = $('#bIfsc').value.trim().toUpperCase();
    if (!name) return toast('Enter the account holder name.', false);
    if (!/^(MB\d{8}|\d{9,18})$/.test(acc)) return toast('Enter a valid account number (9 to 18 digits).', false);
    if (acc !== $('#bAcc2').value.trim().toUpperCase()) return toast('Account numbers do not match.', false);
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return toast('Enter a valid 11-character IFSC code.', false);
    if (acc === u.acc) return toast('That is your own account.', false);
    if (u.beneficiaries.some(b => b.acc === acc && b.ifsc === ifsc)) return toast('This beneficiary is already saved.', false);
    if (acc.startsWith('MB') && !users().some(x => x.acc === acc)) return toast('No MyBank account found with this number.', false);
    u.beneficiaries.push({ id: Date.now(), name, nick: $('#bNick').value.trim(), acc, ifsc });
    notify(u, 'Beneficiary added', name + ' was added to your beneficiaries.', 'fa-user-plus'); save(u); ['#bName', '#bNick', '#bAcc', '#bAcc2', '#bIfsc'].forEach(s => $(s).value = ''); draw(); toast('Beneficiary added.');
  };
  $('#trBen').onchange = () => { $('#trNew').hidden = $('#trBen').value !== 'new' };
  $('#trBtn').onclick = async () => {
    sync(); const sel = $('#trBen').value; if (!sel) return toast('Select a beneficiary or choose + New account.', false);
    let name, acc, ifsc;
    if (sel === 'new') { name = $('#trName').value; acc = $('#trAcc').value; ifsc = $('#trIfsc').value } else { const b = u.beneficiaries.find(x => String(x.id) === sel); name = b.name; acc = b.acc; ifsc = b.ifsc }
    const p = resolveAccount(name, acc, ifsc); if (p.error) return toast(p.error, false);
    const a = amtOf('#trAmt'), err = badAmt(a); if (err) return toast(err, false);
    const mode = $('#trMode').value, t = await pay({ p, amt: a, note: $('#trNote').value.trim().slice(0, 50), cat: 'Transfer', mode, line: `${mode} transfer to ${p.name} (${p.key})` });
    if (!t) return;
    if (sel === 'new' && $('#trSave').checked && !u.beneficiaries.some(b => b.acc === acc.trim().toUpperCase())) { u.beneficiaries.push({ id: Date.now(), name: p.name, nick: '', acc: acc.trim().toUpperCase(), ifsc: ifsc.trim().toUpperCase() }); save(u); draw() }
    ['#trName', '#trAcc', '#trIfsc', '#trAmt', '#trNote'].forEach(s => $(s).value = '');
  };

  /* ---------- history / CSV ---------- */
  $('#hq').oninput = e => { f.q = e.target.value.trim(); drawHist() };
  $('#hf').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; f.type = b.dataset.f; $$('#hf [data-f]').forEach(x => x.setAttribute('aria-pressed', x === b)); drawHist() });
  $('#csv').onclick = () => {
    if (!u.tx.length) return toast('No payments to export yet.', false);
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const lines = [['Date', 'Transaction ID', 'Type', 'Details', 'Credit', 'Debit', 'Status', 'Balance after'].join(',')].concat(allTx().map(({ t }) => [fdate(t), t.id, t.kind, txTitle(t) + (t.note ? ' - ' + t.note : ''), CREDIT(t.kind) ? t.amt : '', CREDIT(t.kind) ? '' : t.amt, t.status || 'Success', t.bal ?? ''].map(q).join(',')));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })); a.download = 'mybank-history.csv'; a.click(); URL.revokeObjectURL(a.href);
  };

  /* ---------- PDF statements ---------- */
  function range() {
    const v = $('#stPeriod').value, now = new Date(), d0 = new Date(now.getFullYear(), now.getMonth(), 1);
    if (v === 'all') return [0, Infinity, 'All time'];
    if (v === 'month') return [+d0, Infinity, 'This month'];
    if (v === 'last') return [+new Date(now.getFullYear(), now.getMonth() - 1, 1), +d0 - 1, 'Last month'];
    if (v === 'custom') { const a = $('#stFrom').value, b = $('#stTo').value; return [a ? +new Date(a) : 0, b ? +new Date(b) + 86399999 : Infinity, `${a || 'Start'} to ${b || 'Today'}`] }
    return [Date.now() - Number(v) * 864e5, Infinity, 'Last ' + (v === '30' ? '30 days' : '3 months')];
  }
  const inRange = () => { const [a, b] = range(); return u.tx.filter(t => tsOf(t) >= a && tsOf(t) <= b) };
  function stCount() { $('#stCustom').hidden = $('#stPeriod').value !== 'custom'; const n = inRange().length; $('#stCount').textContent = `${n} transaction${n === 1 ? '' : 's'} in this period.` }
  ['#stPeriod', '#stFrom', '#stTo'].forEach(s => $(s).onchange = stCount);
  function makePdf(list, title, period) {
    const J = window.jspdf; if (!J) return toast('PDF library could not load. Check your internet connection.', false);
    const doc = new J.jsPDF({ unit: 'pt', format: 'a4' }), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const rs = n => 'Rs. ' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const clean = s => String(s).replace(/[^\x20-\x7E]/g, '');
    doc.setFillColor(0, 51, 102); doc.rect(0, 0, W, 72, 'F'); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.text('MyBank', 40, 44);
    doc.setFontSize(12); doc.text(title, W - 40, 44, { align: 'right' });
    doc.setTextColor(30, 40, 60); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    [`Account holder: ${clean(u.name)}`, `Account number: ${u.acc}   IFSC: ${IFSC}`, `Account type: ${clean(u.type)}`, `Period: ${period}`, `Generated: ${new Date().toLocaleString('en-IN')}`, `Closing balance: ${rs(u.balance)}`].forEach((l, i) => doc.text(l, 40, 96 + i * 15));
    let y = 200; const head = () => { doc.setFillColor(234, 242, 255); doc.rect(40, y - 12, W - 80, 20, 'F'); doc.setFont('helvetica', 'bold'); doc.text('Date', 44, y); doc.text('Details', 130, y); doc.text('Credit', 410, y, { align: 'right' }); doc.text('Debit', 480, y, { align: 'right' }); doc.text('Balance', W - 44, y, { align: 'right' }); doc.setFont('helvetica', 'normal'); y += 22 };
    head(); let cr = 0, dr = 0;
    list.slice().sort((a, b) => tsOf(a) - tsOf(b)).forEach(t => {
      const det = doc.splitTextToSize(clean(txTitle(t) + (t.note ? ' - ' + t.note : '')) + (t.id ? ' [' + t.id + ']' : ''), 250), h = det.length * 12 + 6;
      if (y + h > H - 60) { doc.addPage(); y = 50; head() }
      doc.text(new Date(tsOf(t)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }), 44, y); doc.text(det, 130, y);
      if (CREDIT(t.kind)) { cr += t.amt; doc.text(Number(t.amt).toLocaleString('en-IN', { minimumFractionDigits: 2 }), 410, y, { align: 'right' }) } else { dr += t.amt; doc.text(Number(t.amt).toLocaleString('en-IN', { minimumFractionDigits: 2 }), 480, y, { align: 'right' }) }
      doc.text(t.bal != null ? Number(t.bal).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '-', W - 44, y, { align: 'right' }); y += h;
      doc.setDrawColor(220, 226, 238); doc.line(40, y - 8, W - 40, y - 8);
    });
    if (!list.length) doc.text('No transactions in this period.', 44, y);
    if (y > H - 100) { doc.addPage(); y = 50 } y += 16; doc.setFont('helvetica', 'bold'); doc.text(`Total credits: ${rs(cr)}     Total debits: ${rs(dr)}`, 44, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110, 120, 140); doc.text('This is a computer-generated statement from a demo project and needs no signature.', 40, H - 30);
    doc.save(`MyBank-${title.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`);
    notify(u, 'Statement downloaded', title + ' (' + period + ')', 'fa-file-pdf'); save(u); drawNotes();
  }
  $('#stBtn').onclick = () => makePdf(inRange(), 'Account Statement', range()[2]);
  $('#miniPdf').onclick = () => makePdf(allTx().slice(0, 5).map(x => x.t), 'Mini Statement', 'Last 5 transactions');

  /* ---------- spending analytics ---------- */
  function drawAnalytics() {
    if ($('#t-analytics').hidden) return;
    const v = $('#anR').value, now = new Date(); let from = 0;
    if (v === 'month') from = +new Date(now.getFullYear(), now.getMonth(), 1); else if (v !== 'all') from = Date.now() - Number(v) * 864e5;
    const l = u.tx.filter(t => tsOf(t) >= from), out = l.filter(t => !CREDIT(t.kind)), inn = l.filter(t => CREDIT(t.kind));
    const spent = out.reduce((a, t) => a + t.amt, 0), got = inn.reduce((a, t) => a + t.amt, 0), by = {};
    out.forEach(t => by[catOf(t)] = (by[catOf(t)] || 0) + t.amt);
    const cats = Object.entries(by).sort((a, b) => b[1] - a[1]);
    $('#anTiles').innerHTML = [['Total spent', money(spent)], ['Total received', money(got)], ['Net', (got - spent < 0 ? '−' : '+') + money(Math.abs(got - spent))], ['Top category', cats[0] ? cats[0][0] : '–']].map(([k, x]) => `<div class="tile"><small>${k}</small><b>${esc(x)}</b></div>`).join('');
    if (!cats.length) $('#anDonut').innerHTML = '<p class="empty">No spending in this period.</p>';
    else {
      const C = 2 * Math.PI * 70; let off = 0;
      const segs = cats.map(([c, a], i) => { const len = a / spent * C, s = `<circle r="70" cx="100" cy="100" fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="30" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 100 100)"/>`; off += len; return s }).join('');
      $('#anDonut').innerHTML = `<svg class="chart" viewBox="0 0 200 200" role="img" aria-label="Spending by category">${segs}<text x="100" y="96" text-anchor="middle" style="font-size:11px">Spent</text><text x="100" y="116" text-anchor="middle" style="font-size:15px;font-weight:700;fill:var(--t)">${esc(inr0(spent))}</text></svg>
      <ul class="legend">${cats.map(([c, a], i) => `<li><i style="background:${COLORS[i % COLORS.length]}"></i>${esc(c)}<b>${money(a)} · ${Math.round(a / spent * 100)}%</b></li>`).join('')}</ul>`;
    }
    const months = [...Array(6)].map((_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1); return { d, lab: d.toLocaleString('en-IN', { month: 'short' }), i: 0, o: 0 } });
    u.tx.forEach(t => { const d = new Date(tsOf(t)), m = months.find(x => x.d.getMonth() === d.getMonth() && x.d.getFullYear() === d.getFullYear()); if (m) CREDIT(t.kind) ? m.i += t.amt : m.o += t.amt });
    const mx = Math.max(1, ...months.flatMap(m => [m.i, m.o])), bars = months.map((m, k) => { const x = 30 + k * 88, hi = m.i / mx * 150, ho = m.o / mx * 150;
      return `<rect x="${x}" y="${180 - hi}" width="28" height="${hi}" rx="4" style="fill:var(--ok)"><title>${m.lab} in ${money(m.i)}</title></rect><rect x="${x + 32}" y="${180 - ho}" width="28" height="${ho}" rx="4" style="fill:var(--bad)"><title>${m.lab} out ${money(m.o)}</title></rect><text x="${x + 30}" y="198" text-anchor="middle">${m.lab}</text>` }).join('');
    $('#anBars').innerHTML = `<svg class="chart" viewBox="0 0 560 210" role="img" aria-label="Money in and out for the last 6 months"><line x1="20" y1="180" x2="550" y2="180" style="stroke:var(--line)"/>${bars}</svg><div class="row" style="justify-content:center;gap:20px"><span class="plus">■ Money in</span><span class="minus">■ Money out</span></div>`;
    const pp = {}; out.filter(t => t.kind === 'Sent').forEach(t => { const k = t.to; pp[k] = (pp[k] || 0) + t.amt });
    const top = Object.entries(pp).sort((a, b) => b[1] - a[1]).slice(0, 5);
    $('#anPayees').innerHTML = top.length ? top.map(([n, a]) => `<li><span class="ico out"><i class="fa-solid fa-user"></i></span><span class="tmain"><b>${esc(n)}</b></span><span class="minus">${money(a)}</span></li>`).join('') : '<li class="empty">No payments yet.</li>';
  }
  $('#anR').onchange = drawAnalytics;

  /* ---------- loans ---------- */
  function loanPrev() {
    const P = Number($('#lnAmt').value), n = Number($('#lnN').value), r = LOAN_RATE[$('#lnType').value];
    if (!(P > 0 && n > 0)) return $('#lnPrev').innerHTML = '<small class="muted">Enter amount and tenure to see your EMI.</small>';
    const E = emi(P, r, n); $('#lnPrev').innerHTML = `<div>Interest rate<b>${r}% a year</b></div><div>Monthly EMI<span class="big">${money(E)}</span></div><div>Total interest<b>${money(E * n - P)}</b></div><div>Total payable<b>${money(E * n)}</b></div>`;
  }
  ['#lnType', '#lnAmt', '#lnN'].forEach(s => $(s).oninput = loanPrev);
  $('#lnBtn').onclick = () => {
    sync(); const P = Number($('#lnAmt').value), n = Math.round(Number($('#lnN').value)), inc = Number($('#lnInc').value), type = $('#lnType').value;
    if (!(P >= 10000 && P <= 10000000)) return toast('Loan amount must be between ₹10,000 and ₹1,00,00,000.', false);
    if (!(n >= 6 && n <= 360)) return toast('Tenure must be between 6 and 360 months.', false);
    if (!(inc > 0)) return toast('Enter your monthly income.', false);
    const rate = LOAN_RATE[type], ref = 'LN' + Date.now().toString().slice(-7);
    u.loans.push({ ref, type, amt: P, months: n, rate, emi: R2(emi(P, rate, n)), income: inc, why: $('#lnWhy').value.trim(), status: 'Pending', ts: Date.now() });
    notify(u, 'Loan application received', `${type} loan of ${money(P)} (${ref}) is under review.`, 'fa-hand-holding-dollar'); save(u); $('#lnWhy').value = ''; draw(); toast('Application submitted.');
  };
  /* The demo "bank" reviews applications after a few seconds: approved if EMI is within 50% of income. */
  function decideLoans() {
    let ch = false; sync();
    u.loans.filter(l => l.status === 'Pending' && Date.now() - l.ts > 10000).forEach(l => { l.status = l.emi <= l.income * 0.5 ? 'Approved' : 'Rejected'; ch = true;
      notify(u, 'Loan ' + l.status.toLowerCase(), l.status === 'Approved' ? `Your ${l.type} loan ${l.ref} of ${money(l.amt)} is approved.` : `Your ${l.type} loan ${l.ref} could not be approved because the EMI is above 50% of your income.`, l.status === 'Approved' ? 'fa-circle-check' : 'fa-circle-xmark') });
    if (ch) { save(u); draw() }
  }
  setInterval(decideLoans, 4000); decideLoans();

  /* ---------- notifications ---------- */
  $('#nRead').onclick = () => { u.notes.forEach(n => n.read = true); save(u); drawNotes() };
  $('#nClear').onclick = () => { if (u.notes.length && confirm('Clear all notifications?')) { u.notes = []; save(u); drawNotes() } };

  /* ---------- profile ---------- */
  $('#pfSave').onclick = () => {
    const name = $('#pfName').value.trim(), ph = digits($('#pfPhone').value);
    if (name.length < 2) return toast('Enter your full name.', false); if (ph.length < 10) return toast('Enter a valid 10-digit phone number.', false);
    u.name = name; u.phone = $('#pfPhone').value.trim(); u.address = $('#pfAddr').value.trim(); notify(u, 'Profile updated', 'Your profile details were saved.', 'fa-user-pen'); save(u); draw(); drawProfile(); toast('Profile saved.');
  };
  $('#pwBtn').onclick = () => {
    sync(); if ($('#pwOld').value !== u.password) return toast('Current password is wrong.', false);
    if ($('#pwNew').value.length < 6) return toast('New password must be at least 6 characters.', false);
    if ($('#pwNew').value !== $('#pwNew2').value) return toast('New passwords do not match.', false);
    u.password = $('#pwNew').value; notify(u, 'Password changed', 'Your login password was changed.', 'fa-key'); save(u); ['#pwOld', '#pwNew', '#pwNew2'].forEach(s => $(s).value = ''); drawNotes(); toast('Password updated.');
  };
  $('#pinBtn').onclick = async () => {
    sync(); if (u.pin) { const pw = prompt('Enter your login password to change your UPI PIN'); if (pw === null) return; if (pw !== u.password) return toast('Wrong password.', false); delete u.pin; save(u) }
    await askPin({ line: 'Set your new UPI PIN', busy: 'Saving your PIN…' }); sync(); drawProfile();
  };

  draw(); show(location.hash.slice(1));
}
