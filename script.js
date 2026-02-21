// =============================================
// TEMA — light untuk index.html, dark untuk profile.html
// =============================================
const isIndexPage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/');
const isProfilePage = window.location.pathname.endsWith('profile.html');
const savedTheme = isIndexPage ? 'light' : (isProfilePage ? 'dark' : (localStorage.getItem('theme') || 'light'));
document.documentElement.setAttribute('data-theme', savedTheme);

// =============================================
// MANAJEMEN STOK PRODUK
// Ubah true = tersedia / false = habis
// =============================================
const stockData = {
    'Cireng'            : true,
    'Jihu'              : true,
    'Pentol Bakso Kecil': true,
    'Bakso'             : true,
    'Pentol Tahu Daging': true,
    'Tahu Walek'        : true,
};

// =============================================
// KONFIGURASI TOKO — sesuaikan di sini
// =============================================
const NOMOR_WA = "6283852930872";
const ONGKIR   = 1000;
const MAX_KM   = 1;
const TOKO_LAT = -7.762126;
const TOKO_LNG = 113.770656;

// =============================================

let cart = [];
let userLat = null, userLng = null;
let pendingWAMessage = '';
let qrisPaid = false; // true setelah user konfirmasi telah membayar via QRIS
let qrisShown = false; // true setelah user melihat/membuka modal QRIS
let map = null;
let userMarker = null;
let storeMarker = null;

// =============================================
// DOM READY
// =============================================
document.addEventListener('DOMContentLoaded', () => {

    // Set ikon tema
    const icon = document.getElementById('themeIcon');
    if (icon) icon.textContent = savedTheme === 'dark' ? '🌙' : '☀️';

    // Terapkan status stok ke semua card
    applyStockStatus();

    // Setup payment UI listeners: disable WA ketika memilih QRIS dan belum konfirmasi
    document.querySelectorAll('input[name="payment"]').forEach(r => r.addEventListener('change', updatePaymentUI));
    const qrisCheckbox = document.getElementById('qrisConfirmCheckbox');
    if (qrisCheckbox) qrisCheckbox.addEventListener('change', (e) => qrisConfirmChanged(e.target.checked));
    updatePaymentUI();

    // Handle ?pesan=1 dari profile.html
    const params = new URLSearchParams(window.location.search);
    if (params.get('pesan') === '1') {
        const menuSection = document.getElementById('menuSection');
        if (menuSection) {
            setTimeout(() => menuSection.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
        }
        const notif = document.getElementById('pesanNotif');
        if (notif) {
            notif.style.display = 'flex';
            setTimeout(() => {
                notif.style.opacity = '0';
                setTimeout(() => notif.style.display = 'none', 400);
            }, 8000);
        }
        // Bersihkan query string dari URL tanpa reload
        window.history.replaceState({}, document.title, window.location.pathname);
    }
});

// =============================================
// STOK — terapkan ke semua card
// =============================================
function applyStockStatus() {
    document.querySelectorAll('.product-card').forEach(card => {
        const nameEl = card.querySelector('.product-name');
        if (!nameEl) return;
        const name    = nameEl.textContent.trim();
        const inStock = stockData[name] !== undefined ? stockData[name] : true;
        setCardStock(card, inStock);
    });
}

// Set satu card: tersedia / habis
function setCardStock(card, inStock) {
    const badge    = card.querySelector('.stock-badge');
    const btnOrder = card.querySelector('.btn-order');
    const qtyBtns  = card.querySelectorAll('.qty-control button');

    if (inStock) {
        card.classList.remove('sold-out');
        card.setAttribute('data-stock', 'true');
        if (badge) {
            badge.textContent = '✅ Stok Tersedia';
            badge.className   = 'stock-badge in-stock';
        }
        if (btnOrder) {
            btnOrder.disabled    = false;
            btnOrder.textContent = '+ Keranjang';
        }
        qtyBtns.forEach(b => b.disabled = false);
    } else {
        card.classList.add('sold-out');
        card.setAttribute('data-stock', 'false');
        if (badge) {
            badge.textContent = '❌ Stok Habis';
            badge.className   = 'stock-badge out-of-stock';
        }
        if (btnOrder) {
            btnOrder.disabled    = true;
            btnOrder.textContent = 'Habis';
        }
        qtyBtns.forEach(b => b.disabled = true);
    }
}

// Toggle stok manual — bisa dipanggil dari console browser
// Contoh: toggleStock('Bakso', false)
function toggleStock(productName, inStock) {
    stockData[productName] = inStock;
    document.querySelectorAll('.product-card').forEach(card => {
        const nameEl = card.querySelector('.product-name');
        if (nameEl && nameEl.textContent.trim() === productName) {
            setCardStock(card, inStock);
        }
    });
}

// =============================================
// NOTIFIKASI & TEMA
// =============================================
function tutupNotif() {
    const notif = document.getElementById('pesanNotif');
    if (!notif) return;
    notif.style.opacity = '0';
    setTimeout(() => notif.style.display = 'none', 400);
}

function toggleTheme() {
    const html     = document.documentElement;
    const isDark   = html.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    document.getElementById('themeIcon').textContent = isDark ? '☀️' : '🌙';
}

// =============================================
// TOAST NOTIFIKASI STOK
// =============================================
function showStockToast(msg, type) {
    const old = document.getElementById('stockToast');
    if (old) old.remove();

    const toast = document.createElement('div');
    toast.id          = 'stockToast';
    toast.className   = 'stock-toast ' + type;
    toast.textContent = msg;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 350);
    }, 2500);
}

// =============================================
// KERANJANG — QTY DI CARD
// =============================================
function changeCardQty(btn, delta) {
    const card = btn.closest('.product-card');
    if (card && card.getAttribute('data-stock') === 'false') return;
    const qtyEl = btn.parentElement.querySelector('.qty-value');
    let qty = parseInt(qtyEl.textContent) + delta;
    if (qty < 1) qty = 1;
    qtyEl.textContent = qty;
}

// =============================================
// KERANJANG — TAMBAH
// =============================================
function addToCart(name, price, unit, btn) {
    const card = btn.closest('.product-card');

    if (card.getAttribute('data-stock') === 'false') {
        showStockToast('❌ Maaf, ' + name + ' sedang habis!', 'error');
        return;
    }

    const qtyEl = card.querySelector('.qty-value');
    const qty   = parseInt(qtyEl.textContent);

    const existing = cart.find(i => i.name === name);
    if (existing) existing.qty += qty;
    else cart.push({ name, price, unit, qty });

    qtyEl.textContent = 1;
    renderCart();
    updateBadge();
    showStockToast('✅ ' + name + ' ditambahkan ke keranjang!', 'success');

    const panel = document.getElementById('cartPanel');
    if (!panel.classList.contains('active')) toggleCart();
}

function removeFromCart(name) {
    cart = cart.filter(i => i.name !== name);
    renderCart();
    updateBadge();
}

function changeQty(name, delta) {
    const item = cart.find(i => i.name === name);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) removeFromCart(name);
    else renderCart();
    updateBadge();
}

// =============================================
// RENDER KERANJANG
// =============================================
function renderCart() {
    const container = document.getElementById('cartItems');
    const footer    = document.getElementById('cartFooter');

    if (cart.length === 0) {
        container.innerHTML = '<p class="cart-empty">Keranjang masih kosong</p>';
        footer.style.display = 'none';
        return;
    }

    footer.style.display = 'block';
    let html = '', subtotal = 0;

    cart.forEach(item => {
        const s = item.price * item.qty;
        subtotal += s;
        html += `
        <div class="cart-item">
            <div class="cart-item-name">
                ${item.name}
                <span class="cart-item-unit">${item.qty} × ${item.unit}</span>
            </div>
            <div class="cart-item-controls">
                <button onclick="changeQty('${item.name}', -1)">−</button>
                <span>${item.qty}</span>
                <button onclick="changeQty('${item.name}', 1)">+</button>
            </div>
            <div class="cart-item-price">Rp ${s.toLocaleString('id-ID')}</div>
            <button class="cart-item-remove" onclick="removeFromCart('${item.name}')">🗑</button>
        </div>`;
    });

    container.innerHTML = html;
    document.getElementById('cartTotal').textContent = 'Rp ' + subtotal.toLocaleString('id-ID');
    updateGrandTotal(subtotal);
}

function updateGrandTotal(subtotal) {
    const isAntar = document.querySelector('input[name="delivery"]:checked')?.value === 'antar';
    const grand   = subtotal + (isAntar ? ONGKIR : 0);
    document.getElementById('grandTotal').textContent = 'Rp ' + grand.toLocaleString('id-ID');
}

function getSubtotal() {
    return cart.reduce((sum, i) => sum + i.price * i.qty, 0);
}

function updateBadge() {
    document.getElementById('cartBadge').textContent = cart.reduce((s, i) => s + i.qty, 0);
}

// =============================================
// TOGGLE PENGIRIMAN
// =============================================
function toggleDelivery(radio) {
    const addrGroup = document.getElementById('addressGroup');
    const ongkirBox = document.getElementById('ongkirBox');
    if (radio.value === 'antar') {
        addrGroup.style.display = 'block';
        ongkirBox.style.display = 'block';
        // Inisialisasi peta setelah penundaan kecil untuk memastikan DOM siap
        setTimeout(() => initializeMap(), 100);
    } else {
        addrGroup.style.display = 'none';
        ongkirBox.style.display = 'none';
        userLat = null; userLng = null;
        document.getElementById('locationStatus').textContent = '';
        document.getElementById('mapsLink').value = '';
        destroyMap();
    }
    updateGrandTotal(getSubtotal());
}

// =============================================
// GEOLOCATION
// =============================================
function getLocation() {
    const status = document.getElementById('locationStatus');
    status.textContent = '⏳ Mendapatkan lokasi...';
    status.className   = 'location-status';

    if (!navigator.geolocation) {
        status.textContent = '❌ Browser tidak mendukung geolocation';
        return;
    }
    navigator.geolocation.getCurrentPosition(
        pos => {
            userLat = pos.coords.latitude;
            userLng = pos.coords.longitude;
            const dist = getDistance(userLat, userLng, TOKO_LAT, TOKO_LNG);
            if (dist > MAX_KM) {
                status.textContent = `❌ Lokasi kamu ${dist.toFixed(1)} km dari toko. Pengiriman hanya dalam ${MAX_KM} km.`;
                status.className   = 'location-status error';
                userLat = null; userLng = null;
            } else {
                status.textContent = `✅ Lokasi terdeteksi! Jarak ±${dist.toFixed(2)} km dari toko.`;
                status.className   = 'location-status success';
                document.getElementById('mapsLink').value =
                    `https://maps.google.com/?q=${userLat},${userLng}`;
            }
        },
        () => {
            status.textContent = '❌ Gagal mendapatkan lokasi. Paste link Google Maps manual.';
            status.className   = 'location-status error';
        }
    );
}

function getDistance(lat1, lng1, lat2, lng2) {
    const R = 6371, dLat = rad(lat2-lat1), dLng = rad(lng2-lng1);
    const a = Math.sin(dLat/2)**2 + Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function rad(d) { return d * Math.PI / 180; }

// =============================================
// CUSTOM LEAFLET ICONS
// =============================================
const STORE_ICON = L.icon({
    iconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 48" width="40" height="48"><defs><linearGradient id="storeGradient" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:%23FF6B35;stop-opacity:1" /><stop offset="100%" style="stop-color:%23D62828;stop-opacity:1" /></linearGradient></defs><path d="M20 0C8.95 0 0 8.95 0 20c0 12 20 28 20 28s20-16 20-28c0-11.05-8.95-20-20-20z" fill="url(%23storeGradient)" stroke="%23FFFFFF" stroke-width="2"/><circle cx="20" cy="18" r="7" fill="%23FFFFFF" opacity="0.9"/><rect x="16" y="22" width="8" height="6" fill="%23FFFFFF" opacity="0.8" rx="1"/></svg>',
    iconSize: [40, 48],
    iconAnchor: [20, 48],
    popupAnchor: [0, -48]
});

const USER_ICON = L.icon({
    iconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 48" width="40" height="48"><defs><linearGradient id="userGradient" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:%234A90E2;stop-opacity:1" /><stop offset="100%" style="stop-color:%232E5C8A;stop-opacity:1" /></linearGradient></defs><path d="M20 0C8.95 0 0 8.95 0 20c0 12 20 28 20 28s20-16 20-28c0-11.05-8.95-20-20-20z" fill="url(%23userGradient)" stroke="%23FFFFFF" stroke-width="2"/><circle cx="20" cy="16" r="5" fill="%23FFFFFF" opacity="0.95"/><path d="M20 22 C 17 22 14 24 14 27 L 26 27 C 26 24 23 22 20 22 Z" fill="%23FFFFFF" opacity="0.9"/><circle cx="20" cy="12" r="2.5" fill="%234A90E2" opacity="0.6"/></svg>',
    iconSize: [40, 48],
    iconAnchor: [20, 48],
    popupAnchor: [0, -48]
});

// =============================================
// LEAFLET MAP INITIALIZATION
// =============================================
function initializeMap() {
    const mapContainer = document.getElementById('mapContainer');
    const mapElement = document.getElementById('map');
    
    if (!mapContainer || !mapElement) return;
    
    // Jika peta sudah ada, tampilkan saja
    if (map) {
        mapContainer.style.display = 'block';
        map.invalidateSize();
        return;
    }
    
    mapContainer.style.display = 'block';
    
    // Inisialisasi peta di pusat lokasi toko
    map = L.map('map').setView([TOKO_LAT, TOKO_LNG], 15);
    
    // Tambahkan tile layer satelit dari Esri
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri, DigitalGlobe, Earthstar Geographics',
        maxZoom: 18
    }).addTo(map);
    
    // Marker untuk lokasi toko
    storeMarker = L.marker([TOKO_LAT, TOKO_LNG], {
        icon: STORE_ICON
    }).addTo(map).bindPopup('🏪 Lokasi Toko HA BIBI SNACK CORNER');
    
    // Marker untuk lokasi pengguna jika sudah ada
    if (userLat && userLng) {
        updateUserMarker(userLat, userLng);
    }
    
    // Event listener untuk klik pada peta
    map.on('click', (e) => {
        selectLocationFromMap(e.latlng.lat, e.latlng.lng);
    });
}

function destroyMap() {
    if (map) {
        map.remove();
        map = null;
        userMarker = null;
        storeMarker = null;
    }
    const mapContainer = document.getElementById('mapContainer');
    if (mapContainer) {
        mapContainer.style.display = 'none';
    }
}

function updateUserMarker(lat, lng) {
    if (!map) return;
    
    if (userMarker) {
        userMarker.setLatLng([lat, lng]);
    } else {
        userMarker = L.marker([lat, lng], {
            icon: USER_ICON
        }).addTo(map).bindPopup('📍 Lokasi Anda');
    }
    
    // Zoom ke area sekitar lokasi toko dan pengguna
    const bounds = L.latLngBounds([[TOKO_LAT, TOKO_LNG], [lat, lng]]);
    map.fitBounds(bounds, { padding: [50, 50] });
}

function selectLocationFromMap(lat, lng) {
    const dist = getDistance(lat, lng, TOKO_LAT, TOKO_LNG);
    const status = document.getElementById('locationStatus');
    
    if (dist > MAX_KM) {
        status.textContent = `❌ Lokasi ${dist.toFixed(1)} km dari toko. Pengiriman hanya dalam ${MAX_KM} km.`;
        status.className = 'location-status error';
        userLat = null;
        userLng = null;
        if (userMarker) {
            map.removeLayer(userMarker);
            userMarker = null;
        }
    } else {
        userLat = lat;
        userLng = lng;
        status.textContent = `✅ Lokasi dipilih! Jarak ±${dist.toFixed(2)} km dari toko.`;
        status.className = 'location-status success';
        document.getElementById('mapsLink').value = `https://maps.google.com/?q=${lat},${lng}`;
        updateUserMarker(lat, lng);
    }
    updateGrandTotal(getSubtotal());
}

// =============================================
// PANEL TOGGLE
// =============================================
function toggleCart() {
    document.getElementById('cartPanel').classList.toggle('active');
    document.getElementById('overlay').classList.toggle('active');
}

function closeAllPanel() {
    document.getElementById('cartPanel').classList.remove('active');
    document.getElementById('qrisModal').classList.remove('active');
    document.getElementById('overlay').classList.remove('active');
}

// Ensure QRIS state resets when closing via overlay or other global close
function resetQrisState() {
    qrisPaid = false;
    const qcb = document.getElementById('qrisConfirmCheckbox');
    if (qcb) qcb.checked = false;
    updatePaymentUI();
}

function closeQris() {
    document.getElementById('qrisModal').classList.remove('active');
    document.getElementById('overlay').classList.remove('active');
}

// Close QRIS and reset confirmation state
function closeQrisAndReset() {
    closeQris();
    qrisPaid = false;
    const qcb = document.getElementById('qrisConfirmCheckbox');
    if (qcb) qcb.checked = false;
    updatePaymentUI();
}

// =============================================
// RESET KERANJANG SETELAH PESANAN TERKIRIM
// =============================================
function resetCartAfterOrder() {
    // Kosongkan data keranjang
    cart = [];

    // Reset badge ke 0
    updateBadge();

    // Reset tampilan keranjang
    renderCart();

    // Reset form nama pemesan
    const nameInput = document.getElementById('customerName');
    if (nameInput) nameInput.value = '';

    // Reset catatan
    const notesInput = document.getElementById('orderNotes');
    if (notesInput) notesInput.value = '';

    // Reset ke ambil sendiri
    const radioAmbil = document.querySelector('input[name="delivery"][value="ambil"]');
    if (radioAmbil) {
        radioAmbil.checked = true;
        toggleDelivery(radioAmbil);
    }

    // Reset ke COD
    const radioCOD = document.querySelector('input[name="payment"][value="COD"]');
    if (radioCOD) radioCOD.checked = true;

    // Reset konfirmasi QRIS
    qrisPaid = false;
    qrisShown = false;
    const qrisCheckbox = document.getElementById('qrisConfirmCheckbox');
    if (qrisCheckbox) qrisCheckbox.checked = false;
    updatePaymentUI();

    // Reset qty semua card produk kembali ke 1
    document.querySelectorAll('.qty-value').forEach(el => el.textContent = '1');

    // Reset lokasi
    userLat = null;
    userLng = null;

    // Tutup panel keranjang
    closeAllPanel();

    // Tampilkan toast sukses
    showStockToast('🎉 Pesanan berhasil dikirim! Terima kasih.', 'success');
}

// =============================================
// KIRIM PESANAN VIA WHATSAPP
// =============================================
function sendToWhatsApp() {
    if (cart.length === 0) { alert('Keranjang masih kosong!'); return; }

    const nama     = document.getElementById('customerName').value.trim();
    const delivery = document.querySelector('input[name="delivery"]:checked').value;
    const payment  = document.querySelector('input[name="payment"]:checked').value;
    const catatan  = document.getElementById('orderNotes').value.trim();
    const mapsLink = document.getElementById('mapsLink').value.trim();

    if (!nama) {
        alert('Mohon isi nama pemesan!');
        document.getElementById('customerName').focus();
        return;
    }

    if (delivery === 'antar') {
        if (!mapsLink) {
            alert('Mohon dapatkan lokasi atau paste link Google Maps kamu!');
            return;
        }
        if (userLat === null && !mapsLink.includes('maps')) {
            alert('Link lokasi tidak valid!');
            return;
        }
    }

    let subtotal = 0, pesanItems = '';
    cart.forEach((item, i) => {
        const s = item.price * item.qty;
        subtotal += s;
        pesanItems += `${i+1}. ${item.name} ${item.qty}× (${item.unit}) = Rp ${s.toLocaleString('id-ID')}\n`;
    });

    const isAntar = delivery === 'antar';
    const grand   = subtotal + (isAntar ? ONGKIR : 0);

    let pesan =
`🛍️ *PESANAN HA BIBI SNACK CORNER*

👤 Nama      : ${nama}
🚚 Pengiriman: ${isAntar ? 'Antar ke Rumah' : 'Ambil Sendiri'}
💳 Pembayaran: ${payment}

📦 *Detail Pesanan:*
${pesanItems}`;

    if (isAntar) {
        pesan += `🛵 Ongkir      : Rp ${ONGKIR.toLocaleString('id-ID')}\n`;
        pesan += `📍 Lokasi      : ${mapsLink}\n`;
    }

    pesan += `\n💰 *Total Bayar: Rp ${grand.toLocaleString('id-ID')}*`;
    if (catatan) pesan += `\n\n📝 Catatan: ${catatan}`;

    pendingWAMessage = pesan;

    if (payment === 'QRIS') {
        // Jika sudah dikonfirmasi bayar oleh user, kirim WA langsung
        if (qrisPaid) {
            doSendWA();
            return;
        }

        // Jika QRIS belum pernah ditampilkan, tampilkan modal sekali
        if (!qrisShown) {
            qrisShown = true; // user sudah melihat QRIS

            document.getElementById('qrisAmount').textContent = 'Rp ' + grand.toLocaleString('id-ID');

            // Pastikan checkbox reset dan state belum dibayar
            const qcb = document.getElementById('qrisConfirmCheckbox');
            if (qcb) { qcb.checked = false; }
            qrisPaid = false;
            updatePaymentUI();

            // Siapkan link unduh QRIS (jika ada elemen img atau path)
            const qrisImg = document.querySelector('.qris-img');
            const qrisDownload = document.getElementById('qrisDownloadBtn');
            if (qrisDownload) {
                const src = qrisImg ? qrisImg.getAttribute('src') : qrisDownload.getAttribute('href');
                if (src) qrisDownload.setAttribute('href', src);
                qrisDownload.removeAttribute('disabled');
            }

            document.getElementById('qrisModal').classList.add('active');
            document.getElementById('overlay').classList.add('active');
            document.getElementById('cartPanel').classList.remove('active');
            // pendingWAMessage sudah diset di atas; user harus konfirmasi pembayaran untuk melanjutkan
            return;
        }

        // Jika QRIS sudah ditampilkan dan belum dibayar, jangan lanjutkan; fokus modal
        document.getElementById('qrisModal').classList.add('active');
        document.getElementById('overlay').classList.add('active');
        return;
    } else {
        doSendWA();
    }
}

function doSendWA() {
    // Jika pembayaran QRIS sudah dikonfirmasi, tambahkan catatan pembayaran pada pesan
    let messageToSend = pendingWAMessage || '';
    const payment = document.querySelector('input[name="payment"]:checked')?.value;
    if (payment === 'QRIS' && qrisPaid) {
        if (!/Pembayaran/i.test(messageToSend)) {
            messageToSend += `\n\n✅ Pembayaran: Sudah dilakukan via QRIS`;
        }
    }

    const url = `https://wa.me/${NOMOR_WA}?text=${encodeURIComponent(messageToSend)}`;
    window.open(url, '_blank');

    // ✅ Kosongkan keranjang otomatis setelah pesanan terkirim
    resetCartAfterOrder();
    // Pastikan reset state QRIS
    qrisPaid = false;
    const qcb = document.getElementById('qrisConfirmCheckbox');
    if (qcb) qcb.checked = false;
    updatePaymentUI();
}

// Update UI tombol berdasarkan metode pembayaran + status QRIS
function updatePaymentUI() {
    const payment = document.querySelector('input[name="payment"]:checked')?.value;
    const waBtn = document.querySelector('.btn-wa-order');
    const qrisContinue = document.getElementById('qrisContinueBtn');

    if (payment === 'QRIS') {
        // Jika customer sudah melihat QRIS tetapi belum membayar, blokir tombol WA
        if (qrisShown && !qrisPaid) {
            if (waBtn) { waBtn.disabled = true; waBtn.title = 'Selesaikan pembayaran QRIS terlebih dahulu'; }
        } else {
            if (waBtn) { waBtn.disabled = false; waBtn.title = ''; }
        }
        // Tombol lanjut modal hanya aktif setelah konfirmasi bayar
        if (qrisContinue) qrisContinue.disabled = !qrisPaid;
    } else {
        // Jika berpindah ke COD, reset state QRIS (belum melihat dan belum bayar)
        qrisShown = false;
        qrisPaid = false;
        const qcb = document.getElementById('qrisConfirmCheckbox');
        if (qcb) qcb.checked = false;
        if (waBtn) { waBtn.disabled = false; waBtn.title = ''; }
        if (qrisContinue) qrisContinue.disabled = true;
    }
}

function qrisConfirmChanged(checked) {
    qrisPaid = !!checked;
    if (qrisPaid) {
        // Setelah konfirmasi bayar, kita anggap proses bisa dilanjutkan
        qrisShown = false;
    }
    updatePaymentUI();
}