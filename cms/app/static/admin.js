/* SHY Admin — Client-side logic */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let bios = [];
let pricing = {};
let events = [];
let editingBioId = null;
let editingEventId = null;
let quillEditor = null;

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------
async function api(url, options = {}) {
    const headers = options.headers || {};
    if (options.body && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
        window.location.href = '/';
        return null;
    }
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Something went wrong' }));
        throw new Error(err.detail || 'Something went wrong');
    }
    return res.json();
}

// ---------------------------------------------------------------------------
// Toast notifications
// ---------------------------------------------------------------------------
function toast(message, type = 'success') {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className = 'toast ' + type;
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => el.classList.remove('show'), 3000);
}

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------
function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');

    if (tab === 'instructors' && bios.length === 0) loadBios();
    if (tab === 'pricing' && Object.keys(pricing).length === 0) loadPricing();
    if (tab === 'events' && events.length === 0) loadEvents();
}

// ===================================================================
// INSTRUCTORS
// ===================================================================
async function loadBios() {
    const container = document.getElementById('bios-list');
    container.innerHTML = '<div class="loading">Loading instructors...</div>';
    try {
        bios = await api('/api/bios');
        renderBios();
    } catch (e) {
        container.innerHTML = '<div class="loading">Failed to load instructors.</div>';
    }
}

function renderBios() {
    const container = document.getElementById('bios-list');
    if (!bios.length) {
        container.innerHTML = '<div class="loading">No instructors yet. Click "+ Add Instructor" to get started.</div>';
        return;
    }
    container.innerHTML = bios.map((bio, i) => {
        const imgSrc = bio.image ? `/images/${encodeURIComponent(bio.image)}` : '';
        return `
        <div class="bio-card" onclick="openBioEditor('${bio.id}')">
            <div class="order-arrows" onclick="event.stopPropagation()">
                <button class="order-btn" onclick="moveBio('${bio.id}', -1)" title="Move up">▲</button>
                <button class="order-btn" onclick="moveBio('${bio.id}', 1)" title="Move down">▼</button>
            </div>
            ${imgSrc
                ? `<img src="${imgSrc}" alt="${esc(bio.name)}" class="bio-card-img">`
                : '<div class="bio-card-img-placeholder">👤</div>'}
            <h4>${esc(bio.name)}</h4>
            <p>${esc(bio.title)}</p>
        </div>`;
    }).join('');
}

function openBioEditor(id) {
    const modal = document.getElementById('bio-editor-modal');
    const titleEl = document.getElementById('bio-editor-title');
    const deleteBtn = document.getElementById('bio-delete-btn');

    if (id) {
        const bio = bios.find(b => b.id === id);
        if (!bio) return;
        editingBioId = id;
        titleEl.textContent = 'Edit Instructor';
        deleteBtn.style.display = '';
        document.getElementById('bio-name').value = decodeEntities(bio.name);
        document.getElementById('bio-title').value = decodeEntities(bio.title);
        document.getElementById('bio-image-filename').value = bio.image || '';
        setImagePreview(bio.image);
        initQuill(bio.bio);
    } else {
        editingBioId = null;
        titleEl.textContent = 'Add Instructor';
        deleteBtn.style.display = 'none';
        document.getElementById('bio-name').value = '';
        document.getElementById('bio-title').value = '';
        document.getElementById('bio-image-filename').value = '';
        setImagePreview('');
        initQuill('');
    }
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeBioEditor() {
    document.getElementById('bio-editor-modal').classList.remove('open');
    document.body.style.overflow = '';
    editingBioId = null;
}

function initQuill(html) {
    const container = document.getElementById('bio-quill-editor');
    container.innerHTML = '';
    quillEditor = new Quill(container, {
        theme: 'snow',
        modules: {
            toolbar: [
                ['bold', 'italic', 'underline'],
                [{ list: 'ordered' }, { list: 'bullet' }],
                ['clean']
            ]
        },
        placeholder: 'Write the instructor bio here...'
    });
    if (html) {
        quillEditor.root.innerHTML = html;
    }
}

function setImagePreview(filename) {
    const img = document.getElementById('bio-image-preview');
    const prompt = document.getElementById('bio-upload-prompt');
    if (filename) {
        img.src = `/images/${encodeURIComponent(filename)}`;
        img.classList.add('visible');
        prompt.style.display = 'none';
    } else {
        img.src = '';
        img.classList.remove('visible');
        prompt.style.display = '';
    }
}

async function handleImageUpload(input) {
    const file = input.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
        const result = await api('/api/upload/image', { method: 'POST', body: formData });
        document.getElementById('bio-image-filename').value = result.filename;
        setImagePreview(result.filename);
        toast('Photo uploaded');
    } catch (e) {
        toast(e.message, 'error');
    }
    input.value = '';
}

async function saveBio() {
    const name = document.getElementById('bio-name').value.trim();
    const title = document.getElementById('bio-title').value.trim();
    const image = document.getElementById('bio-image-filename').value;
    const bio = quillEditor ? quillEditor.root.innerHTML : '';

    if (!name) { toast('Name is required', 'error'); return; }

    const data = { name, title, image, bio };

    try {
        if (editingBioId) {
            await api(`/api/bios/${editingBioId}`, { method: 'PUT', body: JSON.stringify(data) });
            toast('Instructor updated!');
        } else {
            await api('/api/bios', { method: 'POST', body: JSON.stringify(data) });
            toast('Instructor added!');
        }
        closeBioEditor();
        await loadBios();
    } catch (e) {
        toast(e.message, 'error');
    }
}

async function deleteBio() {
    if (!editingBioId) return;
    const bio = bios.find(b => b.id === editingBioId);
    if (!confirm(`Remove ${bio ? bio.name : 'this instructor'}? This cannot be undone.`)) return;
    try {
        await api(`/api/bios/${editingBioId}`, { method: 'DELETE' });
        toast('Instructor removed');
        closeBioEditor();
        await loadBios();
    } catch (e) {
        toast(e.message, 'error');
    }
}

async function moveBio(id, direction) {
    const idx = bios.findIndex(b => b.id === id);
    const target = idx + direction;
    if (target < 0 || target >= bios.length) return;

    const order = bios.map(b => b.id);
    [order[idx], order[target]] = [order[target], order[idx]];

    try {
        bios = await api('/api/bios/reorder', { method: 'POST', body: JSON.stringify({ order }) });
        renderBios();
    } catch (e) {
        toast(e.message, 'error');
    }
}

// ===================================================================
// PRICING
// ===================================================================
async function loadPricing() {
    const container = document.getElementById('pricing-editor');
    container.innerHTML = '<div class="loading">Loading pricing...</div>';
    try {
        pricing = await api('/api/pricing');
        renderPricing();
    } catch (e) {
        container.innerHTML = '<div class="loading">Failed to load pricing.</div>';
    }
}

function renderPricing() {
    const container = document.getElementById('pricing-editor');

    const notesHtml = `
    <div class="pricing-notes">
        <h3>General Notes</h3>
        <div class="form-group">
            <label>Main Note</label>
            <textarea id="pricing-note" rows="2">${esc(pricing.note || '')}</textarea>
        </div>
        <div class="form-group">
            <label>Rental Note</label>
            <textarea id="pricing-rental-note" rows="2">${esc(pricing.rentalNote || '')}</textarea>
        </div>
    </div>`;

    const sections = [
        { key: 'packages', label: 'Class Packages', hasCtaFields: true },
        { key: 'unlimited', label: 'Unlimited Options', hasCtaFields: true },
        { key: 'specials', label: 'Specials', hasCtaFields: false },
        { key: 'discounts', label: 'Community Discounts', hasCtaFields: false, isDiscount: true }
    ];

    const sectionsHtml = sections.map(sec => {
        const items = pricing[sec.key] || [];
        const itemsHtml = items.map((item, i) => renderPricingItem(sec, item, i)).join('');
        return `
        <div class="pricing-section">
            <h3>${sec.label}</h3>
            <div id="pricing-${sec.key}-items">${itemsHtml}</div>
            <button class="btn btn-sm btn-secondary" onclick="addPricingItem('${sec.key}')">+ Add Item</button>
        </div>`;
    }).join('');

    container.innerHTML = notesHtml + sectionsHtml;
}

function renderPricingItem(sec, item, index) {
    const key = sec.key;
    const featuredCheck = !sec.isDiscount
        ? `<label class="checkbox-label" style="font-size:0.8rem;">
              <input type="checkbox" ${item.featured ? 'checked' : ''} onchange="pricingField('${key}',${index},'featured',this.checked)">
              Featured
           </label>
           <input type="text" value="${esc(item.badge || '')}" placeholder="Badge (e.g. Popular)" style="max-width:140px" onchange="pricingField('${key}',${index},'badge',this.value)">`
        : '';

    const ctaFields = sec.hasCtaFields
        ? `<div class="form-row" style="margin-top:0.5rem">
              <input type="text" value="${esc(item.cta || '')}" placeholder="Button text" onchange="pricingField('${key}',${index},'cta',this.value)">
              <input type="text" value="${esc(item.ctaLink || '')}" placeholder="Button link (e.g. schedule.html)" onchange="pricingField('${key}',${index},'ctaLink',this.value)">
           </div>`
        : '';

    const imgField = sec.isDiscount
        ? `<div style="margin-top:0.5rem">
              <input type="text" value="${esc(item.image || '')}" placeholder="Image URL" onchange="pricingField('${key}',${index},'image',this.value)" style="font-size:0.8rem">
           </div>`
        : '';

    return `
    <div class="pricing-item">
        <div class="form-row">
            <input type="text" value="${esc(item.name || '')}" placeholder="Name" onchange="pricingField('${key}',${index},'name',this.value)">
            ${!sec.isDiscount ? `<input type="text" value="${esc(item.price || '')}" placeholder="Price" onchange="pricingField('${key}',${index},'price',this.value)">` : ''}
        </div>
        <div style="margin-top:0.5rem">
            <textarea rows="2" placeholder="Description" onchange="pricingField('${key}',${index},'description',this.value)">${esc(item.description || '')}</textarea>
        </div>
        ${imgField}
        <div class="pricing-item-actions">
            ${featuredCheck}
            ${ctaFields}
            <span style="flex:1"></span>
            <button class="btn btn-sm btn-danger" onclick="removePricingItem('${key}',${index})">Remove</button>
        </div>
    </div>`;
}

function pricingField(section, index, field, value) {
    if (!pricing[section]) return;
    if (!pricing[section][index]) return;
    pricing[section][index][field] = value;
}

function addPricingItem(section) {
    if (!pricing[section]) pricing[section] = [];
    const isDiscount = section === 'discounts';
    const newItem = isDiscount
        ? { name: '', description: '', image: '' }
        : { name: '', price: '', description: '', featured: false, badge: '', cta: '', ctaLink: '' };
    pricing[section].push(newItem);
    renderPricing();
    toast('Item added — don\'t forget to Save All Changes');
}

function removePricingItem(section, index) {
    if (!confirm('Remove this pricing item?')) return;
    pricing[section].splice(index, 1);
    renderPricing();
    toast('Item removed — don\'t forget to Save All Changes');
}

async function savePricing() {
    // Gather notes from textareas
    const noteEl = document.getElementById('pricing-note');
    const rentalEl = document.getElementById('pricing-rental-note');
    if (noteEl) pricing.note = noteEl.value;
    if (rentalEl) pricing.rentalNote = rentalEl.value;

    try {
        await api('/api/pricing', { method: 'PUT', body: JSON.stringify(pricing) });
        toast('Pricing saved!');
    } catch (e) {
        toast(e.message, 'error');
    }
}

// ===================================================================
// EVENTS
// ===================================================================
async function loadEvents() {
    const container = document.getElementById('events-list');
    container.innerHTML = '<div class="loading">Loading events...</div>';
    try {
        events = await api('/api/events');
        renderEvents();
    } catch (e) {
        container.innerHTML = '<div class="loading">Failed to load events.</div>';
    }
}

function renderEvents() {
    const container = document.getElementById('events-list');
    if (!events.length) {
        container.innerHTML = '<div class="loading">No events yet. Click "+ Add Event" to create one.</div>';
        return;
    }
    container.innerHTML = events.map(ev => {
        const inactive = !ev.active ? 'event-inactive' : '';
        const badge = !ev.active ? '<span class="event-badge">Hidden</span>' : '';
        const imgHtml = ev.image ? `<img src="${esc(ev.image)}" alt="${esc(ev.title)}" class="event-card-img">` : '';
        return `
        <div class="event-card ${inactive}" onclick="openEventEditor('${ev.id}')">
            ${imgHtml}
            <div class="event-card-body">
                <h4>${esc(ev.title)} ${badge}</h4>
                <div class="event-dates">${esc(ev.dates)}</div>
                <p>${esc(ev.description).substring(0, 120)}${ev.description && ev.description.length > 120 ? '...' : ''}</p>
            </div>
        </div>`;
    }).join('');
}

function openEventEditor(id) {
    const modal = document.getElementById('event-editor-modal');
    const titleEl = document.getElementById('event-editor-title');
    const deleteBtn = document.getElementById('event-delete-btn');

    if (id) {
        const ev = events.find(e => e.id === id);
        if (!ev) return;
        editingEventId = id;
        titleEl.textContent = 'Edit Event';
        deleteBtn.style.display = '';
        document.getElementById('event-title').value = ev.title || '';
        document.getElementById('event-dates').value = ev.dates || '';
        document.getElementById('event-image').value = ev.image || '';
        document.getElementById('event-description').value = ev.description || '';
        document.getElementById('event-signup-link').value = ev.signupLink || '';
        document.getElementById('event-active').checked = ev.active !== false;
        renderEventDetails(ev.details || []);
        renderEventResources(ev.resources || []);
    } else {
        editingEventId = null;
        titleEl.textContent = 'Add Event';
        deleteBtn.style.display = 'none';
        document.getElementById('event-title').value = '';
        document.getElementById('event-dates').value = '';
        document.getElementById('event-image').value = '';
        document.getElementById('event-description').value = '';
        document.getElementById('event-signup-link').value = '';
        document.getElementById('event-active').checked = true;
        renderEventDetails([]);
        renderEventResources([]);
    }
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeEventEditor() {
    document.getElementById('event-editor-modal').classList.remove('open');
    document.body.style.overflow = '';
    editingEventId = null;
}

function renderEventDetails(details) {
    const container = document.getElementById('event-details-list');
    container.innerHTML = details.map((d, i) => `
        <div class="detail-row">
            <input type="text" value="${esc(d)}" placeholder="Detail..." onchange="updateEventDetail(${i}, this.value)">
            <button class="remove-row-btn" onclick="removeEventDetail(${i})">&times;</button>
        </div>
    `).join('');
    container._data = [...details];
}

function updateEventDetail(index, value) {
    const container = document.getElementById('event-details-list');
    if (container._data) container._data[index] = value;
}

function addEventDetail() {
    const container = document.getElementById('event-details-list');
    const details = container._data || [];
    details.push('');
    renderEventDetails(details);
    const inputs = container.querySelectorAll('input');
    if (inputs.length) inputs[inputs.length - 1].focus();
}

function removeEventDetail(index) {
    const container = document.getElementById('event-details-list');
    const details = container._data || [];
    details.splice(index, 1);
    renderEventDetails(details);
}

function renderEventResources(resources) {
    const container = document.getElementById('event-resources-list');
    container.innerHTML = resources.map((r, i) => `
        <div class="resource-row">
            <input type="text" value="${esc(r.title || '')}" placeholder="Title" onchange="updateEventResource(${i}, 'title', this.value)">
            <input type="text" value="${esc(r.description || '')}" placeholder="Description" onchange="updateEventResource(${i}, 'description', this.value)">
            <input type="text" value="${esc(r.link || '')}" placeholder="URL" onchange="updateEventResource(${i}, 'link', this.value)">
            <button class="remove-row-btn" onclick="removeEventResource(${i})">&times;</button>
        </div>
    `).join('');
    container._data = resources.map(r => ({ ...r }));
}

function updateEventResource(index, field, value) {
    const container = document.getElementById('event-resources-list');
    if (container._data && container._data[index]) {
        container._data[index][field] = value;
    }
}

function addEventResource() {
    const container = document.getElementById('event-resources-list');
    const resources = container._data || [];
    resources.push({ title: '', description: '', link: '' });
    renderEventResources(resources);
}

function removeEventResource(index) {
    const container = document.getElementById('event-resources-list');
    const resources = container._data || [];
    resources.splice(index, 1);
    renderEventResources(resources);
}

function getEventDetailsData() {
    const container = document.getElementById('event-details-list');
    return (container._data || []).filter(d => d.trim() !== '');
}

function getEventResourcesData() {
    const container = document.getElementById('event-resources-list');
    return (container._data || []).filter(r => r.title || r.link);
}

async function saveEvent() {
    const title = document.getElementById('event-title').value.trim();
    if (!title) { toast('Title is required', 'error'); return; }

    const data = {
        title,
        dates: document.getElementById('event-dates').value.trim(),
        image: document.getElementById('event-image').value.trim(),
        description: document.getElementById('event-description').value.trim(),
        signupLink: document.getElementById('event-signup-link').value.trim(),
        active: document.getElementById('event-active').checked,
        details: getEventDetailsData(),
        resources: getEventResourcesData()
    };

    try {
        if (editingEventId) {
            await api(`/api/events/${editingEventId}`, { method: 'PUT', body: JSON.stringify(data) });
            toast('Event updated!');
        } else {
            await api('/api/events', { method: 'POST', body: JSON.stringify(data) });
            toast('Event added!');
        }
        closeEventEditor();
        await loadEvents();
    } catch (e) {
        toast(e.message, 'error');
    }
}

async function deleteEvent() {
    if (!editingEventId) return;
    const ev = events.find(e => e.id === editingEventId);
    if (!confirm(`Delete "${ev ? ev.title : 'this event'}"? This cannot be undone.`)) return;
    try {
        await api(`/api/events/${editingEventId}`, { method: 'DELETE' });
        toast('Event deleted');
        closeEventEditor();
        await loadEvents();
    } catch (e) {
        toast(e.message, 'error');
    }
}

// ===================================================================
// Utilities
// ===================================================================
function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function decodeEntities(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.innerHTML = str;
    return div.textContent;
}

// Drag-and-drop on image upload
document.addEventListener('DOMContentLoaded', () => {
    const drop = document.getElementById('bio-image-drop');
    if (drop) {
        drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag-over'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
        drop.addEventListener('drop', e => {
            e.preventDefault();
            drop.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                const input = document.getElementById('bio-image-input');
                const dt = new DataTransfer();
                dt.items.add(file);
                input.files = dt.files;
                handleImageUpload(input);
            }
        });
    }

    // Close modals on overlay click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', e => {
            if (e.target === modal) {
                modal.classList.remove('open');
                document.body.style.overflow = '';
            }
        });
    });

    // Close modals on Escape
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.open').forEach(m => {
                m.classList.remove('open');
                document.body.style.overflow = '';
            });
        }
    });

    // Load initial tab
    loadBios();
});
