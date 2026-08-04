# Ustara — Backend (API server)

Express.js + MongoDB Atlas (Mongoose) + Socket.IO asosida qurilgan backend server.

## 1. O'rnatish

```bash
cd backend
npm install
```

## 2. MongoDB Atlas sozlash

1. https://www.mongodb.com/cloud/atlas ga kiring, bepul cluster yarating (M0).
2. **Database Access** bo'limida foydalanuvchi yarating (username/password).
3. **Network Access** bo'limida IP manzilingizni qo'shing (yoki test uchun `0.0.0.0/0`).
4. **Connect → Drivers** dan ulanish satrini (connection string) nusxalang.

## 3. .env faylini sozlash

```bash
cp .env.example .env
```

`.env` faylini oching va quyidagilarni to'ldiring:

```
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/barber-platform?retryWrites=true&w=majority
JWT_SECRET=juda-uzun-va-tasodifiy-maxfiy-satr
CLIENT_URL=http://localhost:5173
ADMIN_URL=http://localhost:5174
ADMIN_PHONE=+998901112233
ADMIN_PASSWORD=Admin12345!
```

## 4. Birinchi admin foydalanuvchini yaratish

```bash
npm run seed
```

Bu `.env` dagi `ADMIN_PHONE` / `ADMIN_PASSWORD` bilan birinchi admin hisobini yaratadi. Shu login orqali admin saytiga kirasiz.

## 5. Serverni ishga tushirish

```bash
npm run dev      # development (nodemon bilan, avtomatik qayta yuklanadi)
npm start        # production
```

Server default holda `http://localhost:5000` da ishlaydi. Tekshirish uchun:

```bash
curl http://localhost:5000/api/health
```

## Papka tuzilishi

```
backend/
  config/db.js          - MongoDB ulanishi
  models/                - Mongoose sxemalari (User, Barber, Service, Booking, Review, Notification)
  routes/                 - API endpointlar
  middleware/             - auth (JWT), xatolarni ushlash
  sockets/                - Socket.IO (jonli navbat, bildirishnomalar)
  utils/                  - yordamchi funksiyalar, seed skripti
  server.js                - kirish nuqtasi
```

## Asosiy API endpointlar

| Metod | Yo'l | Tavsif |
|---|---|---|
| POST | /api/auth/register | Ro'yxatdan o'tish (mijoz/sartarosh) |
| POST | /api/auth/login | Kirish |
| GET | /api/barbers | Sartaroshlarni qidirish (geolokatsiya, reyting, narx) |
| GET | /api/barbers/:id | Sartarosh profili + xizmatlar |
| GET | /api/bookings/availability | Bo'sh vaqtlarni olish |
| POST | /api/bookings | Bron yaratish |
| PUT | /api/bookings/:id/status | Bron holatini o'zgartirish |
| GET | /api/admin/dashboard | Admin statistikasi |
| PUT | /api/admin/barbers/:id/approve | Sartaroshni tasdiqlash |

To'liq ro'yxat uchun `routes/` papkasidagi fayllarga qarang — har bir endpoint izohlangan.

## Production'ga chiqarish

- Render, Railway, yoki VPS (PM2 bilan) tavsiya etiladi.
- `NODE_ENV=production` qiling.
- `CLIENT_URL` va `ADMIN_URL` ni haqiqiy domenlaringizga o'zgartiring (CORS uchun muhim).
- `JWT_SECRET` ni albatta uzun va tasodifiy qilib o'zgartiring.
