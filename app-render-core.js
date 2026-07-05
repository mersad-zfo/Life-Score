// ---------- Rendering dispatcher + shared utils ----------
function renderMain(){
  const main = document.getElementById('main');
  document.getElementById('fab').style.display = (currentTab==='routines'||currentTab==='tasks') ? 'flex' : 'none';
  if(currentTab==='today') return renderToday(main);
  if(currentTab==='routines') return renderRoutines(main);
  if(currentTab==='tasks') return renderTasks(main);
  if(currentTab==='score') return renderScore(main);
  if(currentTab==='settings') return renderSettings(main);
  if(currentTab==='notifications') return renderNotificationsPage(main);
}

function escapeHtml(s){
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
