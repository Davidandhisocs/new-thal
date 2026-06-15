const FILES = {
    achievements: 'https://docs.google.com/spreadsheets/d/1NaHM7tIL6YjiKdBlZo_4nuLqnMWb_VYYs8nfXpvMYf4/export?format=csv&gid=702241830',
    timeline: 'https://docs.google.com/spreadsheets/d/1NaHM7tIL6YjiKdBlZo_4nuLqnMWb_VYYs8nfXpvMYf4/export?format=csv&gid=308560180',
    pending: 'https://docs.google.com/spreadsheets/d/1NaHM7tIL6YjiKdBlZo_4nuLqnMWb_VYYs8nfXpvMYf4/export?format=csv&gid=745690361',
    legacy: 'https://docs.google.com/spreadsheets/d/1NaHM7tIL6YjiKdBlZo_4nuLqnMWb_VYYs8nfXpvMYf4/export?format=csv&gid=1992659129',
};

const TABS = Object.keys(FILES);

const DUPES_MAP = {
    'acheron-2.1': [
        'acheron-97-challenge-2.1',
        'acheron-buffed-2.1',
    ],
    'avernus': [
        'avernus-green-klimk',
        'avernus-green-servax-15-100',
        'avernus-green-servax-95',
        'avernus-pink-41',
        'avernus-white-48',
        'blue-avernus',
    ],
    'slaughterhouse': [
        'blue-slaughterhouse-the-bat0',
        'blue-slaughterhouse-viwi',
        'christmashouse',
        'goldenhouse',
        'green-slaughterhouse',
        'pink-slaughterhouse',
        'white-slaughterhouse',
        'yellow-slaughterhouse',
    ],
    'element-111-rg': [
        'element-111-rg-hack-nerfed',
    ],
    'acheron': [
        'gay-acheron-17-100',
        'green-acheron-17-100',
    ],
    'kyouki': [
        'gayouki-83',
    ],
    'tartarus': [
        'blue-tartarus',
    ],
    'solaria': [
        'scorchlaria-nerf',
    ],
    'tidal-wave': [
        'tidal-wave-buffed',
    ],
    'vsc': [
        'vsc-geist',
        'vsc-infinity',
        'vsc-layout',
        'vsc-lost-sense-deco',
        'vsc-nerfed',
        'vsc-nev-finale-25-68',
        'vsc-on-track',
        'vsc-out',
        'vsc-red',
    ],
};

const DUPE_ID_TO_PARENT = (() => {
    const map = {};
    Object.entries(DUPES_MAP).forEach(([parent, dupeIds]) => {
        dupeIds.forEach(id => { map[id.toLowerCase()] = parent.toLowerCase(); });
    });
    return map;
})();

let state = {
    currentTab: 'achievements',
    sortKey: 'rank',
    sortDir: 'asc',
    search: '',
    includeTags: [],
    excludeTags: [],
    data: {},
    allTags: [],
    searchTimer: null,
};

let editorState = {
    data: [],
    fileKey: '',
    dragSrc: null,
};

function normalizeForSearch(str) {
    return (str || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatLength(seconds) {
    if (!seconds && seconds !== 0) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

function getSearchTokens(str) {
    return normalizeForSearch(str).split(' ').filter(Boolean);
}

function slugifyTag(tag) {
    return (tag || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function itemMatchesSearch(a, queryTokens) {
    if (!queryTokens.length) return true;
    const dupesText = (a.dupes || []).map(d => [d.name, d.player, String(d.id || ''), String(d.levelID || '')].filter(Boolean).join(' ')).join(' ');
    const haystack = normalizeForSearch(
        [a.name, a.player, String(a.id || ''), String(a.levelID || ''), a.submitter, dupesText]
            .filter(Boolean).join(' ')
    );
    const ht = haystack.split(' ').filter(Boolean);
    return queryTokens.every(qt => ht.some(h => h.startsWith(qt)));
}

function itemMatchesTags(a) {
    const tagSet = new Set((a.tags || []).map(t => t.trim().toLowerCase()));
    if (state.includeTags.length && !state.includeTags.every(t => tagSet.has(t))) return false;
    if (state.excludeTags.length && state.excludeTags.some(t => tagSet.has(t))) return false;
    return true;
}

function compareItems(x, y, key) {
    switch (key) {
        case 'name': return (x.name || '').localeCompare(y.name || '');
        case 'length': return (Number(x.length) || 0) - (Number(y.length) || 0);
        case 'levelID': return (Number(x.levelID) || 0) - (Number(y.levelID) || 0);
        case 'date': {
            const da = x.date ? new Date(x.date).getTime() : 0;
            const db = y.date ? new Date(y.date).getTime() : 0;
            return da - db;
        }
        default: return 0;
    }
}

function applyRandom(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

function getFilteredSorted(rawData) {
    const queryTokens = getSearchTokens(state.search);
    let result = rawData.filter(a => itemMatchesSearch(a, queryTokens) && itemMatchesTags(a));
    if (state.sortKey === 'random') {
        result = applyRandom(result);
    } else if (state.sortKey !== 'rank') {
        result.sort((x, y) => compareItems(x, y, state.sortKey));
        if (state.sortDir === 'desc') result.reverse();
    } else {
        if (state.sortDir === 'desc') result = result.slice().reverse();
    }
    return result;
}

function buildTagIndex(data) {
    const tagSet = new Set();
    (data || []).forEach(a => (a.tags || []).forEach(t => tagSet.add(t.trim())));
    state.allTags = Array.from(tagSet).sort();
}

function mergeDupes(list) {
    const dupeIdSet = new Set(Object.keys(DUPE_ID_TO_PARENT));

    const dupeItems = [];
    const mainItems = [];

    list.forEach(item => {
        const idLow = item.id ? String(item.id).toLowerCase() : null;
        if (idLow && dupeIdSet.has(idLow)) {
            dupeItems.push(item);
        } else {
            mainItems.push(item);
        }
    });

    dupeItems.forEach(dupeItem => {
        const idLow = String(dupeItem.id).toLowerCase();
        const parentKey = DUPE_ID_TO_PARENT[idLow];
        const parent = mainItems.find(p => p.id && String(p.id).toLowerCase() === parentKey);
        if (parent) {
            if (!parent.dupes) parent.dupes = [];
            parent.dupes.push(dupeItem);
        } else {
            mainItems.push(dupeItem);
        }
    });

    return mainItems;
}

function getYouTubeId(url) {
    if (!url) return null;
    const m = url.match(/(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/shorts\/))([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
}

function buildVideoBlock(url, label) {
    const wrap = document.createElement('div');
    const lbl = document.createElement('div');
    lbl.className = 'modal-video-label';
    lbl.textContent = label;
    wrap.appendChild(lbl);

    const ytId = getYouTubeId(url);
    if (ytId) {
        const embedWrap = document.createElement('div');
        embedWrap.className = 'modal-video-embed';
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube-nocookie.com/embed/${ytId}`;
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        embedWrap.appendChild(iframe);
        wrap.appendChild(embedWrap);
    } else {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = 'modal-video-link';
        a.textContent = '▶ Watch Video';
        wrap.appendChild(a);
    }
    return wrap;
}

function buildDupesSection(dupes) {
    const section = document.createElement('div');
    section.className = 'modal-dupes-section';

    const toggle = document.createElement('button');
    toggle.className = 'modal-dupes-toggle';
    toggle.innerHTML = `<span class="modal-dupes-icon">⊞</span> ${dupes.length} Dupe${dupes.length !== 1 ? 's' : ''} <span class="modal-dupes-chevron">▾</span>`;
    section.appendChild(toggle);

    const list = document.createElement('div');
    list.className = 'modal-dupes-list';

    dupes.forEach(dupe => {
        const card = document.createElement('div');
        card.className = 'modal-dupe-card';

        const nameRow = document.createElement('div');
        nameRow.className = 'modal-dupe-name';
        nameRow.textContent = dupe.name || 'Unnamed';
        card.appendChild(nameRow);

        const fields = [
            dupe.player ? ['Player', escapeHtml(dupe.player)] : null,
            dupe.date ? ['Date', escapeHtml(dupe.date)] : null,
            formatLength(dupe.length) ? ['Length', formatLength(dupe.length)] : null,
            dupe.levelID ? ['ID', escapeHtml(String(dupe.levelID))] : null,
        ].filter(Boolean);

        if (fields.length) {
            const meta = document.createElement('div');
            meta.className = 'modal-dupe-meta';
            fields.forEach(([label, val]) => {
                const f = document.createElement('span');
                f.className = 'modal-dupe-field';
                f.innerHTML = `<strong>${label}:</strong> ${val}`;
                meta.appendChild(f);
            });
            card.appendChild(meta);
        }

        if (dupe.video || dupe.showcaseVideo) {
            const videosWrap = document.createElement('div');
            videosWrap.className = 'modal-dupe-videos';
            if (dupe.video) videosWrap.appendChild(buildVideoBlock(dupe.video, 'Video'));
            if (dupe.showcaseVideo) videosWrap.appendChild(buildVideoBlock(dupe.showcaseVideo, 'Showcase'));
            card.appendChild(videosWrap);
        }

        list.appendChild(card);
    });

    section.appendChild(list);

    let open = false;
    toggle.addEventListener('click', () => {
        open = !open;
        list.classList.toggle('open', open);
        toggle.classList.toggle('open', open);
        const chevron = toggle.querySelector('.modal-dupes-chevron');
        if (chevron) chevron.textContent = open ? '▴' : '▾';
    });

    return section;
}

function openModal(a, rank) {
    const inner = document.getElementById('modalInner');
    inner.innerHTML = '';

    if (rank !== null) {
        const rankEl = document.createElement('div');
        rankEl.className = 'modal-rank';
        rankEl.textContent = `#${rank}`;
        inner.appendChild(rankEl);
    }

    const title = document.createElement('h2');
    title.className = 'modal-title';
    title.textContent = a.name || 'Unnamed';
    inner.appendChild(title);

    const fields = [
        a.player ? ['Player', escapeHtml(a.player)] : null,
        a.date ? ['Date', escapeHtml(a.date)] : null,
        formatLength(a.length) ? ['Length', formatLength(a.length)] : null,
        a.levelID ? ['Level ID', escapeHtml(String(a.levelID))] : null,
        a.id ? ['ID', escapeHtml(String(a.id))] : null,
    ].filter(Boolean);

    if (fields.length) {
        const grid = document.createElement('div');
        grid.className = 'modal-fields';
        fields.forEach(([label, val]) => {
            const f = document.createElement('div');
            f.className = 'modal-field';
            f.innerHTML = `<strong>${label}:</strong>${val}`;
            grid.appendChild(f);
        });
        inner.appendChild(grid);
    }

    if (a.tags && a.tags.length) {
        const tagsWrap = document.createElement('div');
        tagsWrap.className = 'modal-tags';
        a.tags.forEach(tag => {
            const sp = document.createElement('span');
            const slug = slugifyTag(tag);
            sp.className = 'modal-tag' + (slug ? ' tag-' + slug : '');
            sp.textContent = tag;
            sp.addEventListener('click', () => {
                closeModal();
                const norm = tag.trim().toLowerCase();
                if (!state.includeTags.includes(norm)) {
                    state.includeTags = [...state.includeTags, norm];
                    renderTagPills();
                    renderContent();
                }
            });
            tagsWrap.appendChild(sp);
        });
        inner.appendChild(tagsWrap);
    }

    if (a.video || a.showcaseVideo) {
        const videosWrap = document.createElement('div');
        videosWrap.className = 'modal-videos';
        if (a.video) videosWrap.appendChild(buildVideoBlock(a.video, 'Video'));
        if (a.showcaseVideo) videosWrap.appendChild(buildVideoBlock(a.showcaseVideo, 'Showcase'));
        inner.appendChild(videosWrap);
    }

    if (a.dupes && a.dupes.length) {
        inner.appendChild(buildDupesSection(a.dupes));
    }

    if (a.submitter) {
        const submitterNote = document.createElement('div');
        submitterNote.className = 'modal-submitter';
        submitterNote.textContent = `Thanks, ${a.submitter} for submitting this achievement.`;
        inner.appendChild(submitterNote);
    }

    const overlay = document.getElementById('achievementModal');
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    document.getElementById('achievementModal').style.display = 'none';
    document.body.style.overflow = '';
    const videosWrap = document.querySelector('.modal-videos');
    if (videosWrap) videosWrap.innerHTML = '';
}

function renderTagPills() {
    const area = document.getElementById('tagFilterArea');
    const container = document.getElementById('tagPills');
    const clearBtn = document.getElementById('clearFiltersBtn');

    if (!state.allTags.length) { area.style.display = 'none'; return; }
    area.style.display = 'flex';
    container.innerHTML = '';

    state.allTags.forEach(tag => {
        const norm = tag.toLowerCase();
        const slug = slugifyTag(tag);
        const btn = document.createElement('button');
        btn.className = 'tag-pill' + (slug ? ' tag-' + slug : '')
            + (state.includeTags.includes(norm) ? ' included' : '')
            + (state.excludeTags.includes(norm) ? ' excluded' : '');
        btn.textContent = tag;
        btn.title = state.includeTags.includes(norm)
            ? 'Click to exclude · right-click to clear'
            : state.excludeTags.includes(norm)
                ? 'Click to clear'
                : 'Left-click to include · right-click to exclude';

        btn.addEventListener('click', e => {
            e.preventDefault();
            if (state.includeTags.includes(norm)) {
                state.includeTags = state.includeTags.filter(t => t !== norm);
                state.excludeTags = [...state.excludeTags, norm];
            } else if (state.excludeTags.includes(norm)) {
                state.excludeTags = state.excludeTags.filter(t => t !== norm);
            } else {
                state.includeTags = [...state.includeTags, norm];
            }
            renderTagPills(); renderContent();
        });

        btn.addEventListener('contextmenu', e => {
            e.preventDefault();
            if (state.excludeTags.includes(norm)) {
                state.excludeTags = state.excludeTags.filter(t => t !== norm);
            } else if (state.includeTags.includes(norm)) {
                state.includeTags = state.includeTags.filter(t => t !== norm);
            } else {
                state.excludeTags = [...state.excludeTags, norm];
            }
            renderTagPills(); renderContent();
        });

        container.appendChild(btn);
    });

    clearBtn.style.display = (state.includeTags.length || state.excludeTags.length) ? '' : 'none';
}

function closeHamburger() {
    const btn = document.getElementById('hamburgerBtn');
    const menu = document.getElementById('hamburgerMenu');
    btn.classList.remove('open');
    menu.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-hidden', 'true');
}

function renderTabs() {
    const nav = document.getElementById('tabsNav');
    nav.innerHTML = '';
    TABS.forEach(key => {
        const btn = document.createElement('button');
        btn.className = 'tab' + (state.currentTab === key ? ' active' : '');
        btn.textContent = key;
        btn.addEventListener('click', () => {
            state.currentTab = key;
            state.includeTags = [];
            state.excludeTags = [];
            closeHamburger();
            renderTabs();
            loadData();
        });
        nav.appendChild(btn);
    });

    const labelEl = document.getElementById('activeTabLabel');
    if (labelEl) labelEl.textContent = state.currentTab;
}

function renderContent() {
    const content = document.getElementById('content');
    const meta = document.getElementById('resultsMeta');
    const rawData = state.data[state.currentTab];

    if (!rawData) {
        content.innerHTML = '<div class="loading">Loading…</div>';
        meta.textContent = '';
        return;
    }

    const items = getFilteredSorted(rawData);
    meta.textContent = items.length === rawData.length
        ? `${items.length} entries`
        : `${items.length} of ${rawData.length} entries`;

    if (!items.length) {
        content.innerHTML = '<div class="no-results">No achievements found.</div>';
        return;
    }

    const hideRank = state.currentTab === 'pending';
    const frag = document.createDocumentFragment();

    items.forEach((a, i) => {
        const haThumb = !!a.thumbnail;
        const rank = hideRank ? null : i + 1;

        const outer = document.createElement('div');
        outer.className = 'achievement-item' + (haThumb ? '' : ' no-thumb');
        outer.style.cursor = 'pointer';
        outer.setAttribute('role', 'button');
        outer.setAttribute('tabindex', '0');
        outer.addEventListener('click', () => openModal(a, rank));
        outer.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(a, rank); } });

        if (haThumb) {
            const tc = document.createElement('div');
            tc.className = 'thumbnail-container';
            const img = document.createElement('img');
            img.src = a.thumbnail;
            img.alt = a.name || '';
            img.loading = 'lazy';
            img.onerror = function () { tc.remove(); outer.classList.add('no-thumb'); };
            tc.appendChild(img);
            outer.appendChild(tc);
        }

        const meta = document.createElement('div');
        meta.className = 'achievement-meta';

        if (a.tags && a.tags.length) {
            const tc2 = document.createElement('div');
            tc2.className = 'tag-container';
            a.tags.slice(0, 4).forEach(tag => {
                const sp = document.createElement('span');
                const slug = slugifyTag(tag);
                sp.className = 'tag' + (slug ? ' tag-' + slug : '');
                sp.textContent = tag;
                sp.title = 'Filter: ' + tag;
                sp.addEventListener('click', e => {
                    e.stopPropagation();
                    const norm = tag.trim().toLowerCase();
                    if (!state.includeTags.includes(norm)) {
                        state.includeTags = [...state.includeTags, norm];
                        renderTagPills(); renderContent();
                    }
                });
                tc2.appendChild(sp);
            });
            meta.appendChild(tc2);
        }

        if (a.dupes && a.dupes.length) {
            const dupeBadge = document.createElement('div');
            dupeBadge.className = 'dupe-badge';
            dupeBadge.textContent = `⊞ ${a.dupes.length} dupe${a.dupes.length !== 1 ? 's' : ''}`;
            dupeBadge.title = a.dupes.map(d => d.name || d.id).join(', ');
            meta.appendChild(dupeBadge);
        }

        const text = document.createElement('div');
        text.className = 'achievement-text';

        const h2 = document.createElement('h2');
        h2.textContent = a.name || 'Unnamed';
        text.appendChild(h2);

        const info = document.createElement('div');
        info.className = 'achievement-info';
        const chips = [
            a.player ? `${escapeHtml(a.player)}` : null,
        ].filter(Boolean);
        chips.forEach(c => {
            const sp = document.createElement('span');
            sp.textContent = c;
            info.appendChild(sp);
        });
        if (chips.length) text.appendChild(info);

        outer.appendChild(text);
        outer.appendChild(meta);

        const rdc = document.createElement('div');
        rdc.className = 'rank-date-container';

        if (a.date) {
            const d = document.createElement('div');
            d.className = 'meta-row';
            d.innerHTML = `<strong>Date:</strong> ${escapeHtml(a.date)}`;
            rdc.appendChild(d);
        }

        const len = formatLength(a.length);
        if (len) {
            const l = document.createElement('div');
            l.className = 'meta-row';
            l.innerHTML = `<strong>Length:</strong> ${len}`;
            rdc.appendChild(l);
        }

        if (a.levelID) {
            const idRow = document.createElement('div');
            idRow.className = 'meta-row';
            idRow.innerHTML = `<strong>ID:</strong> ${escapeHtml(String(a.levelID))}`;
            rdc.appendChild(idRow);
        }

        if (!hideRank) {
            const rankEl = document.createElement('span');
            rankEl.className = 'rank-badge';
            rankEl.textContent = '#' + (i + 1);
            rdc.appendChild(rankEl);
        }

        meta.appendChild(rdc);
        frag.appendChild(outer);
    });

    content.innerHTML = '';
    content.appendChild(frag);
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parseCSV(csv) {
    const lines = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < csv.length; i++) {
        const char = csv[i];
        const nextChar = csv[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === '\n' && !inQuotes) {
            lines.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    if (current) lines.push(current);

    const rows = lines.map(line => {
        const fields = [];
        let field = '';
        let inQuotes2 = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (char === '"') {
                if (inQuotes2 && nextChar === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes2 = !inQuotes2;
                }
            } else if (char === ',' && !inQuotes2) {
                fields.push(field.trim());
                field = '';
            } else {
                field += char;
            }
        }
        if (field || fields.length > 0) fields.push(field.trim());
        return fields;
    });

    return rows.slice(1).map(r => ({
        name: r[0] || '',
        player: r[1] || '',
        date: r[2] || '',
        length: Number(r[3]) || undefined,
        levelID: r[4] || '',
        id: r[5] || '',
        submitter: r[6] || '',
        tags: r[7]?.split(';').map(t => t.trim()).filter(Boolean) || [],
        thumbnail: r[8] || '',
        video: r[9] || '',
        showcaseVideo: r[10] || '',
    })).filter(a => a && a.name);
}

function loadData() {
    if (state.data[state.currentTab] !== undefined) {
        buildTagIndex(state.data[state.currentTab]);
        renderTagPills();
        renderContent();
        loadBackground();
        return;
    }

    document.getElementById('content').innerHTML = '<div class="loading">Loading…</div>';
    document.getElementById('resultsMeta').textContent = '';
    
    fetch(FILES[state.currentTab])
        .then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.text();
        })
        .then(csv => {
            const list = parseCSV(csv);
            const merged = mergeDupes(list);
            state.data[state.currentTab] = merged;
            buildTagIndex(merged);
            renderTagPills();
            renderContent();
            loadBackground();
        })
        .catch(err => {
            console.error('Load error:', err);
            document.getElementById('content').innerHTML =
                `<div class="error">Failed to load: ${escapeHtml(err.message)}</div>`;
        });
}

function updateSortDirBtn() {
    const btn = document.getElementById('sortDirBtn');
    if (!btn) return;
    btn.textContent = state.sortDir === 'asc' ? '↑' : '↓';
    btn.title = state.sortDir === 'asc' ? 'Ascending — click to reverse' : 'Descending — click to reverse';
}

function openEditor() {
    const rawData = state.data[state.currentTab];

    if (!rawData) {
        alert('No data loaded for this tab. Visit the tab first to load its data.');
        return;
    }

    editorState.fileKey = state.currentTab;
    editorState.data = JSON.parse(JSON.stringify(rawData));
    editorState.dragSrc = null;

    document.getElementById('editorTitle').textContent = `Editing: ${state.currentTab}`;
    renderEditorList();

    document.getElementById('editorModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeEditor() {
    document.getElementById('editorModal').style.display = 'none';
    document.body.style.overflow = '';
}

function applyEditor() {
    state.data[editorState.fileKey] = editorState.data;
    buildTagIndex(editorState.data);
    renderTagPills();
    renderContent();
    closeEditor();
}

function getEditorJSON() {
    return JSON.stringify(
        editorState.data.map(item => {
            const out = {};
            Object.keys(item).forEach(k => {
                const v = item[k];
                if (v === undefined || v === null || v === '') return;
                if (Array.isArray(v) && v.length === 0) return;
                out[k] = v;
            });
            return out;
        }),
        null,
        2
    );
}

function updateEditorCount() {
    document.getElementById('editorCount').textContent = `${editorState.data.length} items`;
}

function renderEditorList() {
    const list = document.getElementById('editorList');
    list.innerHTML = '';
    updateEditorCount();
    editorState.data.forEach((item, index) => {
        list.appendChild(buildEditorRow(item, index));
    });
}

function buildEditorRow(item, index) {
    const row = document.createElement('div');
    row.className = 'editor-row';
    row.draggable = true;

    row.addEventListener('dragstart', e => {
        editorState.dragSrc = index;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => row.classList.add('dragging'), 0);
    });

    row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        document.querySelectorAll('.editor-row.drag-over').forEach(r => r.classList.remove('drag-over'));
    });

    row.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (editorState.dragSrc !== index) {
            document.querySelectorAll('.editor-row.drag-over').forEach(r => r.classList.remove('drag-over'));
            row.classList.add('drag-over');
        }
    });

    row.addEventListener('dragleave', e => {
        if (!row.contains(e.relatedTarget)) {
            row.classList.remove('drag-over');
        }
    });

    row.addEventListener('drop', e => {
        e.preventDefault();
        row.classList.remove('drag-over');
        const src = editorState.dragSrc;
        if (src === null || src === index) return;
        const moved = editorState.data.splice(src, 1)[0];
        editorState.data.splice(index, 0, moved);
        editorState.dragSrc = null;
        renderEditorList();
    });

    const header = document.createElement('div');
    header.className = 'editor-row-header';

    const handle = document.createElement('span');
    handle.className = 'editor-drag-handle';
    handle.textContent = '⠿';
    handle.title = 'Drag to reorder';

    const num = document.createElement('span');
    num.className = 'editor-row-num';
    num.textContent = `#${index + 1}`;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'editor-row-name';
    nameSpan.textContent = item.name || 'Unnamed';

    const rowActions = document.createElement('div');
    rowActions.className = 'editor-row-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'editor-btn';
    editBtn.textContent = 'Edit';

    const dupBtn = document.createElement('button');
    dupBtn.className = 'editor-btn';
    dupBtn.textContent = 'Dup';
    dupBtn.title = 'Duplicate this item';

    const delBtn = document.createElement('button');
    delBtn.className = 'editor-btn editor-btn-del';
    delBtn.textContent = '✕';
    delBtn.title = 'Delete this item';

    rowActions.appendChild(editBtn);
    rowActions.appendChild(dupBtn);
    rowActions.appendChild(delBtn);

    header.appendChild(handle);
    header.appendChild(num);
    header.appendChild(nameSpan);
    header.appendChild(rowActions);

    const fieldsWrap = document.createElement('div');
    fieldsWrap.className = 'editor-row-fields';

    const fieldDefs = [
        { key: 'name', label: 'Name', type: 'text', full: false },
        { key: 'player', label: 'Player', type: 'text', full: false },
        { key: 'date', label: 'Date', type: 'text', full: false },
        { key: 'length', label: 'Length (seconds)', type: 'number', full: false },
        { key: 'levelID', label: 'Level ID', type: 'number', full: false },
        { key: 'id', label: 'ID', type: 'text', full: false },
        { key: 'submitter', label: 'Submitter', type: 'text', full: false },
        { key: 'tags', label: 'Tags (comma-sep)', type: 'tags', full: true },
        { key: 'thumbnail', label: 'Thumbnail URL', type: 'text', full: true },
        { key: 'video', label: 'Video URL', type: 'text', full: true },
        { key: 'showcaseVideo', label: 'Showcase Video URL', type: 'text', full: true },
    ];

    fieldDefs.forEach(({ key, label, type, full }) => {
        const fieldDiv = document.createElement('div');
        fieldDiv.className = 'editor-field' + (full ? ' editor-field-full' : '');

        const lbl = document.createElement('label');
        lbl.textContent = label;

        const input = document.createElement('input');
        input.type = type === 'number' ? 'number' : 'text';
        input.className = 'editor-input';
        input.placeholder = label;

        if (type === 'tags') {
            input.value = (item.tags || []).join(', ');
        } else {
            input.value = (item[key] !== undefined && item[key] !== null) ? String(item[key]) : '';
        }

        input.addEventListener('input', () => {
            if (type === 'tags') {
                item.tags = input.value.split(',').map(t => t.trim()).filter(Boolean);
            } else if (type === 'number') {
                const n = parseFloat(input.value);
                item[key] = isNaN(n) ? undefined : n;
            } else {
                item[key] = input.value || undefined;
            }
            if (key === 'name') nameSpan.textContent = item.name || 'Unnamed';
        });

        fieldDiv.appendChild(lbl);
        fieldDiv.appendChild(input);
        fieldsWrap.appendChild(fieldDiv);
    });

    editBtn.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = fieldsWrap.classList.contains('open');
        fieldsWrap.classList.toggle('open', !isOpen);
        editBtn.textContent = isOpen ? 'Edit' : 'Done';
        editBtn.classList.toggle('active', !isOpen);
    });

    dupBtn.addEventListener('click', e => {
        e.stopPropagation();
        const copy = JSON.parse(JSON.stringify(item));
        editorState.data.splice(index + 1, 0, copy);
        renderEditorList();
    });

    delBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (confirm(`Delete "${item.name || 'Unnamed'}"?`)) {
            editorState.data.splice(index, 1);
            renderEditorList();
        }
    });

    row.appendChild(header);
    row.appendChild(fieldsWrap);
    return row;
}

const bgState = {
    lastBg: null,
    activeIndex: 0,
    pendingImg: null,
};

function loadBackground(bgImage) {
    const layer0 = document.getElementById('bg-layer-0');
    const layer1 = document.getElementById('bg-layer-1');
    const layers = [layer0, layer1];

    if (bgState.pendingImg) {
        bgState.pendingImg.onload = null;
        bgState.pendingImg = null;
    }

    function applyBg(url) {
        if (!url || bgState.lastBg === url) return;
        const next = 1 - bgState.activeIndex;
        const target = layers[next];
        if (!target) return;
        const img = new Image();
        bgState.pendingImg = img;
        img.src = url;
        img.onload = () => {
            target.style.backgroundImage = `url('${url}')`;
            target.classList.add('show');
            const prev = layers[1 - next];
            if (prev) prev.classList.remove('show');
            bgState.activeIndex = next;
            bgState.lastBg = url;
            bgState.pendingImg = null;
        };
    }

    if (bgImage) {
        applyBg(bgImage);
        return;
    }

    const data = state.data[state.currentTab];
    if (!data || !data.length) return;

    const top = data.find(a => a && (a.thumbnail || a.levelID));
    if (!top) return;

    const url = top.thumbnail ||
        (top.levelID ? `https://levelthumbs.prevter.me/thumbnail/${top.levelID}/small` : null);

    applyBg(url);
}

function init() {
    try { state.sortKey = localStorage.getItem('thal_sort_key_achievements') || 'rank'; } catch (e) { }
    try { state.sortDir = localStorage.getItem('thal_sort_dir_achievements') || 'asc'; } catch (e) { }

    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) sortSelect.value = state.sortKey;
    updateSortDirBtn();
    renderTabs();
    loadData();
    if (typeof loadBackground === 'function') loadBackground();

    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const hamburgerMenu = document.getElementById('hamburgerMenu');

    if (hamburgerBtn) {
        hamburgerBtn.addEventListener('click', e => {
            e.stopPropagation();
            const isOpen = hamburgerMenu.classList.contains('open');
            hamburgerMenu.classList.toggle('open', !isOpen);
            hamburgerBtn.classList.toggle('open', !isOpen);
            hamburgerBtn.setAttribute('aria-expanded', String(!isOpen));
            hamburgerMenu.setAttribute('aria-hidden', String(isOpen));
        });
    }

    document.addEventListener('click', e => {
        if (hamburgerMenu && !hamburgerMenu.contains(e.target) && e.target !== hamburgerBtn) {
            closeHamburger();
        }
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (hamburgerMenu && hamburgerMenu.classList.contains('open')) {
                closeHamburger();
                return;
            }
        }
    });

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', e => {
            if (e.target.value.trim().toLowerCase() === 'edit') {
                e.target.value = '';
                state.search = '';
                openEditor();
                return;
            }
            clearTimeout(state.searchTimer);
            state.searchTimer = setTimeout(() => { state.search = e.target.value; renderContent(); }, 150);
        });
    }

    const sortSelect2 = document.getElementById('sortSelect');
    if (sortSelect2) {
        sortSelect2.addEventListener('change', e => {
            state.sortKey = e.target.value;
            try { localStorage.setItem('thal_sort_key_achievements', state.sortKey); } catch (_) { }
            if (state.sortKey === 'random') state.data = {};
            renderContent();
        });
    }

    const sortDirBtn = document.getElementById('sortDirBtn');
    if (sortDirBtn) {
        sortDirBtn.addEventListener('click', () => {
            state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
            try { localStorage.setItem('thal_sort_dir_achievements', state.sortDir); } catch (_) { }
            updateSortDirBtn();
            renderContent();
        });
    }

    const clearFiltersBtn = document.getElementById('clearFiltersBtn');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            state.includeTags = [];
            state.excludeTags = [];
            renderTagPills();
            renderContent();
        });
    }

    const modalClose = document.getElementById('modalClose');
    if (modalClose) {
        modalClose.addEventListener('click', closeModal);
    }

    const overlay = document.getElementById('achievementModal');
    if (overlay) {
        overlay.addEventListener('click', closeModal);
        const modalBox = document.querySelector('.modal-box');
        if (modalBox) modalBox.addEventListener('click', e => e.stopPropagation());
    }

    const editorApplyBtn = document.getElementById('editorApplyBtn');
    if (editorApplyBtn) {
        editorApplyBtn.addEventListener('click', applyEditor);
    }

    const editorCloseBtn = document.getElementById('editorCloseBtn');
    if (editorCloseBtn) {
        editorCloseBtn.addEventListener('click', () => {
            if (editorState.data.length && !confirm('Discard all changes?')) return;
            closeEditor();
        });
    }

    const editorModal = document.getElementById('editorModal');
    if (editorModal) {
        editorModal.addEventListener('click', e => {
            if (e.target === editorModal) {
                if (!confirm('Discard all changes?')) return;
                closeEditor();
            }
        });
    }

    const editorAddBtn = document.getElementById('editorAddBtn');
    if (editorAddBtn) {
        editorAddBtn.addEventListener('click', () => {
            editorState.data.push({ name: 'New Item' });
            renderEditorList();
            requestAnimationFrame(() => {
                const list = document.getElementById('editorList');
                list.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
        });
    }

    const editorCopyBtn = document.getElementById('editorCopyBtn');
    if (editorCopyBtn) {
        editorCopyBtn.addEventListener('click', () => {
            const btn = editorCopyBtn;
            const json = getEditorJSON();
            const restore = btn.textContent;

            navigator.clipboard.writeText(json)
                .then(() => {
                    btn.textContent = '✓ Copied!';
                    btn.classList.add('success');
                    setTimeout(() => { btn.textContent = restore; btn.classList.remove('success'); }, 2200);
                })
                .catch(() => {
                    const ta = document.createElement('textarea');
                    ta.value = json;
                    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    btn.textContent = '✓ Copied!';
                    btn.classList.add('success');
                    setTimeout(() => { btn.textContent = restore; btn.classList.remove('success'); }, 2200);
                });
        });
    }

    const editorDownloadBtn = document.getElementById('editorDownloadBtn');
    if (editorDownloadBtn) {
        editorDownloadBtn.addEventListener('click', () => {
            const json = getEditorJSON();
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${editorState.fileKey}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    document.addEventListener('keydown', e => {
        if (e.shiftKey && e.key === 'M') {
            openEditor();
            return;
        }
        if (e.key === 'Escape') {
            const editorModal = document.getElementById('editorModal');
            if (editorModal && editorModal.style.display !== 'none') {
                if (!confirm('Discard all changes?')) return;
                closeEditor();
            } else {
                closeModal();
            }
        }
    });
}

init();
