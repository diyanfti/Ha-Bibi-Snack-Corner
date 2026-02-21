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
const ONGKIR   = 500;
const MAX_KM   = 1;
const TOKO_LAT = -8.1725;
const TOKO_LNG = 113.7003;

// =============================================

let cart = [];
let userLat = null, userLng = null;
let pendingWAMessage = '';
let qrisPaid = false; // true setelah user konfirmasi telah membayar via QRIS
let qrisShown = false; // true setelah user melihat/membuka modal QRIS

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
    } else {
        addrGroup.style.display = 'none';
        ongkirBox.style.display = 'none';
        userLat = null; userLng = null;
        document.getElementById('locationStatus').textContent = '';
        document.getElementById('mapsLink').value = '';
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
`🛍️ *PESANAN HA BIBI STORE*

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