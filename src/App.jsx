import React, { useState, useEffect } from "react";
import {
  ChevronRight,
  Check,
  Sparkles,
  ChefHat,
  Bath,
  Sofa,
  Home,
  Coins,
  Clock,
  Calendar,
  Briefcase,
  Store,
  MoreHorizontal,
  PaintBucket,
  Target,
  Users,
  MessageSquare,
  Image as ImageIcon,
  Plus,
  Minus,
  PawPrint,
} from "lucide-react";

// ========== 内装パース画像 (public/に配置) ==========
const IMG_HOTEL = "/hotel.jpg";
const IMG_NATURAL = "/natural.jpg";
const IMG_JAPANESE = "/japanese.jpg";
const IMG_MINIMAL = "/minimal.jpg";



// 暮らしの設計図 (Yes Reform Hearing Sheet)
// 本番デプロイ版 v2.6 - URL暗号化 + imgBB画像ホスティング + Formspree送信

// ★★★ Formspree フォームID をここに貼り付けてください ★★★
// 例: const FORMSPREE_ENDPOINT = "https://formspree.io/f/xyzabcde";
const FORMSPREE_ENDPOINT = "https://formspree.io/f/xzdowrgg";



// ============================================================
// URL暗号化・復号 (Web Crypto API使用 / 追加ライブラリ不要)
// WordPress側と同じ秘密キーで暗号化されたURLパラメータを復号する
// ============================================================
// ★★★ WordPress側と必ず同じ値にすること ★★★
const URL_SECRET_KEY = "kurashi-yes-reform-2026-secure-v1";

// ============================================================
// imgBB 画像ホスティング設定
// ============================================================
// 画像はFormspreeのプラン制限を回避するため imgBB に直接アップロードし、
// メールにはURLのみを記載する。
const IMGBB_API_KEY = "51dfc27c92f36240f4d9e84dff93d19c";
const IMGBB_UPLOAD_URL = "https://api.imgbb.com/1/upload";

// 単一の画像ファイルを imgBB にアップロードし、表示用URLを返す
async function uploadImageToImgbb(file) {
  try {
    const formData = new FormData();
    formData.append("key", IMGBB_API_KEY);
    formData.append("image", file);
    if (file.name) formData.append("name", file.name);
    const res = await fetch(IMGBB_UPLOAD_URL, { method: "POST", body: formData });
    if (!res.ok) return null;
    const json = await res.json();
    if (json && json.success && json.data) {
      return {
        url: json.data.url,
        display_url: json.data.display_url || json.data.url,
        thumb: json.data.thumb?.url || null,
        delete_url: json.data.delete_url || null,
      };
    }
    return null;
  } catch (e) {
    console.warn("imgBB upload failed:", e);
    return null;
  }
}



async function decryptUrlData(token, secret) {
  try {
    // URL-safe base64 → 標準base64
    let b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    // base64 デコード
    const combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (combined.length < 17) return null;
    const iv = combined.slice(0, 16);
    const encrypted = combined.slice(16);
    // 秘密キーから AES-256 キーを生成 (SHA-256)
    const encoder = new TextEncoder();
    const keyData = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
    const key = await crypto.subtle.importKey("raw", keyData, { name: "AES-CBC" }, false, ["decrypt"]);
    // 復号
    const decryptedBuf = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, encrypted);
    const json = new TextDecoder().decode(decryptedBuf);
    return JSON.parse(json);
  } catch (e) {
    console.warn("URL decryption failed:", e);
    return null;
  }
}

// 日本語IME対応の入力コンポーネント
// 通常の controlled input は IME 変換中に value が割り込まれて文字が崩れるため、
// composition イベントで変換確定まで親stateへの反映を遅らせる
function JpInput({ multiline = false, value, onChange, ...rest }) {
  const [composing, setComposing] = useState(false);
  const [local, setLocal] = useState(value || "");
  useEffect(() => {
    if (!composing) setLocal(value || "");
  }, [value, composing]);
  const handleChange = (e) => {
    setLocal(e.target.value);
    if (!composing) onChange(e.target.value);
  };
  const handleCStart = () => setComposing(true);
  const handleCEnd = (e) => {
    setComposing(false);
    setLocal(e.target.value);
    onChange(e.target.value);
  };
  const props = {
    ...rest,
    value: local,
    onChange: handleChange,
    onCompositionStart: handleCStart,
    onCompositionEnd: handleCEnd,
  };
  return multiline ? <textarea {...props} /> : <input {...props} />;
}

export default function ReformHearingSheet() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({
    // お客様情報(URLパラメータから自動取得)
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    inquiry_id: "",
    // ヒアリング項目
    places: [],
    goal: null,
    goal_other_text: "",
    style: null,
    budget: null,
    timing: null,
    adults: 2,
    children: 0,
    child_ages: [],
    pets: "",
    message: "",
    images: [],
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // URLパラメータからお客様情報を読み込み(初回のみ)
  // 1) ?d=暗号化トークン  ← 本番運用ではこちらを使う(セキュア)
  // 2) ?name=&email=&phone=&id=  ← 平文(テスト用フォールバック)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);

    // ① 暗号化トークン優先
    const token = params.get("d");
    if (token) {
      decryptUrlData(token, URL_SECRET_KEY).then((data) => {
        if (data) {
          setAnswers((prev) => ({
            ...prev,
            contact_name: data.name || "",
            contact_email: data.email || "",
            contact_phone: data.phone || "",
            inquiry_id: data.id || "",
          }));
        }
      });
      return;
    }

    // ② 平文パラメータ(後方互換)
    const name = params.get("name") || "";
    const email = params.get("email") || "";
    const phone = params.get("phone") || "";
    const id = params.get("id") || "";
    if (name || email || phone || id) {
      setAnswers((prev) => ({
        ...prev,
        contact_name: name,
        contact_email: email,
        contact_phone: phone,
        inquiry_id: id,
      }));
    }
  }, []);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400;500;700&family=Noto+Sans+JP:wght@300;400;500&display=swap";
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);

  const palette = {
    bg: "#F5F1EA",
    bgDeep: "#EBE5D9",
    ink: "#1F1B16",
    inkSoft: "#5A5247",
    accent: "#8B5A3C",
    line: "#C9BFAE",
    paper: "#FFFCF6",
  };

  const fontSerif = '"Noto Serif JP", "Hiragino Mincho ProN", serif';
  const fontSans = '"Noto Sans JP", "Hiragino Sans", sans-serif';

  // トイレアイコン
  const ToiletIcon = ({ size = 20, color = "currentColor", strokeWidth = 1.2 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3h10v5H7z" />
      <path d="M5 8h14l-2 9H7L5 8z" />
      <path d="M9 17v3h6v-3" />
    </svg>
  );

  // ========== 質問データ ==========

  const Q_PLACE = {
    key: "places",
    title: "リフォームを\nご検討の場所は?",
    sub: "Location · 複数選択可",
    type: "placeGridMulti",
    options: [
      { label: "住まい全体", note: "Renovation", Icon: Home },
      { label: "キッチン", note: "Kitchen", Icon: ChefHat },
      { label: "浴室・洗面", note: "Bath & Powder", Icon: Bath },
      { label: "トイレ", note: "Toilet", Icon: ToiletIcon },
      { label: "リビング・寝室", note: "Living", Icon: Sofa },
      { label: "外装工事", note: "Exterior", Icon: PaintBucket },
      { label: "店舗・クリニック等", note: "Store / Clinic", Icon: Store },
      { label: "オフィス", note: "Office", Icon: Briefcase },
      { label: "その他", note: "Others", Icon: MoreHorizontal },
    ],
  };

  const Q_GOAL = {
    key: "goal",
    title: "改修の目標を\n教えてください",
    sub: "Renovation Goal",
    type: "goalList",
    options: [
      { label: "フルリノベーション", note: "住まいを生まれ変わらせる", Icon: Target },
      { label: "部分的にリフォーム", note: "気になる箇所だけ刷新", Icon: Target },
      { label: "賃貸の原状回復", note: "退去前の復旧工事", Icon: Target },
      { label: "売却前リフォーム", note: "資産価値を高めて売る", Icon: Target },
      { label: "その他", note: "ご記入ください", Icon: MoreHorizontal, hasText: true },
    ],
  };

  // 内装パース画像(齋藤さん提供 / base64埋め込み)
  // ★ 本番デプロイ時は冒頭のIMG_*定数を画像URLに差し替えると軽量化できます
  const Q_STYLE = {
    key: "style",
    title: "お好みの\nデザインテイストは?",
    sub: "Design Style",
    type: "styleCard",
    options: [
      {
        label: "ホテルライク",
        mood: "高級ホテルのスイートのような重厚で上質な空間",
        materials: ["大理石", "ベルベット", "真鍮", "ウォルナット"],
        gradient: "linear-gradient(135deg, #1A1410 0%, #3A2E20 50%, #6B5840 100%)",
        imageUrl: IMG_HOTEL,
        swatch: ["#1A1410", "#4A3D2C", "#9B7A48", "#E8DAB8"],
        textOnDark: true,
      },
      {
        label: "ナチュラル",
        mood: "木と光に包まれる、やわらかく癒しのある住まい",
        materials: ["オーク材", "リネン", "漆喰", "無垢板"],
        gradient: "linear-gradient(135deg, #F0E4C8 0%, #D4BA8E 50%, #9C7A4A 100%)",
        imageUrl: IMG_NATURAL,
        swatch: ["#FAF4E8", "#E8DCC4", "#C9B391", "#8B6E4A"],
        textOnDark: false,
      },
      {
        label: "和モダン",
        mood: "日本の美意識と現代的デザインが調和する佇まい",
        materials: ["障子", "畳", "左官壁", "黒鉄"],
        gradient: "linear-gradient(135deg, #0F1620 0%, #1F2A38 50%, #3D4E60 100%)",
        imageUrl: IMG_JAPANESE,
        swatch: ["#0F1620", "#3D4E60", "#A89878", "#EDE5D5"],
        textOnDark: true,
      },
      {
        label: "ミニマル",
        mood: "削ぎ落とした美しさと光が主役のクリーンな住まい",
        materials: ["白漆喰", "モルタル", "ガラス", "無垢"],
        gradient: "linear-gradient(135deg, #FAFAFA 0%, #ECE8E2 50%, #C8C0B4 100%)",
        imageUrl: IMG_MINIMAL,
        swatch: ["#FFFFFF", "#F0EBE3", "#D4CCBE", "#8B8378"],
        textOnDark: false,
      },
    ],
  };

  const Q_BUDGET = {
    key: "budget",
    title: "ご予算の\n目安はどのくらい?",
    sub: "Budget",
    type: "list",
    options: [
      { label: "〜 100万円", note: "ミニリフォーム", Icon: Coins, intensity: 1 },
      { label: "100 〜 300万円", note: "部分リフォーム", Icon: Coins, intensity: 2 },
      { label: "300 〜 500万円", note: "標準リフォーム", Icon: Coins, intensity: 3 },
      { label: "500 〜 1,000万円", note: "本格リフォーム", Icon: Coins, intensity: 4 },
      { label: "1,000 〜 2,000万円", note: "リノベーション", Icon: Coins, intensity: 5 },
      { label: "2,000 〜 3,000万円", note: "フルリノベ", Icon: Coins, intensity: 5 },
      { label: "3,000万円 〜", note: "ハイエンド・別荘等", Icon: Coins, intensity: 5 },
    ],
  };

  const Q_TIMING = {
    key: "timing",
    title: "ご希望の\n竣工タイミングは?",
    sub: "Completion Timing",
    type: "list",
    options: [
      { label: "できるだけ早く", note: "お急ぎでご対応", Icon: Clock },
      { label: "3〜5ヶ月以内", note: "標準的な工期", Icon: Calendar },
      { label: "特に決まっていない", note: "じっくり相談しながら", Icon: Sparkles },
    ],
  };

  const Q_FAMILY = {
    key: "family",
    title: "ご家族構成を\n教えてください",
    sub: "Family",
    type: "family",
  };

  const Q_MESSAGE = {
    key: "message",
    title: "イエスリフォームに\nお伝えしたいことは?",
    sub: "Message · 任意",
    type: "textarea",
    placeholder: "ご要望、こだわり、現状の不満、好きな雰囲気など、ご自由にお書きください。",
  };

  const Q_IMAGES = {
    key: "images",
    title: "気に入った内装イメージを\n添付できます",
    sub: "Reference Images · 任意",
    type: "fileUpload",
    hint: "Pinterest や Instagram のスクショ、雑誌の切り抜き写真など何でもOK",
  };

  // 場所が住居系かを判定
  const isResidential = (places) => {
    if (!places || places.length === 0) return false;
    const commercial = ["オフィス", "店舗・クリニック等"];
    return places.some((p) => !commercial.includes(p));
  };

  // フロー構築(場所により家族構成質問を出し分け)
  const buildFlow = (places) => {
    const flow = [Q_PLACE, Q_GOAL, Q_STYLE, Q_BUDGET, Q_TIMING];
    if (isResidential(places)) {
      flow.push(Q_FAMILY);
    }
    flow.push(Q_MESSAGE, Q_IMAGES);
    return flow;
  };

  const flow = buildFlow(answers.places);
  const totalQ = flow.length;
  const summaryStep = totalQ + 1;
  const sentStep = totalQ + 2;

  const getCurrentQuestion = () => (step >= 1 && step <= totalQ) ? flow[step - 1] : null;

  const handleSelect = (key, value) => {
    setAnswers({ ...answers, [key]: value });
    setTimeout(() => setStep(step + 1), 320);
  };

  const handleMultiToggle = (key, value) => {
    const current = answers[key] || [];
    const newArray = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setAnswers({ ...answers, [key]: newArray });
  };

  // ========== 共通コンポーネント ==========

  // ステッパー(+/- 数値入力)
  const Stepper = ({ value, onChange, min = 0, max = 10, suffix = "人" }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        style={{
          width: 36, height: 36,
          borderRadius: "50%",
          background: palette.paper,
          border: `1px solid ${palette.line}`,
          cursor: value <= min ? "not-allowed" : "pointer",
          opacity: value <= min ? 0.4 : 1,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Minus size={14} color={palette.ink} strokeWidth={1.5} />
      </button>
      <div style={{
        minWidth: 60, textAlign: "center",
        fontFamily: fontSerif, fontSize: 18, fontWeight: 400,
        letterSpacing: "0.05em",
      }}>
        {value}{suffix}
      </div>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        style={{
          width: 36, height: 36,
          borderRadius: "50%",
          background: palette.ink, color: palette.paper,
          border: "none",
          cursor: value >= max ? "not-allowed" : "pointer",
          opacity: value >= max ? 0.4 : 1,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Plus size={14} color={palette.paper} strokeWidth={1.5} />
      </button>
    </div>
  );

  // 次へボタン
  const NextButton = ({ onClick, disabled, label = "次へ進む" }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        marginTop: 28,
        width: "100%",
        background: disabled ? palette.line : palette.ink,
        color: palette.paper,
        border: "none",
        padding: "20px",
        fontFamily: fontSerif,
        fontSize: 14,
        letterSpacing: "0.25em",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.3s",
        borderRadius: 0,
        opacity: disabled ? 0.6 : 1,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = palette.accent; }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = palette.ink; }}
    >
      {label} &nbsp;→
    </button>
  );

  // ---------- フレーム ----------
  const Frame = ({ children }) => (
    <div style={{ minHeight: "100vh", background: `radial-gradient(ellipse at top, ${palette.bg} 0%, ${palette.bgDeep} 100%)`, fontFamily: fontSans, color: palette.ink, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 24, left: 24, right: 24, height: 1, background: palette.line, opacity: 0.5 }} />
      <div style={{ position: "absolute", bottom: 24, left: 24, right: 24, height: 1, background: palette.line, opacity: 0.5 }} />
      <div
        style={{
          position: "absolute",
          top: 32,
          left: "50%",
          transform: "translateX(-50%)",
          textAlign: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            fontFamily: fontSerif,
            fontSize: 16,
            fontWeight: 500,
            letterSpacing: "0.25em",
            color: palette.ink,
            marginBottom: 4,
          }}
        >
          暮らしの設計図
        </div>
        <div
          style={{
            fontFamily: fontSerif,
            fontSize: 9,
            letterSpacing: "0.4em",
            color: palette.inkSoft,
            opacity: 0.85,
          }}
        >
          YES REFORM
        </div>
      </div>
      <div style={{ padding: "100px 24px 60px", maxWidth: 460, margin: "0 auto" }}>{children}</div>
    </div>
  );

  // ウェルカム
  if (step === 0) {
    return (
      <Frame>
        <div style={{ textAlign: "center", paddingTop: 40 }}>
          <div style={{ fontFamily: fontSerif, fontSize: 13, letterSpacing: "0.3em", color: palette.accent, marginBottom: 32 }}>─── HEARING SHEET ───</div>
          <h1 style={{ fontFamily: fontSerif, fontSize: 28, fontWeight: 400, lineHeight: 1.7, margin: "0 0 24px 0", letterSpacing: "0.05em" }}>理想の住まいを<br />お聞かせください</h1>
          <p style={{ fontSize: 13, lineHeight: 2, color: palette.inkSoft, margin: "0 0 56px 0", letterSpacing: "0.08em" }}>
            いくつかの質問にお答えいただくだけで、<br />あなたに最適なご提案をお届けします。<br />
            <span style={{ fontSize: 11, opacity: 0.7 }}>所要時間 約2分</span>
          </p>
          <button onClick={() => setStep(1)} style={{ background: palette.ink, color: palette.paper, border: "none", padding: "20px 48px", fontFamily: fontSerif, fontSize: 14, letterSpacing: "0.25em", cursor: "pointer", transition: "all 0.3s ease", borderRadius: 0 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = palette.accent)}
            onMouseLeave={(e) => (e.currentTarget.style.background = palette.ink)}>
            はじめる &nbsp;→
          </button>
          <div style={{ marginTop: 80, fontFamily: fontSerif, fontSize: 10, letterSpacing: "0.5em", color: palette.inkSoft, opacity: 0.5 }}>EST. TOKYO</div>
        </div>
      </Frame>
    );
  }

  // 質問画面
  if (step >= 1 && step <= totalQ) {
    const q = getCurrentQuestion();
    const selected = answers[q.key];
    const selectedCount = Array.isArray(selected) ? selected.length : 0;

    return (
      <Frame>
        <div style={{ display: "flex", gap: 4, marginBottom: 32, justifyContent: "center" }}>
          {flow.map((_, idx) => (
            <div key={idx} style={{ width: 22, height: 2, background: idx < step ? palette.accent : palette.line, transition: "background 0.4s" }} />
          ))}
        </div>

        <div style={{ fontFamily: fontSerif, fontSize: 11, letterSpacing: "0.35em", color: palette.accent, marginBottom: 14 }}>
          Q.{String(step).padStart(2, "0")}  {q.sub}
        </div>

        <h2 style={{ fontFamily: fontSerif, fontSize: 23, fontWeight: 400, lineHeight: 1.6, margin: "0 0 24px 0", letterSpacing: "0.04em", whiteSpace: "pre-line" }}>
          {q.title}
        </h2>

        {/* ===== 場所(複数選択) ===== */}
        {q.type === "placeGridMulti" && (
          <>
            <div style={{ fontSize: 11, color: palette.accent, fontFamily: fontSerif, letterSpacing: "0.15em", textAlign: "center", marginBottom: 16, marginTop: -10 }}>
              ✓ 複数選択できます
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {q.options.map((opt) => {
                const isSelected = (answers[q.key] || []).includes(opt.label);
                const Icon = opt.Icon;
                return (
                  <button key={opt.label} onClick={() => handleMultiToggle(q.key, opt.label)}
                    style={{
                      background: isSelected ? palette.ink : palette.paper,
                      color: isSelected ? palette.paper : palette.ink,
                      border: `1px solid ${isSelected ? palette.ink : palette.line}`,
                      padding: "16px 6px 14px",
                      cursor: "pointer", transition: "all 0.25s ease",
                      borderRadius: 0, fontFamily: fontSans,
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                      minHeight: 110, position: "relative",
                    }}>
                    {isSelected && (
                      <div style={{ position: "absolute", top: 6, right: 6, width: 18, height: 18, borderRadius: "50%", background: palette.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Check size={11} color={palette.paper} strokeWidth={3} />
                      </div>
                    )}
                    <div style={{ width: 38, height: 38, borderRadius: "50%", border: `1px solid ${isSelected ? palette.paper : palette.line}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: isSelected ? "rgba(255,255,255,0.05)" : palette.bg }}>
                      <Icon size={17} strokeWidth={1.2} color={isSelected ? palette.paper : palette.ink} />
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.02em", marginBottom: 2, lineHeight: 1.3 }}>{opt.label}</div>
                      <div style={{ fontSize: 8, color: isSelected ? palette.line : palette.inkSoft, letterSpacing: "0.08em", fontFamily: fontSerif }}>{opt.note}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <NextButton onClick={() => selectedCount > 0 && setStep(step + 1)} disabled={selectedCount === 0} label={selectedCount === 0 ? "1つ以上お選びください" : `次へ (${selectedCount}件)`} />
          </>
        )}

        {/* ===== 改修目標(その他は記入) ===== */}
        {q.type === "goalList" && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {q.options.map((opt) => {
                const isSelected = selected === opt.label || (opt.hasText && selected?.startsWith("その他"));
                const Icon = opt.Icon;
                return (
                  <button key={opt.label}
                    onClick={() => {
                      if (opt.hasText) {
                        setAnswers({ ...answers, goal: "その他" });
                      } else {
                        handleSelect(q.key, opt.label);
                      }
                    }}
                    style={{
                      background: isSelected ? palette.ink : palette.paper,
                      color: isSelected ? palette.paper : palette.ink,
                      border: `1px solid ${isSelected ? palette.ink : palette.line}`,
                      padding: "14px 18px", textAlign: "left",
                      cursor: "pointer", transition: "all 0.25s ease",
                      display: "flex", alignItems: "center", gap: 12,
                      borderRadius: 0, fontFamily: fontSans,
                    }}>
                    <div style={{ width: 38, height: 38, borderRadius: "50%", border: `1px solid ${isSelected ? palette.paper : palette.line}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: isSelected ? "rgba(255,255,255,0.05)" : palette.bg }}>
                      <Icon size={18} strokeWidth={1.2} color={isSelected ? palette.paper : palette.ink} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "0.05em", marginBottom: 2 }}>{opt.label}</div>
                      <div style={{ fontSize: 10.5, color: isSelected ? palette.line : palette.inkSoft, letterSpacing: "0.08em", fontFamily: fontSerif }}>{opt.note}</div>
                    </div>
                    <ChevronRight size={16} strokeWidth={1} />
                  </button>
                );
              })}
            </div>

            {/* その他 選択時のテキスト入力 */}
            {answers.goal === "その他" && (
              <>
                <JpInput
                  multiline
                  value={answers.goal_other_text}
                  onChange={(v) => setAnswers({ ...answers, goal_other_text: v })}
                  placeholder="改修の目標を具体的にお書きください"
                  style={{
                    width: "100%", marginTop: 16, padding: "14px 16px",
                    minHeight: 80, resize: "vertical",
                    border: `1px solid ${palette.accent}`,
                    borderRadius: 0, fontFamily: fontSans,
                    fontSize: 14, background: palette.paper,
                    color: palette.ink, outline: "none",
                    boxSizing: "border-box",
                  }}
                  autoFocus
                />
                <NextButton
                  onClick={() => {
                    const finalGoal = answers.goal_other_text.trim()
                      ? `その他: ${answers.goal_other_text}`
                      : "その他";
                    setAnswers({ ...answers, goal: finalGoal });
                    setStep(step + 1);
                  }}
                  disabled={false}
                />
              </>
            )}
          </>
        )}

        {/* ===== デザインスタイル(Unsplashパース画像) ===== */}
        {q.type === "styleCard" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {q.options.map((opt) => {
              const isSelected = selected === opt.label;
              return (
                <button key={opt.label} onClick={() => handleSelect(q.key, opt.label)}
                  style={{
                    background: palette.paper,
                    border: `1px solid ${isSelected ? palette.accent : palette.line}`,
                    borderWidth: isSelected ? 2 : 1,
                    padding: 0, cursor: "pointer",
                    transition: "all 0.3s",
                    borderRadius: 0, overflow: "hidden",
                    fontFamily: fontSans,
                    boxShadow: isSelected ? "0 8px 24px rgba(0,0,0,0.12)" : "0 2px 6px rgba(0,0,0,0.04)",
                    textAlign: "left",
                  }}>
                  {/* パース画像エリア(Unsplash + gradient fallback) */}
                  <div style={{
                    height: 180,
                    backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.4) 100%), url('${opt.imageUrl}'), ${opt.gradient}`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    position: "relative",
                    display: "flex",
                    alignItems: "flex-end",
                    padding: "0 20px 16px",
                  }}>
                    {isSelected && (
                      <div style={{ position: "absolute", top: 14, right: 14, width: 28, height: 28, borderRadius: "50%", background: palette.accent, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
                        <Check size={16} color={palette.paper} strokeWidth={2} />
                      </div>
                    )}
                    {/* 画像下部に重ねるスタイル名 */}
                    <div style={{
                      fontFamily: fontSerif,
                      fontSize: 22,
                      fontWeight: 400,
                      color: "#FFFFFF",
                      letterSpacing: "0.1em",
                      textShadow: "0 2px 8px rgba(0,0,0,0.6)",
                      zIndex: 1,
                    }}>
                      {opt.label}
                    </div>
                  </div>

                  {/* カラーパレット */}
                  <div style={{ display: "flex", height: 8 }}>
                    {opt.swatch.map((c, i) => <div key={i} style={{ flex: 1, background: c }} />)}
                  </div>

                  {/* 本文 */}
                  <div style={{ padding: "14px 18px 16px" }}>
                    <div style={{ fontSize: 12, color: palette.ink, letterSpacing: "0.05em", lineHeight: 1.7, marginBottom: 12 }}>{opt.mood}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {opt.materials.map((m) => (
                        <span key={m} style={{ fontSize: 10, padding: "4px 10px", border: `1px solid ${palette.line}`, color: palette.inkSoft, letterSpacing: "0.08em", fontFamily: fontSerif, background: palette.bg }}>{m}</span>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ===== リスト(予算・時期) ===== */}
        {q.type === "list" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {q.options.map((opt) => {
              const isSelected = selected === opt.label;
              const Icon = opt.Icon;
              return (
                <button key={opt.label} onClick={() => handleSelect(q.key, opt.label)}
                  style={{
                    background: isSelected ? palette.ink : palette.paper,
                    color: isSelected ? palette.paper : palette.ink,
                    border: `1px solid ${isSelected ? palette.ink : palette.line}`,
                    padding: "14px 18px", textAlign: "left",
                    cursor: "pointer", transition: "all 0.25s ease",
                    display: "flex", alignItems: "center", gap: 12,
                    borderRadius: 0, fontFamily: fontSans,
                  }}
                  onMouseEnter={(e) => { if (!isSelected) { e.currentTarget.style.background = palette.bgDeep; e.currentTarget.style.borderColor = palette.accent; } }}
                  onMouseLeave={(e) => { if (!isSelected) { e.currentTarget.style.background = palette.paper; e.currentTarget.style.borderColor = palette.line; } }}>
                  {Icon && (
                    <div style={{ width: 38, height: 38, borderRadius: "50%", border: `1px solid ${isSelected ? palette.paper : palette.line}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: isSelected ? "rgba(255,255,255,0.05)" : palette.bg }}>
                      <Icon size={18} strokeWidth={1.2} color={isSelected ? palette.paper : palette.ink} />
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "0.05em", marginBottom: 2, display: "flex", alignItems: "center", gap: 8 }}>
                      {opt.label}
                      {opt.intensity && (
                        <span style={{ fontSize: 10, letterSpacing: "0.1em", color: isSelected ? palette.line : palette.accent, opacity: 0.8 }}>{"¥".repeat(opt.intensity)}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 10.5, color: isSelected ? palette.line : palette.inkSoft, letterSpacing: "0.08em", fontFamily: fontSerif }}>{opt.note}</div>
                  </div>
                  <ChevronRight size={16} strokeWidth={1} />
                </button>
              );
            })}
          </div>
        )}

        {/* ===== 家族構成 ===== */}
        {q.type === "family" && (
          <>
            <div style={{ background: palette.paper, border: `1px solid ${palette.line}`, padding: "24px 22px", display: "flex", flexDirection: "column", gap: 22 }}>
              {/* 大人 */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Users size={18} color={palette.accent} strokeWidth={1.2} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "0.05em" }}>大人</div>
                    <div style={{ fontSize: 10, color: palette.inkSoft, fontFamily: fontSerif, letterSpacing: "0.1em" }}>Adults</div>
                  </div>
                </div>
                <Stepper value={answers.adults || 0} onChange={(v) => setAnswers({ ...answers, adults: v })} max={20} suffix="人" />
              </div>

              {/* 子供 */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Users size={18} color={palette.accent} strokeWidth={1.2} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "0.05em" }}>子供</div>
                    <div style={{ fontSize: 10, color: palette.inkSoft, fontFamily: fontSerif, letterSpacing: "0.1em" }}>Children</div>
                  </div>
                </div>
                <Stepper
                  value={answers.children || 0}
                  onChange={(v) => {
                    // 子供の数が変わったらchild_agesも調整
                    const newAges = [...(answers.child_ages || [])];
                    while (newAges.length < v) newAges.push(5);
                    while (newAges.length > v) newAges.pop();
                    setAnswers({ ...answers, children: v, child_ages: newAges });
                  }}
                  max={15} suffix="人"
                />
              </div>

              {/* 子供の年齢(子供>0時のみ) */}
              {answers.children > 0 && (
                <div style={{ borderTop: `1px dashed ${palette.line}`, paddingTop: 18, display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ fontSize: 11, color: palette.inkSoft, fontFamily: fontSerif, letterSpacing: "0.2em", marginBottom: -6 }}>お子様の年齢</div>
                  {Array.from({ length: answers.children }).map((_, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 400, letterSpacing: "0.05em", color: palette.inkSoft }}>
                        お子様 {i + 1}
                      </div>
                      <Stepper
                        value={(answers.child_ages || [])[i] ?? 5}
                        onChange={(v) => {
                          const newAges = [...(answers.child_ages || [])];
                          newAges[i] = v;
                          setAnswers({ ...answers, child_ages: newAges });
                        }}
                        max={25}
                        suffix="歳"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* ペット */}
              <div style={{ borderTop: `1px dashed ${palette.line}`, paddingTop: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <PawPrint size={18} color={palette.accent} strokeWidth={1.2} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: "0.05em" }}>ペット</div>
                    <div style={{ fontSize: 10, color: palette.inkSoft, fontFamily: fontSerif, letterSpacing: "0.1em" }}>Pets</div>
                  </div>
                </div>
                <JpInput
                  type="text"
                  value={answers.pets || ""}
                  onChange={(v) => setAnswers({ ...answers, pets: v })}
                  placeholder="例: 犬1匹、猫2匹  /  なし"
                  style={{
                    width: "100%", padding: "12px 14px",
                    border: `1px solid ${palette.line}`,
                    borderRadius: 0, fontFamily: fontSans,
                    fontSize: 13, background: palette.bg,
                    color: palette.ink, outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>
            <NextButton onClick={() => setStep(step + 1)} disabled={false} />
          </>
        )}

        {/* ===== テキストエリア ===== */}
        {q.type === "textarea" && (
          <>
            <div style={{ position: "relative" }}>
              <MessageSquare size={16} color={palette.accent} strokeWidth={1.2} style={{ position: "absolute", top: 14, left: 14, zIndex: 1 }} />
              <JpInput
                multiline
                value={answers[q.key] || ""}
                onChange={(v) => setAnswers({ ...answers, [q.key]: v })}
                placeholder={q.placeholder}
                style={{
                  width: "100%", padding: "14px 16px 14px 40px",
                  minHeight: 160, resize: "vertical",
                  border: `1px solid ${palette.line}`,
                  borderRadius: 0, fontFamily: fontSans,
                  fontSize: 14, background: palette.paper,
                  color: palette.ink, outline: "none",
                  boxSizing: "border-box",
                  lineHeight: 1.7,
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: palette.inkSoft, fontFamily: fontSerif, letterSpacing: "0.1em", textAlign: "center", marginTop: 12 }}>
              ※ 空欄でも構いません
            </div>
            <NextButton onClick={() => setStep(step + 1)} disabled={false} label={answers[q.key]?.trim() ? "次へ進む" : "スキップして次へ"} />
          </>
        )}

        {/* ===== ファイル添付 ===== */}
        {q.type === "fileUpload" && (
          <>
            <div style={{ background: palette.paper, border: `1px dashed ${palette.line}`, padding: "32px 20px", textAlign: "center" }}>
              <ImageIcon size={36} color={palette.accent} strokeWidth={1} style={{ marginBottom: 14 }} />
              <div style={{ fontFamily: fontSerif, fontSize: 13, color: palette.ink, marginBottom: 8, letterSpacing: "0.1em" }}>
                参考イメージを添付
              </div>
              <div style={{ fontSize: 11, color: palette.inkSoft, fontFamily: fontSerif, lineHeight: 1.7, marginBottom: 20 }}>
                {q.hint}
              </div>

              <label style={{
                display: "inline-block",
                padding: "14px 32px",
                background: palette.ink,
                color: palette.paper,
                fontFamily: fontSerif,
                fontSize: 12,
                letterSpacing: "0.2em",
                cursor: "pointer",
                transition: "all 0.3s",
              }}>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setAnswers({
                      ...answers,
                      images: files.map((f) => ({ name: f.name, size: f.size, file: f })),
                    });
                  }}
                />
                画像を選択する
              </label>

              {(answers.images || []).length > 0 && (
                <div style={{ marginTop: 20, textAlign: "left", borderTop: `1px solid ${palette.line}`, paddingTop: 16 }}>
                  <div style={{ fontSize: 11, color: palette.accent, fontFamily: fontSerif, letterSpacing: "0.2em", marginBottom: 8 }}>
                    {answers.images.length}件の画像
                  </div>
                  {answers.images.map((img, i) => (
                    <div key={i} style={{ fontSize: 11, color: palette.inkSoft, marginBottom: 4, fontFamily: fontSans, display: "flex", alignItems: "center", gap: 8 }}>
                      <Check size={12} color={palette.accent} />
                      {img.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ fontSize: 11, color: palette.inkSoft, fontFamily: fontSerif, letterSpacing: "0.1em", textAlign: "center", marginTop: 12 }}>
              ※ 添付がなくても次へ進めます
            </div>
            <NextButton onClick={() => setStep(step + 1)} disabled={false} label={(answers.images || []).length > 0 ? "次へ進む" : "スキップして次へ"} />
          </>
        )}

        {step > 1 && (
          <button onClick={() => setStep(step - 1)} style={{ marginTop: 22, background: "transparent", border: "none", color: palette.inkSoft, fontSize: 12, cursor: "pointer", letterSpacing: "0.15em", fontFamily: fontSerif }}>
            ← 一つ前の質問へ
          </button>
        )}
      </Frame>
    );
  }

  // Formspree送信 (imgBB事前アップロード + JSON送信)
  const submitToFormspree = async () => {
    setSubmitting(true);
    setSubmitError(null);

    // 整形した家族構成テキスト
    const familyParts = [];
    if (isResidential(answers.places)) {
      if (answers.adults > 0) familyParts.push(`大人 ${answers.adults}人`);
      if (answers.children > 0) {
        const ages = (answers.child_ages || []).map((a) => `${a}歳`).join("・");
        familyParts.push(`子供 ${answers.children}人 (${ages})`);
      }
      if (answers.pets?.trim()) familyParts.push(`ペット: ${answers.pets}`);
    }
    const familyText = familyParts.join(" / ") || "—";

    // 画像があれば事前に imgBB にアップロード
    const imageList = answers.images || [];
    let imageReport = "なし";
    if (imageList.length > 0) {
      const uploadResults = [];
      for (let i = 0; i < imageList.length; i++) {
        const img = imageList[i];
        const file = img.file || img;
        if (file instanceof File || file instanceof Blob) {
          const result = await uploadImageToImgbb(file);
          if (result) {
            uploadResults.push(`${i + 1}) ${img.name || `image_${i + 1}`}\n   ${result.display_url}`);
          } else {
            uploadResults.push(`${i + 1}) ${img.name || `image_${i + 1}`} (アップロード失敗)`);
          }
        }
      }
      imageReport = `${imageList.length}件\n\n${uploadResults.join("\n\n")}`;
    }

    // Formspree への送信ペイロード
    const payload = {
      _subject: `[暮らしの設計図] 新規回答 - ${answers.contact_name || "お客様"}様`,
      お客様名: answers.contact_name || "(未入力)",
      メールアドレス: answers.contact_email || "(未入力)",
      電話番号: answers.contact_phone || "(未入力)",
      お問い合わせID: answers.inquiry_id || "(なし)",
      リフォーム場所: (answers.places || []).join("、"),
      改修目標: answers.goal || "—",
      デザインテイスト: answers.style || "—",
      ご予算: answers.budget || "—",
      竣工タイミング: answers.timing || "—",
      ご家族構成: familyText,
      ご要望メッセージ: answers.message || "(なし)",
      参考イメージ: imageReport,
    };

    try {
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setStep(sentStep);
      } else {
        let body = "";
        try { body = await res.text(); } catch (e) {}
        setSubmitError(`送信エラー [HTTP ${res.status}]\n${body.substring(0, 400)}\n\n※このスクリーンショットを開発者にお見せください。`);
      }
    } catch (e) {
      setSubmitError(`通信エラー: ${e.name || "Unknown"}\nメッセージ: ${e.message || "詳細なし"}\n\n※このスクリーンショットを開発者にお見せください。`);
    } finally {
      setSubmitting(false);
    }
  };

  // 確認画面
  if (step === summaryStep) {
    const placesText = (answers.places || []).join("、") || "—";

    let familyText = "";
    if (isResidential(answers.places)) {
      const parts = [];
      if (answers.adults > 0) parts.push(`大人 ${answers.adults}人`);
      if (answers.children > 0) {
        const ages = (answers.child_ages || []).map((a) => `${a}歳`).join("・");
        parts.push(`子供 ${answers.children}人 (${ages})`);
      }
      if (answers.pets?.trim()) parts.push(`ペット: ${answers.pets}`);
      familyText = parts.join(" / ") || "—";
    }

    const imageText = (answers.images || []).length > 0 ? `${answers.images.length}件添付` : "なし";

    const rows = [
      { label: "リフォーム場所", value: placesText, Icon: Home, multiline: true },
      { label: "改修目標", value: answers.goal, Icon: Target, multiline: true },
      { label: "デザインテイスト", value: answers.style, Icon: Sparkles },
      { label: "ご予算", value: answers.budget, Icon: Coins },
      { label: "竣工タイミング", value: answers.timing, Icon: Calendar },
      isResidential(answers.places) && { label: "ご家族構成", value: familyText, Icon: Users, multiline: true },
      answers.message?.trim() && { label: "ご要望・メッセージ", value: answers.message, Icon: MessageSquare, multiline: true },
      { label: "参考イメージ", value: imageText, Icon: ImageIcon },
    ].filter(Boolean);

    return (
      <Frame>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <Sparkles size={28} strokeWidth={1} color={palette.accent} style={{ marginBottom: 16 }} />
          <div style={{ fontFamily: fontSerif, fontSize: 11, letterSpacing: "0.35em", color: palette.accent, marginBottom: 16 }}>─── CONFIRMATION ───</div>
          <h2 style={{ fontFamily: fontSerif, fontSize: 24, fontWeight: 400, lineHeight: 1.6, margin: 0, letterSpacing: "0.04em" }}>ご回答内容の<br />ご確認</h2>
        </div>

        {/* お客様情報セクション(URLパラメータから自動入力 / 編集可) */}
        <div style={{ background: palette.paper, border: `1px solid ${palette.line}`, padding: "22px 20px", marginBottom: 18 }}>
          <div style={{ fontFamily: fontSerif, fontSize: 11, letterSpacing: "0.3em", color: palette.accent, marginBottom: 14, textAlign: "center" }}>
            ご連絡先
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: palette.inkSoft, fontFamily: fontSerif, letterSpacing: "0.2em", marginBottom: 4 }}>お名前 <span style={{ color: palette.accent }}>*</span></div>
              <JpInput
                type="text"
                value={answers.contact_name}
                onChange={(v) => setAnswers({ ...answers, contact_name: v })}
                placeholder="山田 太郎"
                style={{ width: "100%", padding: "10px 12px", border: `1px solid ${palette.line}`, borderRadius: 0, fontFamily: fontSans, fontSize: 14, background: palette.bg, color: palette.ink, outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, color: palette.inkSoft, fontFamily: fontSerif, letterSpacing: "0.2em", marginBottom: 4 }}>メールアドレス <span style={{ color: palette.accent }}>*</span></div>
              <JpInput
                type="email"
                value={answers.contact_email}
                onChange={(v) => setAnswers({ ...answers, contact_email: v })}
                placeholder="yamada@example.com"
                style={{ width: "100%", padding: "10px 12px", border: `1px solid ${palette.line}`, borderRadius: 0, fontFamily: fontSans, fontSize: 14, background: palette.bg, color: palette.ink, outline: "none", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <div style={{ fontSize: 10, color: palette.inkSoft, fontFamily: fontSerif, letterSpacing: "0.2em", marginBottom: 4 }}>お電話番号</div>
              <JpInput
                type="tel"
                value={answers.contact_phone}
                onChange={(v) => setAnswers({ ...answers, contact_phone: v })}
                placeholder="090-1234-5678"
                style={{ width: "100%", padding: "10px 12px", border: `1px solid ${palette.line}`, borderRadius: 0, fontFamily: fontSans, fontSize: 14, background: palette.bg, color: palette.ink, outline: "none", boxSizing: "border-box" }}
              />
            </div>
          </div>
        </div>

        {/* ヒアリング内容セクション */}
        <div style={{ background: palette.paper, border: `1px solid ${palette.line}`, padding: "22px 20px", marginBottom: 28 }}>
          {rows.map((row, idx) => {
            const Icon = row.Icon;
            return (
              <div key={row.label} style={{ paddingBottom: 14, marginBottom: 14, borderBottom: idx === rows.length - 1 ? "none" : `1px dashed ${palette.line}`, display: "flex", alignItems: row.multiline ? "flex-start" : "center", gap: 12 }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", border: `1px solid ${palette.line}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: palette.bg, marginTop: row.multiline ? 2 : 0 }}>
                  <Icon size={13} strokeWidth={1.2} color={palette.accent} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: fontSerif, fontSize: 9, letterSpacing: "0.3em", color: palette.inkSoft, marginBottom: 4 }}>{row.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: "0.05em", lineHeight: row.multiline ? 1.7 : 1.4, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
                    {row.value || "—"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {submitError && (
          <div style={{ background: "#FBE9E7", border: "1px solid #D84315", color: "#BF360C", padding: "12px 16px", marginBottom: 16, fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {submitError}
          </div>
        )}

        <button
          onClick={submitToFormspree}
          disabled={submitting || !answers.contact_name.trim() || !answers.contact_email.trim()}
          style={{
            width: "100%",
            background: submitting || !answers.contact_name.trim() || !answers.contact_email.trim() ? palette.line : palette.ink,
            color: palette.paper,
            border: "none",
            padding: "22px",
            fontFamily: fontSerif,
            fontSize: 14,
            letterSpacing: "0.25em",
            cursor: submitting || !answers.contact_name.trim() || !answers.contact_email.trim() ? "not-allowed" : "pointer",
            transition: "all 0.3s",
            borderRadius: 0,
            opacity: submitting || !answers.contact_name.trim() || !answers.contact_email.trim() ? 0.6 : 1,
          }}
          onMouseEnter={(e) => { if (!submitting && answers.contact_name.trim() && answers.contact_email.trim()) e.currentTarget.style.background = palette.accent; }}
          onMouseLeave={(e) => { if (!submitting && answers.contact_name.trim() && answers.contact_email.trim()) e.currentTarget.style.background = palette.ink; }}
        >
          {submitting ? "送信中..." : (!answers.contact_name.trim() || !answers.contact_email.trim() ? "お名前とメールをご入力ください" : "この内容で送信する")}
        </button>

        <button onClick={() => { setAnswers({ contact_name: "", contact_email: "", contact_phone: "", inquiry_id: "", places: [], goal: null, goal_other_text: "", style: null, budget: null, timing: null, adults: 2, children: 0, child_ages: [], pets: "", message: "", images: [] }); setStep(0); }} style={{ marginTop: 20, width: "100%", background: "transparent", border: "none", color: palette.inkSoft, fontSize: 12, cursor: "pointer", letterSpacing: "0.15em", fontFamily: fontSerif }}>
          最初からやり直す
        </button>
      </Frame>
    );
  }

  // 送信完了
  if (step === sentStep) {
    return (
      <Frame>
        <div style={{ textAlign: "center", paddingTop: 60 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", border: `1px solid ${palette.accent}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 32px" }}>
            <Check size={28} strokeWidth={1} color={palette.accent} />
          </div>
          <div style={{ fontFamily: fontSerif, fontSize: 11, letterSpacing: "0.35em", color: palette.accent, marginBottom: 24 }}>─── THANK YOU ───</div>
          <h2 style={{ fontFamily: fontSerif, fontSize: 24, fontWeight: 400, lineHeight: 1.8, margin: "0 0 32px 0", letterSpacing: "0.04em" }}>ご回答ありがとう<br />ございました</h2>
          <p style={{ fontSize: 13, lineHeight: 2, color: palette.inkSoft, letterSpacing: "0.08em", margin: 0 }}>内容を確認次第、<br />スタッフよりご連絡を<br />差し上げます。</p>
          <div style={{ marginTop: 60, fontFamily: fontSerif, fontSize: 12, letterSpacing: "0.2em", color: palette.ink }}>株式会社イエスリフォーム</div>
          <div style={{ fontFamily: fontSerif, fontSize: 10, letterSpacing: "0.3em", color: palette.inkSoft, marginTop: 6 }}>YES REFORM Staff</div>
        </div>
      </Frame>
    );
  }

  return null;
}
