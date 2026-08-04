/**
 * Eskiz.uz SMS xizmati integratsiyasi.
 *
 * Agar .env faylida ESKIZ_EMAIL va ESKIZ_PASSWORD to'ldirilgan bo'lsa,
 * haqiqiy SMS yuboriladi. Aks holda (development/test rejimi) kod
 * konsolga chiqariladi — bu loyihani Eskiz ulanmasdan turib sinab
 * ko'rish imkonini beradi va hech qachon xato bilan to'xtamaydi.
 */

let cachedToken = null;
let tokenExpiresAt = 0;

const ESKIZ_BASE_URL = "https://notify.eskiz.uz/api";

const isEskizConfigured = () =>
  Boolean(process.env.ESKIZ_EMAIL && process.env.ESKIZ_PASSWORD);

const loginToEskiz = async () => {
  const res = await fetch(`${ESKIZ_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.ESKIZ_EMAIL,
      password: process.env.ESKIZ_PASSWORD,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data?.data?.token) {
    throw new Error(data?.message || "Eskiz.uz tizimiga kirib bo'lmadi");
  }
  cachedToken = data.data.token;
  // Eskiz tokeni ~30 kun amal qiladi, biz 25 kunda yangilaymiz (xavfsizlik uchun)
  tokenExpiresAt = Date.now() + 25 * 24 * 60 * 60 * 1000;
  return cachedToken;
};

const getEskizToken = async () => {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  return loginToEskiz();
};

// Eskiz talab qiladigan formatga o'tkazish: +998901234567 -> 998901234567
const normalizePhone = (phone) => phone.replace(/[^\d]/g, "").replace(/^8/, "998");

/**
 * SMS yuborish. Har doim { success, devCode? } shaklida natija qaytaradi,
 * hech qachon xatolik bilan process'ni to'xtatmaydi (yuqori darajada ushlanadi).
 */
const sendSms = async (phone, message, devCode) => {
  if (!isEskizConfigured()) {
    // Eskiz sozlanmagan — development rejimi: kodni konsolga chiqaramiz
    console.log(`📩 [DEV SMS] ${phone} raqamiga: ${message}`);
    return { success: true, mode: "dev", devCode };
  }

  try {
    const token = await getEskizToken();
    const res = await fetch(`${ESKIZ_BASE_URL}/message/sms/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        mobile_phone: normalizePhone(phone),
        message,
        from: process.env.ESKIZ_SENDER || "4546",
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      // Token eskirgan bo'lishi mumkin - bir marta qayta urinamiz
      if (res.status === 401) {
        cachedToken = null;
        const freshToken = await loginToEskiz();
        const retryRes = await fetch(`${ESKIZ_BASE_URL}/message/sms/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${freshToken}`,
          },
          body: JSON.stringify({
            mobile_phone: normalizePhone(phone),
            message,
            from: process.env.ESKIZ_SENDER || "4546",
          }),
        });
        if (!retryRes.ok) throw new Error("SMS yuborishda xatolik (qayta urinishdan keyin ham)");
        return { success: true, mode: "eskiz" };
      }
      throw new Error(data?.message || "SMS yuborishda xatolik");
    }

    return { success: true, mode: "eskiz" };
  } catch (err) {
    console.error("❌ Eskiz SMS xatosi:", err.message);
    // SMS yuborilmasa ham, dasturni to'xtatmaymiz - console'ga kodni chiqaramiz
    console.log(`📩 [FALLBACK] ${phone} raqamiga kod: ${devCode}`);
    return { success: false, mode: "fallback", devCode, error: err.message };
  }
};

module.exports = { sendSms, isEskizConfigured };