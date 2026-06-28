// ---------- Score tab ----------
function renderScore(main){
  const s = getScores();
  let html = `
    <div class="score-hero">
      <div class="label">All-time score</div>
      <div class="number ${s.allTime<0?'negative':''}">${s.allTime>0?'+':''}${s.allTime}</div>
    </div>
    <div class="score-grid">
      <div class="score-tile">
        <div class="t-label">Today</div>
        <div class="t-value ${s.daily<0?'negative':''}">${s.daily>0?'+':''}${s.daily}</div>
      </div>
      <div class="score-tile">
        <div class="t-label">This week</div>
        <div class="t-value ${s.weekly<0?'negative':''}">${s.weekly>0?'+':''}${s.weekly}</div>
      </div>
      <div class="score-tile">
        <div class="t-label">This month</div>
        <div class="t-value ${s.monthly<0?'negative':''}">${s.monthly>0?'+':''}${s.monthly}</div>
      </div>
      <div class="score-tile">
        <div class="t-label">Routines tracked</div>
        <div class="t-value">${state.routines.length}</div>
      </div>
    </div>
  `;
  main.innerHTML = html;
}
