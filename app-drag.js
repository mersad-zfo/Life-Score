// ---------- Drag handle reorder + drag-to-delete (Today/Home tab only) ----------
const REFLOW_MS = 220;

function enableHoldDrag(listSelector, itemSelector, handleSelector, kind, onCommit){
  const list = document.querySelector(listSelector);
  if(!list) return;
  const items = Array.from(list.querySelectorAll(itemSelector));

  items.forEach(item=>{
    const handle = item.querySelector(handleSelector);
    if(!handle) return;
    handle.addEventListener('pointerdown', (e)=>{
      e.preventDefault();
      startDrag(item, list, itemSelector, e, kind, onCommit);
    });
  });
}

function getTrashEl(){
  return document.getElementById('dragTrash');
}

function isOverTrash(x, y){
  const trash = getTrashEl();
  if(!trash) return false;
  const r = trash.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function startDrag(item, list, itemSelector, startEvent, kind, onCommit){
  if(navigator.vibrate) navigator.vibrate(12);

  const rect = item.getBoundingClientRect();
  const offsetY = startEvent.clientY - rect.top;
  const prevBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.style.userSelect = 'none';

  try{ item.setPointerCapture(startEvent.pointerId); }catch(e){ /* not critical */ }

  const placeholder = document.createElement('div');
  placeholder.className = 'drag-placeholder';
  placeholder.style.height = rect.height + 'px';
  list.insertBefore(placeholder, item.nextSibling);

  item.classList.add('dragging');
  item.style.position = 'fixed';
  item.style.left = rect.left + 'px';
  item.style.top = rect.top + 'px';
  item.style.width = rect.width + 'px';
  item.style.pointerEvents = 'none';
  item.style.zIndex = 999;

  const trash = getTrashEl();
  if(trash) trash.classList.add('visible');

  function getSiblings(){
    return Array.from(list.querySelectorAll(itemSelector)).filter(el=> el!==item);
  }

  function onMove(ev){
    ev.preventDefault();
    const y = ev.clientY - offsetY;
    item.style.top = y + 'px';

    const overTrash = isOverTrash(ev.clientX, ev.clientY);
    if(trash) trash.classList.toggle('armed', overTrash);

    if(overTrash){
      // hide the placeholder gap while hovering the trash — nothing to reorder into
      if(placeholder.parentNode) placeholder.style.opacity = '0';
      return;
    } else if(placeholder) {
      placeholder.style.opacity = '1';
    }

    const siblings = getSiblings();
    let target = null;
    for(const sib of siblings){
      const sRect = sib.getBoundingClientRect();
      const mid = sRect.top + sRect.height/2;
      if(ev.clientY < mid){ target = sib; break; }
    }

    const wouldMove = target ? (placeholder.nextElementSibling !== target) : (placeholder !== list.lastElementChild);
    if(!wouldMove) return;

    const firstRects = new Map();
    siblings.forEach(el=> firstRects.set(el, el.getBoundingClientRect()));

    if(target){
      list.insertBefore(placeholder, target);
    } else {
      list.appendChild(placeholder);
    }

    siblings.forEach(el=>{
      const first = firstRects.get(el);
      const last = el.getBoundingClientRect();
      const dy = first.top - last.top;
      if(Math.abs(dy) > 0.5){
        el.style.transition = 'none';
        el.style.transform = `translateY(${dy}px)`;
        requestAnimationFrame(()=>{
          el.style.transition = `transform ${REFLOW_MS}ms ease`;
          el.style.transform = '';
        });
      }
    });
  }

  function cleanupVisuals(){
    item.classList.remove('dragging');
    item.style.position = '';
    item.style.left = '';
    item.style.top = '';
    item.style.width = '';
    item.style.pointerEvents = '';
    item.style.zIndex = '';
    document.body.style.overflow = prevBodyOverflow;
    document.body.style.userSelect = '';
    if(trash){ trash.classList.remove('visible'); trash.classList.remove('armed'); }
    Array.from(list.querySelectorAll(itemSelector)).forEach(el=>{
      el.style.transition = '';
      el.style.transform = '';
    });
  }

  function endDrag(ev){
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', endDrag);
    document.removeEventListener('pointercancel', endDrag);
    try{ item.releasePointerCapture(startEvent.pointerId); }catch(e){ /* already released */ }

    const droppedOnTrash = ev.type==='pointerup' && isOverTrash(ev.clientX, ev.clientY);

    if(droppedOnTrash){
      placeholder.remove();
      cleanupVisuals();
      const id = item.dataset.dragId;
      const name = item.querySelector('.item-name') ? item.querySelector('.item-name').textContent : 'this';
      const label = kind==='habit' ? 'habit' : 'task';
      if(confirm(`Remove this ${label}? "${name.trim()}" will be deleted.`)){
        if(kind==='habit') deleteHabit(id); else deleteTask(id);
        // deleteHabit/deleteTask already re-render, so nothing else to do
      } else {
        renderMain(); // snap back to original state since nothing was reordered/removed
      }
      return;
    }

    list.insertBefore(item, placeholder);
    placeholder.remove();
    cleanupVisuals();

    const newOrderIds = Array.from(list.querySelectorAll(itemSelector)).map(el=> el.dataset.dragId);
    onCommit(newOrderIds);
  }

  document.addEventListener('pointermove', onMove, {passive:false});
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);
}
