// ---- CONFIG ----
// Using a public OMDB demo key — replace with your own from https://www.omdbapi.com/apikey.aspx (free)
const API_KEY = 'trilogy'; // demo key, limited to some titles; get your free key
const API_BASE = 'https://www.omdbapi.com/';

// ---- STATE ----
let state = {
  query: '',
  type: 'movie',
  year: '',
  sort: 'relevance',
  page: 1,
  totalResults: 0,
  watchlist: JSON.parse(localStorage.getItem('cinesearch_watchlist') || '[]'),
};

// ---- DOM ----
const header        = document.getElementById('navbar');
const searchInput   = document.getElementById('search');
const searchBtn     = document.getElementById('searchBtn');
const yearFilter    = document.getElementById('yearFilter');
const sortBy        = document.getElementById('sortBy');
const resultSection = document.getElementById('resultsSection');
const resultGrid    = document.getElementById('resultContainer');
const resultsMeta   = document.getElementById('resultsMeta');
const pagination    = document.getElementById('pagination');
const modalOverlay  = document.getElementById('modalOverlay');
const modalClose    = document.getElementById('modalClose');
const modalContent  = document.getElementById('modalContent');
const watchlistPanel = document.getElementById('watchlistPanel');
const watchlistToggle = document.getElementById('watchlistToggle');
const watchlistItems  = document.getElementById('watchlistItems');
const wlCount         = document.getElementById('wlCount');
const closeWatchlist  = document.getElementById('closeWatchlist');
const toast           = document.getElementById('toast');

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => header.classList.add('loaded'), 100);

  // Nav type filter
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      state.type = link.dataset.type;
      if (state.query) triggerSearch();
    });
  });

  searchBtn.addEventListener('click', triggerSearch);
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') triggerSearch(); });
  sortBy.addEventListener('change', () => { state.sort = sortBy.value; if (state.query) applySortAndRender(); });
  yearFilter.addEventListener('change', () => { state.year = yearFilter.value.trim(); if (state.query) triggerSearch(); });

  watchlistToggle.addEventListener('click', toggleWatchlist);
  closeWatchlist.addEventListener('click', () => watchlistPanel.style.display = 'none');
  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  updateWatchlistUI();
});

// ---- SEARCH ----
let lastResults = [];

async function triggerSearch() {
  const q = searchInput.value.trim();
  if (!q) return;

  state.query = q;
  state.page = 1;

  animateBtn();
  showSkeletons();
  resultSection.style.display = 'block';

  try {
    const data = await fetchSearch(q, state.page);
    if (data.Response === 'True') {
      lastResults = data.Search;
      state.totalResults = parseInt(data.totalResults, 10);
      applySortAndRender();
    } else {
      showEmpty(data.Error || 'No results found.');
    }
  } catch (err) {
    showError();
  }
}

async function fetchSearch(query, page) {
  const params = new URLSearchParams({
    apikey: API_KEY,
    s: query,
    page,
    ...(state.type && { type: state.type }),
    ...(state.year && { y: state.year }),
  });
  const res = await fetch(`${API_BASE}?${params}`);
  if (!res.ok) throw new Error('Network error');
  return res.json();
}

async function fetchDetail(imdbID) {
  const params = new URLSearchParams({ apikey: API_KEY, i: imdbID, plot: 'full' });
  const res = await fetch(`${API_BASE}?${params}`);
  if (!res.ok) throw new Error('Network error');
  return res.json();
}

// ---- SORT & RENDER ----
function applySortAndRender() {
  let sorted = [...lastResults];
  switch (state.sort) {
    case 'year_desc': sorted.sort((a, b) => parseInt(b.Year) - parseInt(a.Year)); break;
    case 'year_asc':  sorted.sort((a, b) => parseInt(a.Year) - parseInt(b.Year)); break;
    case 'title_asc': sorted.sort((a, b) => a.Title.localeCompare(b.Title)); break;
  }
  renderResults(sorted);
  renderPagination();
  updateMeta();
}

function renderResults(movies) {
  resultGrid.innerHTML = '';
  movies.forEach((movie, i) => {
    const card = createCard(movie, i);
    resultGrid.appendChild(card);
  });
}

function createCard(movie, index) {
  const inWL = isInWatchlist(movie.imdbID);
  const div = document.createElement('div');
  div.className = 'movie-card';
  div.style.animationDelay = `${index * 40}ms`;

  const hasPoster = movie.Poster && movie.Poster !== 'N/A';
  const posterHTML = hasPoster
    ? `<img class="card-poster" src="${movie.Poster}" alt="${escHtml(movie.Title)}" loading="lazy">`
    : `<div class="card-poster-placeholder"><span class="placeholder-icon">&#127909;</span><span class="placeholder-text">${escHtml(movie.Title)}</span></div>`;

  div.innerHTML = `
    ${posterHTML}
    <div class="card-body">
      <div class="card-title">${escHtml(movie.Title)}</div>
      <div class="card-meta">
        <span class="card-year">${movie.Year}</span>
        <span class="card-type">${movie.Type}</span>
        <button class="card-wl-btn ${inWL ? 'in-watchlist' : ''}" data-id="${movie.imdbID}" title="${inWL ? 'Remove from watchlist' : 'Add to watchlist'}">
          ${inWL ? '&#9733;' : '&#9734;'}
        </button>
      </div>
    </div>
  `;

  div.addEventListener('click', e => {
    if (e.target.closest('.card-wl-btn')) {
      e.stopPropagation();
      toggleWatchlistItem(movie, div.querySelector('.card-wl-btn'));
    } else {
      openModal(movie.imdbID);
    }
  });

  return div;
}

// ---- PAGINATION ----
function renderPagination() {
  pagination.innerHTML = '';
  const totalPages = Math.ceil(state.totalResults / 10);
  if (totalPages <= 1) return;

  const maxVisible = 5;
  let startPage = Math.max(1, state.page - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);
  if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);

  const prevBtn = makePageBtn('&#8592;', state.page > 1, () => goToPage(state.page - 1));
  pagination.appendChild(prevBtn);

  for (let p = startPage; p <= endPage; p++) {
    const btn = makePageBtn(p, true, () => goToPage(p));
    if (p === state.page) btn.classList.add('active');
    pagination.appendChild(btn);
  }

  const nextBtn = makePageBtn('&#8594;', state.page < totalPages, () => goToPage(state.page + 1));
  pagination.appendChild(nextBtn);
}

function makePageBtn(label, enabled, onClick) {
  const btn = document.createElement('button');
  btn.className = 'page-btn';
  btn.innerHTML = label;
  btn.disabled = !enabled;
  if (enabled) btn.addEventListener('click', onClick);
  return btn;
}

async function goToPage(page) {
  state.page = page;
  showSkeletons();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  try {
    const data = await fetchSearch(state.query, page);
    if (data.Response === 'True') {
      lastResults = data.Search;
      state.totalResults = parseInt(data.totalResults, 10);
      applySortAndRender();
    } else {
      showEmpty(data.Error || 'No results found.');
    }
  } catch { showError(); }
}

function updateMeta() {
  const start = (state.page - 1) * 10 + 1;
  const end = Math.min(state.page * 10, state.totalResults);
  resultsMeta.innerHTML = `Showing <span>${start}–${end}</span> of <span>${state.totalResults.toLocaleString()}</span> results for "<span>${escHtml(state.query)}</span>"`;
}

// ---- MODAL ----
async function openModal(imdbID) {
  modalContent.innerHTML = '<div class="state-message"><div class="state-icon">&#8987;</div><p>Loading details...</p></div>';
  modalOverlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  try {
    const movie = await fetchDetail(imdbID);
    if (movie.Response === 'True') {
      renderModal(movie);
    } else {
      modalContent.innerHTML = '<div class="state-message"><h3>Could not load details</h3></div>';
    }
  } catch {
    modalContent.innerHTML = '<div class="state-message"><h3>Network error</h3></div>';
  }
}

function renderModal(m) {
  const inWL = isInWatchlist(m.imdbID);
  const hasPoster = m.Poster && m.Poster !== 'N/A';
  const posterHTML = hasPoster
    ? `<img class="modal-poster" src="${m.Poster}" alt="${escHtml(m.Title)}">`
    : `<div class="modal-poster-placeholder">&#127909;</div>`;

  const rating = m.imdbRating !== 'N/A' ? m.imdbRating : null;
  const votes  = m.imdbVotes  !== 'N/A' ? m.imdbVotes  : null;
  const genres = m.Genre && m.Genre !== 'N/A' ? m.Genre.split(', ') : [];

  modalContent.innerHTML = `
    <div class="modal-inner">
      ${posterHTML}
      <div class="modal-info">
        <div class="modal-type-badge">${m.Type}</div>
        <h2 class="modal-title">${escHtml(m.Title)}</h2>
        <p class="modal-year-runtime">${m.Year}${m.Runtime && m.Runtime !== 'N/A' ? ' &nbsp;·&nbsp; ' + m.Runtime : ''}${m.Rated && m.Rated !== 'N/A' ? ' &nbsp;·&nbsp; ' + m.Rated : ''}</p>
        ${rating ? `
          <div class="modal-rating">
            <span class="rating-star">&#9733;</span>
            <span class="rating-value">${rating}</span>
            <span class="rating-max">/ 10</span>
            ${votes ? `<span class="rating-votes">(${votes} votes)</span>` : ''}
          </div>` : ''}
        ${genres.length ? `
          <div class="modal-genres">
            ${genres.map(g => `<span class="genre-tag">${g}</span>`).join('')}
          </div>` : ''}
        ${m.Plot && m.Plot !== 'N/A' ? `<p class="modal-plot">${escHtml(m.Plot)}</p>` : ''}
        <div class="modal-details">
          ${m.Director && m.Director !== 'N/A' ? `<div class="detail-item"><div class="detail-label">Director</div><div class="detail-value">${escHtml(m.Director)}</div></div>` : ''}
          ${m.Actors && m.Actors !== 'N/A'   ? `<div class="detail-item"><div class="detail-label">Cast</div><div class="detail-value">${escHtml(m.Actors)}</div></div>` : ''}
          ${m.Language && m.Language !== 'N/A' ? `<div class="detail-item"><div class="detail-label">Language</div><div class="detail-value">${escHtml(m.Language)}</div></div>` : ''}
          ${m.Country && m.Country !== 'N/A'   ? `<div class="detail-item"><div class="detail-label">Country</div><div class="detail-value">${escHtml(m.Country)}</div></div>` : ''}
          ${m.BoxOffice && m.BoxOffice !== 'N/A' ? `<div class="detail-item"><div class="detail-label">Box Office</div><div class="detail-value">${escHtml(m.BoxOffice)}</div></div>` : ''}
          ${m.Awards && m.Awards !== 'N/A' ? `<div class="detail-item"><div class="detail-label">Awards</div><div class="detail-value">${escHtml(m.Awards)}</div></div>` : ''}
        </div>
        <div class="modal-actions">
          <button class="btn-wl ${inWL ? 'added' : ''}" id="modalWlBtn" data-id="${m.imdbID}">
            ${inWL ? '&#9733; In Watchlist' : '&#9734; Add to Watchlist'}
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('modalWlBtn').addEventListener('click', () => {
    const btn = document.getElementById('modalWlBtn');
    const movieData = { imdbID: m.imdbID, Title: m.Title, Year: m.Year, Poster: m.Poster, Type: m.Type };
    toggleWatchlistItem(movieData, btn, true);
  });
}

function closeModal() {
  modalOverlay.style.display = 'none';
  document.body.style.overflow = '';
}

// ---- WATCHLIST ----
function isInWatchlist(id) {
  return state.watchlist.some(m => m.imdbID === id);
}

function toggleWatchlistItem(movie, btnEl, isModal = false) {
  const idx = state.watchlist.findIndex(m => m.imdbID === movie.imdbID);
  if (idx === -1) {
    state.watchlist.push(movie);
    showToast(`"${movie.Title}" added to watchlist`);
    if (isModal) {
      btnEl.classList.add('added');
      btnEl.innerHTML = '&#9733; In Watchlist';
    } else {
      btnEl.classList.add('in-watchlist');
      btnEl.innerHTML = '&#9733;';
    }
  } else {
    state.watchlist.splice(idx, 1);
    showToast(`"${movie.Title}" removed from watchlist`);
    if (isModal) {
      btnEl.classList.remove('added');
      btnEl.innerHTML = '&#9734; Add to Watchlist';
    } else {
      btnEl.classList.remove('in-watchlist');
      btnEl.innerHTML = '&#9734;';
    }
  }
  saveWatchlist();
  updateWatchlistUI();
}

function saveWatchlist() {
  localStorage.setItem('cinesearch_watchlist', JSON.stringify(state.watchlist));
}

function updateWatchlistUI() {
  wlCount.textContent = state.watchlist.length;
  renderWatchlistItems();
}

function renderWatchlistItems() {
  if (state.watchlist.length === 0) {
    watchlistItems.innerHTML = `
      <div class="wl-empty">
        <div class="wl-empty-icon">&#9734;</div>
        <p>No movies saved yet.<br>Click the star on any movie to add it.</p>
      </div>`;
    return;
  }
  watchlistItems.innerHTML = state.watchlist.map(m => {
    const hasPoster = m.Poster && m.Poster !== 'N/A';
    return `
      <div class="watchlist-item" data-id="${m.imdbID}">
        ${hasPoster
          ? `<img class="wl-item-poster" src="${m.Poster}" alt="${escHtml(m.Title)}">`
          : `<div class="wl-item-poster" style="display:flex;align-items:center;justify-content:center;font-size:1.2rem;opacity:0.3;">&#127909;</div>`}
        <div class="wl-item-info">
          <div class="wl-item-title">${escHtml(m.Title)}</div>
          <div class="wl-item-year">${m.Year} · ${m.Type}</div>
        </div>
        <button class="wl-remove" data-id="${m.imdbID}" title="Remove">&#10005;</button>
      </div>`;
  }).join('');

  watchlistItems.querySelectorAll('.watchlist-item').forEach(item => {
    item.addEventListener('click', e => {
      if (!e.target.closest('.wl-remove')) {
        openModal(item.dataset.id);
      }
    });
  });

  watchlistItems.querySelectorAll('.wl-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const movie = state.watchlist.find(m => m.imdbID === id);
      if (movie) {
        state.watchlist = state.watchlist.filter(m => m.imdbID !== id);
        saveWatchlist();
        updateWatchlistUI();
        showToast(`"${movie.Title}" removed`);
        // Update card star if visible
        const cardBtn = document.querySelector(`.card-wl-btn[data-id="${id}"]`);
        if (cardBtn) { cardBtn.classList.remove('in-watchlist'); cardBtn.innerHTML = '&#9734;'; }
      }
    });
  });
}

function toggleWatchlist() {
  const visible = watchlistPanel.style.display === 'flex' || watchlistPanel.style.display === 'block';
  watchlistPanel.style.display = visible ? 'none' : 'flex';
  watchlistPanel.style.flexDirection = 'column';
}

// ---- LOADING & ERROR STATES ----
function showSkeletons(count = 10) {
  resultGrid.innerHTML = Array(count).fill(`
    <div class="skeleton-card">
      <div class="skeleton-poster"></div>
      <div class="skeleton-body">
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
      </div>
    </div>
  `).join('');
  resultsMeta.innerHTML = '';
  pagination.innerHTML = '';
}

function showEmpty(msg) {
  resultGrid.innerHTML = `
    <div class="state-message" style="grid-column:1/-1;">
      <div class="state-icon">&#128269;</div>
      <h3>No results found</h3>
      <p>${escHtml(msg)}</p>
    </div>`;
  resultsMeta.innerHTML = '';
  pagination.innerHTML = '';
}

function showError() {
  resultGrid.innerHTML = `
    <div class="state-message" style="grid-column:1/-1;">
      <div class="state-icon">&#9888;</div>
      <h3>Something went wrong</h3>
      <p>Could not reach the movie database. Check your connection and try again.</p>
    </div>`;
}

// ---- TOAST ----
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ---- UTILS ----
function animateBtn() {
  searchBtn.animate([
    { transform: 'scale(1)' },
    { transform: 'scale(0.93)' },
    { transform: 'scale(1)' }
  ], { duration: 200, easing: 'ease-out' });
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
