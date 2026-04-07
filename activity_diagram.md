# Activity Diagram per Fitur (Swimlane: Pengguna & Sistem)

Dokumen ini berisi sekumpulan kode PlantUML untuk membuat Activity Diagram pada masing-masing fitur aplikasi AI Code Editor. Diagram ini menggunakan partisi (swimlane) berkolom antara **"Pengguna"** (Panel User) dan **"Sistem"** (Sistem UI/Frontend, Backend, dan Layanan Eksternal/AI) agar rapi dan sesuai standar penulisan skripsi.

---

## 1. Autentikasi (Register & Login)

```plantuml
@startuml Activity_Autentikasi
skinparam backgroundColor #FFFFFF
skinparam ActivityBackgroundColor #EAF4FF
skinparam ActivityBorderColor #2E86C1
skinparam SwimlaneBorderColor #1A5276
skinparam SwimlaneTitleBackgroundColor #D6EAF8

|Pengguna|
start
:Membuka halaman Autentikasi;
if (Metode Autentikasi?) then (Manual: Form Email)
  :Mengisi form pendaftaran atau masuk
  (Nama, Email, Password) atau (Email, Password);
  :Menekan tombol "Daftar" atau "Masuk";

  |Sistem|
  :Menerima payload request ke Backend;
  :Mengecek ketersediaan atau validitas data;
  if (Input Valid & Sesuai?) then (Tidak)
    :Mengembalikan respons Error API;
    |Pengguna|
    :Muncul notifikasi error
    (Email terdaftar / Sandi salah);
    stop
  else (Ya)
    |Sistem|
    :Simpan akun baru (Jika Daftar)
    Atau verifikasi kredensial (Jika Masuk);
    :Membuat Access Token (JWT);
  endif
else (OAuth: Google)
  |Pengguna|
  :Menekan tombol "Lanjutkan dengan Google";

  |Sistem|
  :Mengarahkan ke halaman OAuth Google;

  |Pengguna|
  :Memilih akun & mengizinkan akses profil;

  |Sistem|
  :Menerima redirect (/api/auth/google/callback);
  :Memverifikasi data profil dari Google;
  :Sinkronisasi (Otomatis daftar jika baru/masuk jika ada);
  :Membuat Access Token (JWT);
endif

|Sistem|
:Mengirim Token JWT sebagai respons sukses;
:Menyimpan Token (LocalStorage/Cookies);
:Mengubah status otentikasi aktif;
:Redirect ke halaman Dasbor;

|Pengguna|
:Berhasil masuk ke antarmuka Dasbor;
stop
@enduml
```

---

## 2. Lupa Kata Sandi (Forgot Password)

```plantuml
@startuml Activity_ForgotPassword
skinparam backgroundColor #FFFFFF
skinparam ActivityBackgroundColor #EAF4FF
skinparam ActivityBorderColor #2E86C1
skinparam SwimlaneBorderColor #1A5276
skinparam SwimlaneTitleBackgroundColor #D6EAF8

|Pengguna|
start
:Menekan tautan "Lupa Kata Sandi?" di hal. Login;

|Sistem|
:Menampilkan Form Email Pemulihan;

|Pengguna|
:Menginput Email terdaftar;
:Menekan tombol "Kirim Tautan Reset";

|Sistem|
:Memeriksa eksistensi Email di Database;
if (Email ditemukan?) then (Ya)
  :Membuat Token Reset Password sementara;
  :Menyimpan Token ke tabel Database;
  :Memanggil API SMTP (Layanan Email);
  :Mengirim Link Reset via Email;
else (Tidak)
  :Merespons diam/sukses (Keamanan);
endif
:Merespons pesan "Cek Kotak Masuk Email";

|Pengguna|
:Membuka pesan Email dari Sistem;
:Mengklik Tautan (Link) Reset Sandi;

|Sistem|
:Menampilkan halaman Reset Password;
:Menangkap parameter Token dari URL;

|Pengguna|
:Memasukkan Kata Sandi Baru dua kali;
:Menekan "Simpan";

|Sistem|
:Memvalidasi durasi kadaluwarsa Token di DB;
:Melakukan hashing password baru;
:Menimpa sandi lama milik user di DB;
:Mengalihkan kembali ke halaman Login;
stop
@enduml
```

---

## 3. Code Editor (Menulis & Eksekusi Python)

```plantuml
@startuml Activity_CodeEditor
skinparam backgroundColor #FFFFFF
skinparam ActivityBackgroundColor #EAF4FF
skinparam ActivityBorderColor #2E86C1
skinparam SwimlaneBorderColor #1A5276
skinparam SwimlaneTitleBackgroundColor #D6EAF8

|Pengguna|
start
:Membuka halaman Dasbor utama (Workspace);
:Mengklik area teks Monaco Editor;
:Mengetik baris kode bahasa Python;

|Sistem|
:Mengaktifkan fitur IntelliSense & Syntax Highlighting;

|Pengguna|
:Selesai mengetik;
:Menekan tombol "Run" / Jalankan Code;

|Sistem|
:Menangkap teks seluruh sintaks Python;
:Meneruskan kode ke engine Skulpt (Client-Side);
:Skulpt Engine mengompilasi kode Python di Browser;
if (Terdapat baris perintah eksekusi/print?) then (Ya)
  :Mengumpulkan Output konsol atau Error Traceback;
  :Sistem merender/cetak Output ke panel Terminal;
else (Tidak)
  :Tidak menampilkan log apa-apa;
endif

|Pengguna|
:Melihat hasil komputasi kode di Terminal bawah;
stop
@enduml
```

---

## 4. AI Chat (Percakapan Asisten AI)

```plantuml
@startuml Activity_AIChat
skinparam backgroundColor #FFFFFF
skinparam ActivityBackgroundColor #EAF4FF
skinparam ActivityBorderColor #2E86C1
skinparam SwimlaneBorderColor #1A5276
skinparam SwimlaneTitleBackgroundColor #D6EAF8

|Pengguna|
start
:Membuka panel Chat AI;
:Mengetik prompt / pertanyaan kode;
:Menekan tombol "Kirim";

|Sistem|
:Merender gelembung pesan (Bubble) Pengguna;
:Mengumpulkan pesan tersebut dan riwayat Chat;
:Mengirim Payload ke Server Backend;
:Backend menambahkan System Prompt (Sistem Peran AI);
:Mengirim Request API ke layanan AI Utama (Gemini);
:Model Gemini menyusun pemahaman jawaban teks;
:Gemini mengembalikan teks jawaban dalam format stream (chunk);
:Sistem Frontend secara bertahap merender serpihan teks di layar;

|Pengguna|
:Membaca teks dari AI yang terketik perlahan;
stop
@enduml
```

---

## 5. AI Debug (Debugging Error Otomatis)

```plantuml
@startuml Activity_AIDebug
skinparam backgroundColor #FFFFFF
skinparam ActivityBackgroundColor #EAF4FF
skinparam ActivityBorderColor #2E86C1
skinparam SwimlaneBorderColor #1A5276
skinparam SwimlaneTitleBackgroundColor #D6EAF8

|Pengguna|
start
:Mengeksekusi kode Python dan mendapat pesan Error di Terminal;
:Memilih & Mengklik tombol "Fix with AI Debug";

|Sistem|
:Menangkap paket berisi (Kode Sintaks aktif + Teks Log Error);
:Membungkus bundle tersebut & mengirim via HTTP POST ke Backend;
:Backend menerjemahkan struktur permintaan (Format Prompt Debug);
:Meneruskan pesan instruksi Analisa ke API Model Gemini (AI);
:Model AI membaca log error dan menemukan kesalahan syntax/logic;
:Model AI mengembalikan deskripsi analisis dan kode murni perbaikan;
:Backend mengirimkan respon stream balik ke Frontend;
:Sistem merender teks Markdown beserta tombol 'Copy Code';

|Pengguna|
:Menganalisa dan membaca perbaikan;
:Menyalin saran kode langsung ke Code Editor;
stop
@enduml
```

---

## 6. AI Fallback (Failover Cadangan)

```plantuml
@startuml Activity_AIFallback
skinparam backgroundColor #FFFFFF
skinparam ActivityBackgroundColor #EAF4FF
skinparam ActivityBorderColor #2E86C1
skinparam SwimlaneBorderColor #1A5276
skinparam SwimlaneTitleBackgroundColor #D6EAF8

|Pengguna|
start
:Mengirim pertanyaan berat atau request AI Debug;

|Sistem|
:Backend menghidupkan Timer Pemantau (Timeout limit misal: 30s);
:Backend mengirim Request API ke AI Utama (Gemini);
if (Gemini Merespon sebelum Limit?) then (Ya)
  :Memproses balasan reguler stream ke UI Chat;
else (Tidak, Error/Timeout terlampaui)
  :Backend memutus paksa koneksi (Abort Request) Gemini;
  :Memicu fungsi peralihan darurat (Fallback Handler);
  :Mengalihkan payload Prompt yang persis merute ke API Groq AI;
  :Groq AI memproses dan mengeluarkan teks jawaban instan;
  :Backend me-return hasil streaming Groq ke UI Frontend pengguna;
endif

|Pengguna|
:Menerima & Membaca hasil analisis percakapan secara utuh (Mulus);
stop
@enduml
```

---

## 7. Keluar Sistem (Logout)

```plantuml
@startuml Activity_Logout
skinparam backgroundColor #FFFFFF
skinparam ActivityBackgroundColor #EAF4FF
skinparam ActivityBorderColor #2E86C1
skinparam SwimlaneBorderColor #1A5276
skinparam SwimlaneTitleBackgroundColor #D6EAF8

|Pengguna|
start
:Mengklik menu Profil di navigasi atas;
:Memilih opsi "Keluar" (Logout);

|Sistem|
:Memanggil fungsi `logout()`;
:Sistem Frontend membersihkan Session/Token JWT dari browser LocalStorage;
:(Opsional) Mengirim data pemutusan session ke backend API /api/auth/logout;
:Status kerahasiaan rute dihilangkan (Unauthenticated);
:Sistem memuat pengalihan halaman secara otomatis;
:Layar kembali ke rute Landing Page awal (atau Form Login);

|Pengguna|
:Telah kehilangan akses pada IDE Editor dan siap untuk pergi;
stop
@enduml
```

---

## 8. Use Case Diagram: Autentikasi (Register & Login)

```plantuml
@startuml UseCase_Auth_Flow
left to right direction
skinparam packageStyle rectangle
skinparam shadowing false

' ================= ACTORS =================
actor "Pengguna" as user
actor "Google" as google <<System>>

' ================= SYSTEM =================
rectangle "AI Code Editor - Sistem Autentikasi" {
  
  usecase "Melakukan Autentikasi (Masuk & Daftar)" as UC_Auth
  usecase "Daftar / Masuk Manual" as UC_Manual
  usecase "Daftar / Masuk via Google" as UC_Google

}

' ================= RELATIONS =================
user --> UC_Auth

UC_Auth <|-- UC_Manual
UC_Auth <|-- UC_Google

UC_Google --> google : Minta Otorisasi Akses
@enduml
```

---

## 9. Use Case Diagram: Code Editor

```plantuml
@startuml UseCase_CodeEditor
left to right direction
skinparam packageStyle rectangle
skinparam shadowing false

' ================= ACTORS =================
actor "Pengguna" as user

' ================= SYSTEM =================
rectangle "AI Code Editor - Workspace" {
  usecase "Menulis & Mengedit Kode" as UC_Write
  usecase "Menjalankan Kode (Run)" as UC_Run
  usecase "Melihat Output Eksekusi" as UC_Terminal
}

' ================= RELATIONS =================
user --> UC_Write
user --> UC_Run
user --> UC_Terminal

UC_Run ..> UC_Write : <<include>>
UC_Terminal ..> UC_Run : <<include>>
@enduml
```

---

## 10. Use Case Diagram: AI Chat

```plantuml
@startuml UseCase_AIChat
left to right direction
skinparam packageStyle rectangle
skinparam shadowing false

' ================= ACTORS =================
actor "Pengguna" as user

' ================= SYSTEM =================
rectangle "AI Code Editor - AI Chat" {
  usecase "Membuka Panel Chat AI" as UC_Open
  usecase "Mengirim Prompt Pertanyaan" as UC_Send
  usecase "Berinteraksi dengan Asisten AI" as UC_Chat
  usecase "Membaca Respon AI" as UC_Receive
}

' ================= RELATIONS =================
user --> UC_Chat

UC_Chat ..> UC_Open : <<include>>
UC_Chat ..> UC_Send : <<include>>
UC_Receive ..> UC_Chat : <<extend>>
@enduml
```

---

## 11. Use Case Diagram: AI Debug

```plantuml
@startuml UseCase_AIDebug
left to right direction
skinparam packageStyle rectangle
skinparam shadowing false

' ================= ACTORS =================
actor "Pengguna" as user

' ================= SYSTEM =================
rectangle "AI Code Editor - AI Debug" {
  usecase "Mendapati Error di Terminal" as UC_Error
  usecase "Menganalisa Bug (Fix with AI)" as UC_Debug
  usecase "Menyalin Perbaikan Kode" as UC_Copy
}

' ================= RELATIONS =================
user --> UC_Error
user --> UC_Debug
user --> UC_Copy

UC_Debug .> UC_Error : <<extend>>
UC_Copy ..> UC_Debug : <<include>>
@enduml
```
