// ---------- Score tab ----------

// Shared tile color class — same logic as Home rating pill.
function tileRatingClass(rating){
  if(!rating) return 'rating-none';
  if(rating==='NOT GOOD')   return 'rating-notgood';
  if(rating==='GOOD')       return 'rating-good';
  if(rating==='GREAT!')     return 'rating-great';
  if(rating==='AWESOME!!!') return 'rating-awesome';
  return 'rating-none';
}

// Renders the received/base fraction: received in bold, /base in normal weight.
function scoreFractionHtml(received, base){
  const r = Math.max(0, Math.round(received));
  const b = Math.round(base);
  if(b===0) return `<span class="sf-none">—</span>`;
  return `<span class="sf-received">${r}</span><span class="sf-slash">/</span><span class="sf-base">${b}</span>`;
}

function renderScore(main){
  const s = getScores();
  const today = todayStr();
  const rToday    = getTodayRating();
  const rWeek     = getWeekRating();
  const rMonth    = getCurrentMonthRating();
  const rAllTime  = getAllTimeRating();

  // Hero uses all-time data
  const heroReceived = Math.max(0, Math.round(s.allTime.received));
  const heroBase     = Math.round(s.allTime.base);

  let html = `
    <div class="score-hero">
      <div class="label">${tr('All-time score')}</div>
      <div class="score-hero-fraction">
        ${scoreFractionHtml(s.allTime.received, s.allTime.base)}
      </div>
    </div>
    <div class="score-grid">
      <div class="score-tile ${tileRatingClass(rToday)}">
        <div class="t-label">${tr('Today')}</div>
        <div class="t-fraction">${scoreFractionHtml(s.daily.received, s.daily.base)}</div>
      </div>
      <div class="score-tile ${tileRatingClass(rWeek)}">
        <div class="t-label">${tr('This week')}</div>
        <div class="t-fraction">${scoreFractionHtml(s.weekly.received, s.weekly.base)}</div>
      </div>
      <div class="score-tile ${tileRatingClass(rMonth)}">
        <div class="t-label">${tr('This month')}</div>
        <div class="t-fraction">${scoreFractionHtml(s.monthly.received, s.monthly.base)}</div>
      </div>
      <div class="score-tile ${tileRatingClass(rAllTime)}">
        <div class="t-label">${tr('All-time rating')}</div>
        <div class="t-rating-label">${rAllTime ? tr(rAllTime) : tr('no rating yet')}</div>
      </div>
    </div>
  `;
  main.innerHTML = html;
}
