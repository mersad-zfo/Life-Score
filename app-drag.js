// ---------- Hold-to-drag reorder (Today tab only) ----------
const HOLD_MS = 350;
const MOVE_CANCEL_PX = 10;
const REFLOW_MS = 220;

function enableHoldDrag(listSelector, itemSelector, onCommit){
  const list = document.querySelector(listSelector);
  if(!list) return;
  const items = Array.from(list.querySelectorAll(itemSelector));

  items.forEach(item=>{
    item.addEventListener('pointerdown', (e)=>{
      if(e.target.closest('button, input, a, select')) return;
      const startX = e.clientX, startY = e.clientY;
      let cancelled = false;

      function moveCancel(ev){
        if(Math.abs(ev.clientY-startY) > MOVE_CANCEL_PX || Math.abs(ev.clientX-startX) > MOVE_CANCEL_PX){
          cancelled = true;
          cleanup();
        }
      }
      function upCancel(){ cleanup(); }
      function cleanup(){
        clearTimeout(timer);
        document.removeEventListener('pointermove', moveCancel);
        document.removeEventListener('pointerup', upCancel);
        document.removeEventListener('pointercancel', upCancel);
      }

      const timer = setTimeout(()=>{
        if(cancelled) return;
        cleanup();
        startDrag(item, list, itemSelector, e, onCommit);
      }, HOLD_MS);

      document.addEventListener('pointermove', moveCancel);
      document.addEventListener('pointerup', upCancel);
      document.addEventListener('pointercancel', upCancel);
    });
  });
}

function startDrag(item, list, itemSelector, startEvent, onCommit){
  if(navigator.vibrate) navigator.vibrate(12);

  const rect = item.getBoundingClientRect();
  const offsetY = startEvent.clientY - rect.top;
  const prevBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.style.userSelect = 'none';
  const prevTouchAction = item.style.touchAction;
  item.style.touchAction = 'none';

  // claim this pointer so mobile browsers don't hijack the gesture for scrolling mid-drag
  try{ item.setPointerCapture(startEvent.pointerId); }catch(e){ /* not critical if unsupported */ }

  // placeholder takes up the exact same space the card had, so nothing collapses
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

  function getSiblings(){
    return Array.from(list.querySelectorAll(itemSelector)).filter(el=> el!==item);
  }

  function onMove(ev){
    ev.preventDefault();
    const y = ev.clientY - offsetY;
    item.style.top = y + 'px';

    const siblings = getSiblings();
    let target = null;
    for(const sib of siblings){
      const sRect = sib.getBoundingClientRect();
      const mid = sRect.top + sRect.height/2;
      if(ev.clientY < mid){ target = sib; break; }
    }

    const wouldMove = target ? (placeholder.nextElementSibling !== target) : (placeholder !== list.lastElementChild);
    if(!wouldMove) return;

    // capture positions before the move, animate the slide after
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

  function endDrag(){
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', endDrag);
    document.removeEventListener('pointercancel', endDrag);

    try{ item.releasePointerCapture(startEvent.pointerId); }catch(e){ /* already released */ }

    list.insertBefore(item, placeholder);
    placeholder.remove();

    item.classList.remove('dragging');
    item.style.position = '';
    item.style.left = '';
    item.style.top = '';
    item.style.width = '';
    item.style.pointerEvents = '';
    item.style.zIndex = '';
    item.style.touchAction = prevTouchAction;
    document.body.style.overflow = prevBodyOverflow;
    document.body.style.userSelect = '';

    // clear any leftover inline transforms/transitions from the reflow animation
    Array.from(list.querySelectorAll(itemSelector)).forEach(el=>{
      el.style.transition = '';
      el.style.transform = '';
    });

    const newOrderIds = Array.from(list.querySelectorAll(itemSelector)).map(el=> el.dataset.dragId);
    onCommit(newOrderIds);
  }

  document.addEventListener('pointermove', onMove, {passive:false});
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);
}
