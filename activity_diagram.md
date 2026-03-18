# Activity Diagram per Fitur (Swimlane: Pengguna & Sistem)

Dokumen ini berisi sekumpulan kode PlantUML untuk membuat Activity Diagram pada masing-masing fitur aplikasi AI Code Editor. Diagram ini menggunakan partisi (swimlane) berkolom antara **"Pengguna"** (Panel User) dan **"Sistem"** (Sistem UI/Frontend, Backend, dan Layanan Eksternal/AI) agar rapi dan sesuai standar penulisan skripsi.

---

## 1. Registrasi Akun (Register)

```plantuml
@startuml Activity_Register
skinparam backgroundColor #FFFFFF
skinparam ActivityBackgroundColor #EAF4FF
skinparam ActivityBorderColor #2E86C1
skinparam SwimlaneBorderColor #1A5276
skinparam SwimlaneTitleBackgroundColor #D6EAF8

|Pengguna|
start
:Membuka halaman web;
:Memilih menu Registrasi;
:Mengisi form (Nama, Email, Password);
:Menekan tombol "Daftar";

|Sistem|
:Menerima payload request pendaftaran;
:Mengecek ketersediaan Email di Database;
if (Email sudah ada?) then (Ya)
  :Mengembalikan pesan Error;
  |Pengguna|
  :Menerima peringatan "Email sudah digunakan";
  stop
else (Tidak)
  |Sistem|
  :Melakukan enkripsi/Hashing pada Password;
  :Menyimpan data akun baru ke Database;
  :Mengembalikan status respons 201 (Created);
  :Mengalihkan pengguna ke halaman Login;
  |Pengguna|
  :Melihat pesan sukses & form Login;
  stop
endif
@enduml
```

---

## 2. Masuk Sistem (Login)

```plantuml
@startuml Activity_Login
skinparam backgroundColor #FFFFFF
skinparam ActivityBackgroundColor #EAF4FF
skinparam ActivityBorderColor #2E86C1
skinparam SwimlaneBorderColor #1A5276
skinparam SwimlaneTitleBackgroundColor #D6EAF8

|Pengguna|
start
:Membuka halaman Login;
if (Pilih Metode Login?) then (Manual: Email & Password)
  :Mengisi Email dan Password;
  :Menekan tombol "Masuk";

  |Sistem|
  :Menerima request HTTP POST (/api/auth/login);
  :Mencari email di Database;
  if (Kredensial valid?) then (Tidak)
    :Mengirim pesan Error;
    |Pengguna|
    :Melihat notifikasi gagal;
    stop
  else (Ya)
    :Membuat Access Token (JWT);
  endif
else (OAuth: Google Login)
  |Pengguna|
  :Menekan tombol "Masuk dengan Google";

  |Sistem|
  :Mengarahkan ke halaman OAuth Google;

  |Pengguna|
  :Memilih akun & memberikan izin;

  |Sistem|
  :Menerima redirect di callback (/api/auth/google/callback);
  :Memverifikasi profil dari Google;
  :Melakukan Upsert data User ke Database;
  :Membuat Access Token (JWT);
endif

|Sistem|
:Mengirim Token JWT sebagai respons sukses;
:Menyimpan Token di LocalStorage/Cookies;
:Mengubah status otentikasi menjadi aktif;
:Mengalihkan (Redirect) ke halaman Utama;

|Pengguna|
:Berhasil masuk dan melihat antarmuka Dasbor;
stop
@enduml
```

---

## 3. Lupa Kata Sandi (Forgot Password)

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

## 4. Code Editor (Menulis & Eksekusi Python)

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

## 5. AI Chat (Percakapan Asisten AI)

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

## 6. AI Debug (Debugging Error Otomatis)

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

## 7. AI Fallback (Failover Cadangan)

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

## 8. Keluar Sistem (Logout)

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

## 9. Use Case Diagram: Autentikasi (Register & Login)

```plantuml
@startuml UseCase_Auth_Flow_Clean
left to right direction
skinparam packageStyle rectangle
skinparam shadowing false

' ================= ACTORS =================
actor "Pengguna" as user
actor "Google OAuth" as google <<System>>
actor "Auth Server" as server <<System>>

' ================= SYSTEM =================
rectangle "AI Code Editor - Auth System" {

  ' MAIN ACTIONS
  usecase "Register" as UC_Register
  usecase "Login Manual" as UC_Login_Manual
  usecase "Login dengan Google" as UC_Login_Google

  ' REGISTER FLOW
  usecase "Input Nama, Email, Password" as UC_Input_Register
  usecase "Kirim Data ke Server" as UC_Send_Register

  ' LOGIN MANUAL FLOW
  usecase "Input Email & Password" as UC_Input_Login
  usecase "Kirim Kredensial ke Server" as UC_Send_Login

  ' GOOGLE LOGIN FLOW
  usecase "Pilih Akun Google" as UC_Select_Google
  usecase "Proses OAuth" as UC_OAuth
  usecase "Kirim Data ke Server (Sync User)" as UC_Send_Google
}

' ================= USER =================
user --> UC_Register
user --> UC_Login_Manual
user --> UC_Login_Google

' ================= REGISTER =================
UC_Register ..> UC_Input_Register : <<include>>
UC_Register ..> UC_Send_Register : <<include>>
UC_Send_Register --> server

' ================= LOGIN MANUAL =================
UC_Login_Manual ..> UC_Input_Login : <<include>>
UC_Login_Manual ..> UC_Send_Login : <<include>>
UC_Send_Login --> server

' ================= GOOGLE LOGIN =================
UC_Login_Google ..> UC_Select_Google : <<include>>
UC_Login_Google ..> UC_OAuth : <<include>>
UC_Login_Google ..> UC_Send_Google : <<include>>

UC_OAuth --> google
UC_Send_Google --> server

@enduml
```
