// قائمة كلمات مسيئة (عربية/عامية عراقية + إنجليزية) لفلترة التعليقات
const BAD_WORDS = [
  // عربية
  "كس","كسم","كسمك","كسختك","خرا","خره","خرى","خراء","طيز","طيزك","زب","زبي","زبك",
  "شرموط","شرموطه","شرموطة","قحبه","قحبة","عرص","عرصات","منيوك","منيوج","منيوچ",
  "لعنة","لعن","يلعن","الله يلعن","كلب","كلاب","حمار","حماره","حمير","بهيم","بهيمه",
  "خنزير","خنازير","نجس","وسخ","وسخه","تافه","تافهه","حقير","حقيره",
  "ابن الكلب","ابن كلب","ابن الحرام","ابن حرام","ابن الشرموطه","ابن الشرموطة","ابن العرص",
  "امك","اختك","اخوك","خوك","اهلك","دين امك","دين اختك","يخرب بيتك",
  "زاني","زانيه","زانية","عاهر","عاهره","عاهرة","سافل","سافله","سافلة",
  // English
  "fuck","fuk","fck","f*ck","shit","sh1t","bitch","b1tch","dick","cunt","asshole","bastard","whore","slut","motherfucker","mf",
];

// Normalize: strip diacritics, unify alef/ya/ha, remove tatweel & non-word repeats
function normalize(input: string) {
  return input
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "") // diacritics + tatweel
    .replace(/[إأآٱا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/گ/g, "ك")
    .replace(/چ/g, "ج")
    .replace(/پ/g, "ب")
    .replace(/ڤ/g, "ف")
    .replace(/(.)\1{2,}/g, "$1$1") // squash 3+ repeats
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // strip symbols users use to bypass
    .replace(/\s+/g, " ")
    .trim();
}

const NORMALIZED_BAD = BAD_WORDS.map(normalize).filter(Boolean);

export function containsProfanity(text: string): boolean {
  const n = normalize(text);
  if (!n) return false;
  return NORMALIZED_BAD.some((w) => {
    if (w.includes(" ")) return n.includes(w);
    // Whole-word match only. Substring matching produced too many false
    // positives on innocent Arabic words (e.g. "الكلاب" contains "كلاب",
    // "اهلكم" contains "اهلك", "بهيمة" contains "بهيم"), which blocked
    // legitimate comments and auto-locked users. Bypass attempts via
    // symbols/repeats are still caught by normalize() collapsing them.
    const re = new RegExp(`(^|\\s)${w}(\\s|$)`, "u");
    return re.test(n);
  });
}