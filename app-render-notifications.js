// ---------- Full Notifications page ----------
// Not a bottom-nav tab — reached only via the bell popover's "Show more" row or by tapping a
// slide-down banner, the same way Settings is reached only via the gear icon (see app-main.js).
// Shows every stored notification (up to the 30-day retention window), unlike the popover's
// 6-item cap. The difference from the popover: no "x" here — a trash icon with a confirm dialog
// does a REAL delete (notifDbDeleteOne), vs. the popover's "x" which only hides an item from that
// short list (notifDbDismissFromPopover).

function openNotificationsPage(){
  if(currentTab!=='notifications'){
    previousTab = currentTab;
    currentTab = 'notifications';
    document.querySelectorAll('nav.tabs button').forEach(b=> b.classList.remove('active'));
    updateHeader();
    renderMain();
  }
}

async function renderNotificationsPage(main){
  let list = [];
  try{ list = await notifDbGetAll(); }catch(e){ /* IndexedDB unavailable */ }

  const itemsHtml = list.length ? list.map(n=>`
    <div class="notif-page-item" data-id="${n.id}">
      <div class="notif-icon">${NOTIF_ICONS[n.category] || ''}</div>
      <div class="notif-text">
        <div class="notif-title">${escapeHtml(n.title)}</div>
        ${n.body ? `<div class="notif-body">${escapeHtml(n.body)}</div>` : ''}
        <div class="notif-time">${new Date(n.receivedAt).toLocaleString(localeForLang())}</div>
      </div>
      <button class="notif-trash" data-trash="${n.id}" aria-label="${tr('Delete')}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="17" height="17"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13"/><path d="M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"/></svg>
      </button>
    </div>
  `).join('') : `<div class="notif-empty">${tr('No notifications yet')}</div>`;

  main.innerHTML = `<div class="notif-page-list">${itemsHtml}</div>`;

  try{ await notifDbMarkAllRead(); refreshBellBadge(); }catch(e){ /* IndexedDB unavailable */ }
  main.querySelectorAll('[data-trash]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = parseInt(btn.dataset.trash);
      if(!confirm(tr('Delete this notification from your history?') + ' ' + tr("This can't be undone."))) return;
      try{ await notifDbDeleteOne(id); }catch(e){ /* IndexedDB unavailable */ }
      refreshBellBadge();
      renderNotificationsPage(main);
    });
  });
}
