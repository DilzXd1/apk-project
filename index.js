const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    delay 
} = require('@whiskeysockets/baileys');
const pino = require('pino');

// Folder untuk menyimpan sesi koneksi WhatsApp
const SESSION_FOLDER = './wa_sessions';

async function startPairingWhatsApp(phoneNumber) {
    // Mempersiapkan autentikasi berbasis file (multi-device)
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER);

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }), // Menyembunyikan log bising di konsol
        printQRInTerminal: false,          // Matikan QR karena kita menggunakan Pairing Code
        auth: state,
        browser: ['Chrome (Linux)', 'GetsuzoPanel', '1.0.0']
    });

    // Jalankan permintaan pairing code jika belum login
    if (!sock.authState.creds.registered) {
        // Membersihkan format nomor telepon (hanya angka)
        const cleanedNumber = phoneNumber.replace(/[^0-9]/g, '');
        
        await delay(3000); // Jeda aman sebelum meminta kode
        try {
            const code = await sock.requestPairingCode(cleanedNumber);
            
            console.log(`\n==================================================`);
            console.log(` 📲 WHATSAPP PAIRING CODE UNTUK: ${cleanedNumber}`);
            console.log(` KODE ANDA: ${code.match(/.{1,4}/g).join('-')}`);
            console.log(`==================================================\n`);
            
            // Perbarui data di WhatsApp.json
            let dbWA = JSON.parse(fs.readFileSync('./WhatsApp.json', 'utf-8'));
            if (!dbWA.active_senders.includes(cleanedNumber)) {
                dbWA.active_senders.push(cleanedNumber);
                dbWA.total_brp_added = dbWA.active_senders.length;
                fs.writeFileSync('./WhatsApp.json', JSON.stringify(dbWA, null, 2));
            }

        } catch (error) {
            console.error("Gagal mendapatkan pairing code:", error);
        }
    }

    // Memantau perubahan status koneksi
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`Koneksi terputus karena:`, lastDisconnect?.error, `. Mencoba menyambung kembali:`, shouldReconnect);
            
            if (shouldReconnect) {
                startPairingWhatsApp(phoneNumber); // Hubungkan kembali secara otomatis
            } else {
                console.log(`Perangkat telah keluar (logged out). Hapus folder ${SESSION_FOLDER} untuk reset.`);
                // Hapus nomor dari WhatsApp.json jika ter-logout
                let dbWA = JSON.parse(fs.readFileSync('./WhatsApp.json', 'utf-8'));
                dbWA.active_senders = dbWA.active_senders.filter(num => num !== phoneNumber);
                dbWA.total_brp_added = dbWA.active_senders.length;
                fs.writeFileSync('./WhatsApp.json', JSON.stringify(dbWA, null, 2));
            }
        } else if (connection === 'open') {
            console.log(`✅ Sender WhatsApp Baileys Berhasil Terhubung dan Aktif!`);
        }
    });

    // Menyimpan kredensial setiap kali ada pembaruan sesi
    sock.ev.on('creds.update', saveCreds);
}

// Endpoint untuk memicu pairing code baru dari sisi client/dashboard
app.post('/api/whatsapp/pair', async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
        return res.status(400).json({ success: false, message: "Nomor telepon wajib diisi!" });
    }

    // Menjalankan fungsi pairing di background terminal
    startPairingWhatsApp(phoneNumber);
    
    res.json({ 
        success: true, 
        message: "Proses pairing dimulai. Silakan periksa konsol terminal server untuk melihat kode pairing Anda." 
    });
});

// ====================================================================
// TRIGGER OTOMATIS SAAT STARTUP (CONTOH)
// ====================================================================
// Anda bisa memanggil fungsi ini secara dinamis melalui API endpoint 
// atau menjalankannya langsung di sini dengan memasukkan nomor target.
// Format nomor wajib menggunakan kode negara (misal: 628xxxxxxxxx)

const NOMOR_SENDER_UTAMA = '6281234567890'; // Ganti dengan nomor WhatsApp Bot Anda
startPairingWhatsApp(NOMOR_SENDER_UTAMA);
