'use strict';

// ===== Capacitor Bridge =====
// Çalışma ortamına göre yerel bildirim veya web bildirimi kullanır
const isNative = () => window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();

async function scheduleNativeNotification(note) {
  if (!isNative()) return false;
  try {
    const { LocalNotifications } = window.Capacitor.Plugins;
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return false;
    await LocalNotifications.schedule({
      notifications: [{
        id: Math.abs(note.id.split('').reduce((a, c) => (a << 5) - a + c.charCodeAt(0), 0)) % 2147483647,
        title: note.title || 'Hatırlatıcı',
        body: note.body || 'Zamanı geldi!',
        schedule: { at: new Date(note.reminder) },
        sound: note.alarm ? 'beep.wav' : null,
        smallIcon: 'ic_stat_icon',
        actionTypeId: '',
        extra: { noteId: note.id }
      }]
    });
    return true;
  } catch(e) { return false; }
}

async function cancelNativeNotification(noteId) {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = window.Capacitor.Plugins;
    const id = Math.abs(noteId.split('').reduce((a, c) => (a << 5) - a + c.charCodeAt(0), 0)) % 2147483647;
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch(e) {}
}

// ===== State =====
let notes = [];
let editingId = null;
let currentFilter = 'all';
let selectedColor = '#ffffff';
let reminderTimers = {};

// ===== DOM References =====
const notesContainer  = document.getElementById('notesContainer');
const emptyState      = document.getElementById('emptyState');
const addBtn          = document.getElementById('addBtn');
const searchInput     = document.getElementById('searchInput');
const overlay         = document.getElementById('overlay');
const noteModal       = document.getElementById('noteModal');
const modalTitle      = document.getElementById('modalTitle');
const noteTitle       = document.getElementById('noteTitle');
const noteContent     = document.getElementById('noteContent');
const noteReminder    = document.getElementById('noteReminder');
const notePin         = document.getElementById('notePin');
const noteAlarm       = document.getElementById('noteAlarm');
const saveNoteBtn     = document.getElementById('saveNoteBtn');
const deleteNoteBtn   = document.getElementById('deleteNoteBtn');
const closeModalBtn   = document.getElementById('closeModalBtn');
const clearReminderBtn= document.getElementById('clearReminderBtn');
const reminderBanner  = document.getElementById('reminderBanner');
const reminderBannerText = document.getElementById('reminderBannerText');
const reminderBannerClose = document.getElementById('reminderBannerClose');
const notifPrompt     = document.getElementById('notifPrompt');
const notifAllowBtn   = document.getElementById('notifAllowBtn');
const notifDenyBtn    = document.getElementById('notifDenyBtn');
const colorOptions       = document.getElementById('colorOptions');
const tabs               = document.querySelectorAll('.tab');
const reminderPresets    = document.getElementById('reminderPresets');
const reminderSelected   = document.getElementById('reminderSelected');
const reminderSelectedText = document.getElementById('reminderSelectedText');

// ===== Reminder Presets =====
function getPresetTimestamp(preset) {
  const now = new Date();
  switch (preset) {
    case '30m':      return now.getTime() + 30 * 60_000;
    case '1h':       return now.getTime() + 60 * 60_000;
    case '3h':       return now.getTime() + 3 * 60 * 60_000;
    case 'tomorrow': {
      const d = new Date(now); d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0); return d.getTime();
    }
    case 'nextweek': {
      const d = new Date(now); d.setDate(d.getDate() + 7);
      d.setHours(9, 0, 0, 0); return d.getTime();
    }
    default: return null;
  }
}

function getPresetLabel(preset) {
  const labels = { '30m':'30 dakika sonra', '1h':'1 saat sonra', '3h':'3 saat sonra', 'tomorrow':'Yarın saat 09:00', 'nextweek':'Gelecek hafta' };
  return labels[preset] || '';
}

function setReminderDisplay(ts, presetKey) {
  if (!ts) { clearReminderDisplay(); return; }
  const d = new Date(ts);
  const fmt = d.toLocaleDateString('tr-TR', { day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' });
  reminderSelectedText.textContent = '⏰ ' + (presetKey ? getPresetLabel(presetKey) + ' — ' : '') + fmt;
  reminderSelected.style.display = '';
  // highlight selected preset btn
  reminderPresets.querySelectorAll('.preset-btn').forEach(b => b.classList.toggle('selected', b.dataset.preset === presetKey));
}

function clearReminderDisplay() {
  noteReminder.value = '';
  noteReminder.style.display = 'none';
  reminderSelected.style.display = 'none';
  reminderPresets.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('selected'));
}

// ===== Storage =====
function loadNotes() {
  try {
    notes = JSON.parse(localStorage.getItem('notes_v2') || '[]');
  } catch {
    notes = [];
  }
}

function saveNotes() {
  localStorage.setItem('notes_v2', JSON.stringify(notes));
}

// ===== ID & Date Helpers =====
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60_000)       return 'Az önce';
  if (diff < 3_600_000)    return `${Math.floor(diff/60_000)} dk önce`;
  if (diff < 86_400_000)   return `${Math.floor(diff/3_600_000)} sa önce`;
  if (diff < 604_800_000)  return `${Math.floor(diff/86_400_000)} gün önce`;
  return d.toLocaleDateString('tr-TR', { day:'numeric', month:'short', year:'numeric' });
}

function formatReminderTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = d - now;
  if (diff <= 0) return null; // overdue handled separately
  if (diff < 3_600_000)  return `${Math.floor(diff/60_000)} dk kaldı`;
  if (diff < 86_400_000) return `${Math.floor(diff/3_600_000)} sa kaldı`;
  return d.toLocaleDateString('tr-TR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
}

// ===== Render =====
function getFilteredNotes() {
  const q = searchInput.value.trim().toLowerCase();
  return notes
    .filter(n => {
      if (currentFilter === 'reminder') return !!n.reminder;
      if (currentFilter === 'pinned')   return !!n.pinned;
      return true;
    })
    .filter(n => {
      if (!q) return true;
      return (n.title + ' ' + n.body).toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.createdAt - a.createdAt;
    });
}

function render() {
  const filtered = getFilteredNotes();

  // remove existing cards
  Array.from(notesContainer.querySelectorAll('.note-card')).forEach(el => el.remove());

  if (filtered.length === 0) {
    emptyState.style.display = '';
  } else {
    emptyState.style.display = 'none';
    filtered.forEach(note => {
      const card = buildCard(note);
      notesContainer.appendChild(card);
    });
  }
}

function buildCard(note) {
  const card = document.createElement('div');
  card.className = 'note-card' + (note.pinned ? ' pinned' : '');
  card.style.background = note.color || '#ffffff';
  card.dataset.id = note.id;

  const now = Date.now();
  const isOverdue = note.reminder && note.reminder < now;

  card.innerHTML = `
    ${note.title ? `<div class="note-title">${escapeHtml(note.title)}</div>` : ''}
    <div class="note-body">${escapeHtml(note.body || '')}</div>
    <div class="note-footer">
      <span class="note-date">${formatDate(note.createdAt)}</span>
      ${note.reminder ? `
        <span class="note-reminder-badge ${isOverdue ? 'overdue' : ''}">
          ${isOverdue ? '⏰ Geçti' : '⏰ ' + (formatReminderTime(note.reminder) || 'Bugün')}
        </span>
      ` : ''}
    </div>
  `;

  card.addEventListener('click', () => openEditModal(note.id));
  return card;
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// ===== Modal =====
function openAddModal() {
  editingId = null;
  modalTitle.textContent = 'Yeni Not';
  noteTitle.value = '';
  noteContent.value = '';
  notePin.checked = false;
  noteAlarm.checked = false;
  deleteNoteBtn.style.display = 'none';
  clearReminderDisplay();
  setSelectedColor('#ffffff');
  showModal();
}

function openEditModal(id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;
  editingId = id;
  modalTitle.textContent = 'Notu Düzenle';
  noteTitle.value = note.title || '';
  noteContent.value = note.body || '';
  notePin.checked = !!note.pinned;
  noteAlarm.checked = !!note.alarm;
  deleteNoteBtn.style.display = '';
  if (note.reminder) {
    setReminderDisplay(note.reminder, null);
    noteReminder.value = toDatetimeLocalValue(note.reminder);
  } else {
    clearReminderDisplay();
  }
  setSelectedColor(note.color || '#ffffff');
  showModal();
}

function showModal() {
  overlay.style.display = '';
  noteModal.style.display = '';
  document.body.style.overflow = 'hidden';
  setTimeout(() => noteTitle.focus(), 300);
}

function closeModal() {
  overlay.style.display = 'none';
  noteModal.style.display = 'none';
  document.body.style.overflow = '';
}

function toDatetimeLocalValue(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ===== Color Picker =====
function setSelectedColor(color) {
  selectedColor = color;
  colorOptions.querySelectorAll('.color-dot').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === color);
  });
}

colorOptions.addEventListener('click', e => {
  const dot = e.target.closest('.color-dot');
  if (dot) setSelectedColor(dot.dataset.color);
});

// ===== Save / Delete =====
function saveNote() {
  const title = noteTitle.value.trim();
  const body  = noteContent.value.trim();
  if (!title && !body) {
    noteTitle.focus();
    noteTitle.style.borderColor = '#EF4444';
    setTimeout(() => noteTitle.style.borderColor = '', 1500);
    return;
  }

  let reminderTs = null;
  if (noteReminder.value) {
    reminderTs = new Date(noteReminder.value).getTime();
    if (isNaN(reminderTs)) reminderTs = null;
  }

  if (editingId) {
    const idx = notes.findIndex(n => n.id === editingId);
    if (idx !== -1) {
      const old = notes[idx];
      notes[idx] = { ...old, title, body, color: selectedColor, pinned: notePin.checked, alarm: noteAlarm.checked, reminder: reminderTs, updatedAt: Date.now() };
      clearReminderTimer(editingId);
      if (reminderTs) scheduleReminder(notes[idx]);
    }
  } else {
    const note = { id: uid(), title, body, color: selectedColor, pinned: notePin.checked, alarm: noteAlarm.checked, reminder: reminderTs, createdAt: Date.now(), updatedAt: Date.now() };
    notes.unshift(note);
    if (reminderTs) scheduleReminder(note);
  }

  saveNotes();
  render();
  closeModal();

  if (reminderTs && Notification.permission !== 'granted') {
    showNotifPrompt();
  }
}

function deleteNote() {
  if (!editingId) return;
  clearReminderTimer(editingId);
  notes = notes.filter(n => n.id !== editingId);
  saveNotes();
  render();
  closeModal();
}

// ===== Alarm Sound (Web Audio API) =====
let _audioCtx = null;
let _alarmInterval = null;

function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

function playAlarmBeep() {
  const ctx = getAudioCtx();
  // Resume context (required after user gesture on iOS — fires on first interaction)
  if (ctx.state === 'suspended') ctx.resume();

  const freqs = [880, 1100, 880, 1100];
  let t = ctx.currentTime;
  freqs.forEach(freq => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.6, t + 0.05);
    gain.gain.linearRampToValueAtTime(0, t + 0.18);
    osc.start(t);
    osc.stop(t + 0.2);
    t += 0.22;
  });
}

function startAlarm() {
  stopAlarm();
  playAlarmBeep();
  _alarmInterval = setInterval(playAlarmBeep, 3000);
}

function stopAlarm() {
  if (_alarmInterval) { clearInterval(_alarmInterval); _alarmInterval = null; }
}

// Unlock audio context on first touch (iOS requirement)
document.addEventListener('touchstart', () => { try { getAudioCtx().resume(); } catch(e){} }, { once: true });

// ===== Reminders =====
function scheduleReminder(note) {
  if (!note.reminder) return;
  const delay = note.reminder - Date.now();
  if (delay <= 0) return;

  // Native platformda (iOS/Android) sistem bildirimi kullan
  if (isNative()) {
    scheduleNativeNotification(note);
    return;
  }

  // Web: setTimeout ile
  const timer = setTimeout(() => {
    fireReminder(note);
  }, delay);
  reminderTimers[note.id] = timer;
}

function clearReminderTimer(id) {
  cancelNativeNotification(id);
  if (reminderTimers[id]) {
    clearTimeout(reminderTimers[id]);
    delete reminderTimers[id];
  }
}

function fireReminder(note) {
  // Update card to show overdue
  render();

  // Alarm sound
  if (note.alarm) startAlarm();

  // In-app banner
  const text = `⏰ ${note.title || 'Hatırlatıcı'}: ${note.body ? note.body.slice(0, 60) : 'Zamanı geldi!'}`;
  showReminderBanner(text, !!note.alarm);

  // Push notification if allowed
  if (Notification.permission === 'granted') {
    try {
      const n = new Notification(note.title || 'Hatırlatıcı', {
        body: note.body || 'Zamanı geldi!',
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: note.id,
        requireInteraction: true,
      });
      n.onclick = () => { window.focus(); openEditModal(note.id); n.close(); };
    } catch(e) { /* SW handles it */ }
  }
}

function showReminderBanner(text, hasAlarm) {
  reminderBannerText.textContent = text;
  reminderBanner.style.display = '';
  clearTimeout(reminderBanner._hideTimer);
  // If alarm is playing, keep banner until manually closed
  if (!hasAlarm) {
    reminderBanner._hideTimer = setTimeout(() => reminderBanner.style.display = 'none', 8000);
  }
}

function initReminders() {
  notes.forEach(note => {
    if (note.reminder && note.reminder > Date.now()) {
      scheduleReminder(note);
    }
  });
}

// ===== Notification Permission =====
function showNotifPrompt() {
  if (Notification.permission === 'denied') return;
  if (localStorage.getItem('notif_asked')) return;
  notifPrompt.style.display = '';
}

notifAllowBtn.addEventListener('click', async () => {
  notifPrompt.style.display = 'none';
  localStorage.setItem('notif_asked', '1');
  try {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      new Notification('Notlarım', { body: '🔔 Hatırlatıcılar aktif! Zamanı gelince seni uyaracağım.' });
    }
  } catch(e) {}
});

notifDenyBtn.addEventListener('click', () => {
  notifPrompt.style.display = 'none';
  localStorage.setItem('notif_asked', '1');
});

// ===== Event Listeners =====
addBtn.addEventListener('click', openAddModal);
closeModalBtn.addEventListener('click', closeModal);
overlay.addEventListener('click', closeModal);
saveNoteBtn.addEventListener('click', saveNote);
deleteNoteBtn.addEventListener('click', deleteNote);

// Preset buttons
reminderPresets.addEventListener('click', e => {
  const btn = e.target.closest('.preset-btn');
  if (!btn) return;
  const preset = btn.dataset.preset;
  if (preset === 'custom') {
    // Show datetime picker
    noteReminder.style.display = '';
    noteReminder.focus();
    reminderPresets.querySelectorAll('.preset-btn').forEach(b => b.classList.toggle('selected', b.dataset.preset === 'custom'));
  } else {
    const ts = getPresetTimestamp(preset);
    noteReminder.value = toDatetimeLocalValue(ts);
    noteReminder.style.display = 'none';
    setReminderDisplay(ts, preset);
  }
});

// Custom datetime input
noteReminder.addEventListener('change', () => {
  if (noteReminder.value) {
    const ts = new Date(noteReminder.value).getTime();
    setReminderDisplay(ts, 'custom');
  } else {
    clearReminderDisplay();
  }
});

// Clear reminder
clearReminderBtn.addEventListener('click', () => {
  clearReminderDisplay();
});

searchInput.addEventListener('input', render);

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.dataset.filter;
    render();
  });
});

reminderBannerClose.addEventListener('click', () => {
  reminderBanner.style.display = 'none';
  stopAlarm();
});

// Close modal on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && noteModal.style.display !== 'none') saveNote();
});

// ===== Service Worker =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ===== Auto-refresh relative dates =====
setInterval(() => { render(); }, 60_000);

// ===== Init =====
loadNotes();
initReminders();
render();

// Show notification prompt on first load if there are notes with reminders
if (notes.some(n => n.reminder) && Notification.permission === 'default' && !localStorage.getItem('notif_asked')) {
  setTimeout(showNotifPrompt, 2000);
}
