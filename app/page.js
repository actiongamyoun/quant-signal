"use client";

import { useState, useEffect, useCallback } from "react";

// ─── 색상 ───────────────────────────────────────────────────
const C = {
  bg: "#f5f6fa", card: "#ffffff", bd: "rgba(0,0,0,.06)",
  tx: "#191f28", sub: "#4e5968", mt: "#8b95a1", lt: "#b0b8c1",
  blue: "#3182f6", blueL: "#e8f3ff", blueD: "#1b64da",
  green: "#00b386", greenL: "#e8faf5",
  red: "#f04452", redL: "#fff0f1",
  amber: "#ff8800", amberL: "#fff4e6",
  purple: "#7048e8", purpleL: "#f3f0ff",
  grey: "#f2f4f6",
};

function probColor(p) { return p >= 75 ? C.blue : p >= 60 ? C.green : p >= 45 ? C.amber : C.red; }
function probBg(p) { return p >= 75 ? C.blueL : p >= 60 ? C.greenL : p >= 45 ? C.amberL : C.redL; }
function probLabel(p) { return p >= 75 ? "강력" : p >= 60 ? "유망" : p >= 45 ? "보통" : "약함"; }
function probDesc(p) { return p >= 75 ? "상승 확률이 매우 높아요" : p >= 60 ? "긍정적 시그널이 감지됐어요" : p >= 45 ? "추가 확인이 필요해요" : "리스크가 높아요"; }

function Icon({ name, size = 20, color = C.mt, style: s = {} }) {
  return <span className="material-symbols-rounded" style={{ fontSize: size, color, lineHeight: 1, ...s }}>{name}</span>;
}

const SECTORS = ["전체", "반도체", "배터리", "IT", "바이오", "금융", "자동차", "화학", "소재", "지주", "통신", "에너지"];

export default function Home() {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("demo");
  const [sector, setSector] = useState("전체");
  const [selected, setSelected] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState({ appKey: "", appSecret: "" });

  // 시그널 데이터 로드
  const loadSignals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/signals");
      const data = await res.json();
      if (data.signals) {
        setSignals(data.signals);
        setMode(data.mode || "demo");
      }
    } catch (err) {
      console.error("시그널 로드 실패:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadSignals(); }, [loadSignals]);

  // AI 분석 요청
  const handleAnalyze = async (stock) => {
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stock),
      });
      const data = await res.json();
      setAnalysis(data.analysis || data.error || "분석에 실패했어요");
    } catch (err) {
      setAnalysis("분석 중 오류가 발생했어요");
    }
    setAnalyzing(false);
  };

  const filtered = sector === "전체" ? signals : signals.filter(s => s.sector === sector);
  const detail = selected ? signals.find(s => s.code === selected) : null;
  const strongCount = filtered.filter(s => s.probability >= 70).length;
  const avgProb = filtered.length > 0 ? Math.round(filtered.reduce((a, b) => a + b.probability, 0) / filtered.length) : 0;

  // ─── 스타일 ───────────────────────────────────────────────
  const cardStyle = {
    background: C.card, borderRadius: 16,
    boxShadow: "0 1px 3px rgba(0,0,0,.04), 0 1px 2px rgba(0,0,0,.02)",
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>

      {/* ─── Header ─── */}
      <header style={{
        padding: "12px 20px", background: "#fff",
        borderBottom: `1px solid ${C.bd}`,
        position: "sticky", top: 0, zIndex: 50,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {detail && (
            <button onClick={() => { setSelected(null); setAnalysis(null); }}
              style={{ padding: "6px 8px", borderRadius: 8, border: "none", background: C.grey, cursor: "pointer", display: "flex", alignItems: "center" }}>
              <Icon name="arrow_back" size={20} color={C.sub} />
            </button>
          )}
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: `linear-gradient(135deg, ${C.blue}, #00b4d8)`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon name="query_stats" size={18} color="#fff" />
          </div>
          <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.3 }}>QuantSignal</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            padding: "3px 8px", borderRadius: 6,
            background: mode === "live" ? C.greenL : C.amberL,
            display: "flex", alignItems: "center", gap: 4,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: mode === "live" ? C.green : C.amber, display: "inline-block" }} />
            <span style={{ fontSize: 11, color: mode === "live" ? C.green : C.amber, fontWeight: 600 }}>{mode === "live" ? "LIVE" : "DEMO"}</span>
          </div>
          <button onClick={() => setShowSettings(!showSettings)}
            style={{ padding: 6, borderRadius: 8, border: "none", background: C.grey, cursor: "pointer", display: "flex" }}>
            <Icon name="settings" size={20} color={C.sub} />
          </button>
        </div>
      </header>

      {/* Settings Panel */}
      {showSettings && (
        <div style={{ padding: "16px 20px", background: "#fff", borderBottom: `1px solid ${C.bd}` }} className="fade-up">
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={{ fontSize: 11, color: C.mt, display: "block", marginBottom: 4 }}>KIS APP KEY</label>
              <input type="password" value={config.appKey} onChange={e => setConfig({ ...config, appKey: e.target.value })}
                placeholder="APP KEY" style={{ width: "100%", padding: "8px 12px", border: `1px solid ${C.bd}`, borderRadius: 10, fontSize: 13, fontFamily: "'DM Mono'", outline: "none" }} />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={{ fontSize: 11, color: C.mt, display: "block", marginBottom: 4 }}>KIS APP SECRET</label>
              <input type="password" value={config.appSecret} onChange={e => setConfig({ ...config, appSecret: e.target.value })}
                placeholder="APP SECRET" style={{ width: "100%", padding: "8px 12px", border: `1px solid ${C.bd}`, borderRadius: 10, fontSize: 13, fontFamily: "'DM Mono'", outline: "none" }} />
            </div>
          </div>
          <p style={{ fontSize: 11, color: C.mt, marginTop: 8 }}>Vercel 환경변수로도 설정 가능해요. ANTHROPIC_API_KEY는 환경변수 전용이에요.</p>
        </div>
      )}

      <main style={{ padding: "20px 20px 40px", maxWidth: 640, margin: "0 auto" }}>

        {/* ══════════ 로딩 ══════════ */}
        {loading && (
          <div style={{ textAlign: "center", padding: "80px 20px" }} className="fade-up">
            <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
            <p style={{ fontSize: 14, color: C.sub, marginTop: 16 }}>시그널을 분석하고 있어요...</p>
            <p style={{ fontSize: 12, color: C.mt, marginTop: 4 }}>30개 종목 데이터를 수집 중</p>
          </div>
        )}

        {/* ══════════ 시그널 목록 ══════════ */}
        {!loading && !detail && (<>

          {/* 타이틀 */}
          <div className="fade-up" style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: C.blue, fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
              <Icon name="auto_awesome" size={16} color={C.blue} />
              {mode === "live" ? "실시간 데이터 분석 완료" : "데모 데이터로 분석 중"}
            </p>
            <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.3 }}>
              오늘 발견한 시그널이에요
            </h2>
          </div>

          {/* 요약 카드 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
            {[
              { label: "발견 종목", val: filtered.length, unit: "개", color: C.blue },
              { label: "강력 시그널", val: strongCount, unit: "개", color: C.green },
              { label: "평균 확률", val: avgProb, unit: "%", color: C.tx },
            ].map((d, i) => (
              <div key={i} className="fade-up" style={{ ...cardStyle, padding: 16, animationDelay: `${i * 0.05}s` }}>
                <div style={{ fontSize: 11, color: C.mt, fontWeight: 500, marginBottom: 6 }}>{d.label}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                  <span className="mono" style={{ fontSize: 28, fontWeight: 700, color: d.color }}>{d.val}</span>
                  <span style={{ fontSize: 13, color: C.mt }}>{d.unit}</span>
                </div>
              </div>
            ))}
          </div>

          {/* 섹터 필터 */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 16 }}>
            {SECTORS.map(s => {
              const hasData = s === "전체" || signals.some(sig => sig.sector === s);
              if (!hasData) return null;
              return (
                <button key={s} onClick={() => setSector(s)} style={{
                  padding: "6px 14px", borderRadius: 20, fontSize: 13, border: "none",
                  background: sector === s ? C.blue : C.grey,
                  color: sector === s ? "#fff" : C.sub,
                  fontWeight: sector === s ? 600 : 500, cursor: "pointer",
                  fontFamily: "'Pretendard'", whiteSpace: "nowrap", transition: "all .15s",
                }}>{s}</button>
              );
            })}
          </div>

          {/* 설정 바 */}
          <div className="fade-up" style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 14px", background: C.blueL, borderRadius: 12, marginBottom: 14,
          }}>
            <Icon name="tune" size={18} color={C.blue} />
            <span style={{ fontSize: 12, color: C.blueD, fontWeight: 500 }}>
              목표수익 <strong>+15%</strong> · 보유기간 <strong>20일</strong> 기준
            </span>
            <Icon name="chevron_right" size={18} color={C.blue} style={{ marginLeft: "auto" }} />
          </div>

          {/* 시그널 카드 리스트 */}
          {filtered.map((s, i) => (
            <div key={s.code} className="fade-up" style={{
              ...cardStyle, padding: 20, marginBottom: 10, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 16,
              animationDelay: `${i * 0.04}s`, transition: "all .2s",
            }}
              onClick={() => { setSelected(s.code); setAnalysis(null); }}>

              {/* 확률 링 */}
              <div style={{ position: "relative", flexShrink: 0 }}>
                <svg width="56" height="56" viewBox="0 0 56 56" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="28" cy="28" r="23" fill="none" stroke={C.grey} strokeWidth="4" />
                  <circle cx="28" cy="28" r="23" fill="none"
                    stroke={probColor(s.probability)} strokeWidth="4"
                    strokeDasharray={`${(s.probability / 100) * 144.5} 144.5`}
                    strokeLinecap="round" />
                </svg>
                <div style={{
                  position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
                  fontFamily: "'DM Mono'", fontSize: 15, fontWeight: 700, color: probColor(s.probability),
                }}>{s.probability}</div>
              </div>

              {/* 종목 정보 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{s.name}</span>
                  <span style={{
                    padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                    background: probBg(s.probability), color: probColor(s.probability),
                  }}>{probLabel(s.probability)}</span>
                </div>
                <div style={{ fontSize: 12.5, color: C.sub, lineHeight: 1.4 }}>{s.reason}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
                  <span className="mono" style={{ fontSize: 12, color: C.tx, fontWeight: 500 }}>₩{s.price?.toLocaleString()}</span>
                  <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: s.chg >= 0 ? C.green : C.red }}>
                    {s.chg >= 0 ? "+" : ""}{s.chg}%
                  </span>
                  <span style={{ fontSize: 11, color: C.lt }}>·</span>
                  <span style={{ fontSize: 11, color: C.mt }}>스코어 {s.score}</span>
                </div>
              </div>

              <Icon name="chevron_right" size={22} color={C.lt} style={{ flexShrink: 0 }} />
            </div>
          ))}

          {/* 하단 */}
          <div style={{ padding: "16px 0", textAlign: "center" }}>
            <p style={{ fontSize: 11, color: C.lt, lineHeight: 1.6 }}>
              확률은 과거 데이터 기반 통계 추정값이에요<br />투자 판단은 본인의 책임이에요
            </p>
            <button onClick={loadSignals} style={{
              marginTop: 12, padding: "10px 20px", borderRadius: 12, border: "none",
              background: C.grey, color: C.sub, fontSize: 13, fontWeight: 500,
              cursor: "pointer", fontFamily: "'Pretendard'",
            }}>
              <Icon name="refresh" size={16} color={C.sub} style={{ verticalAlign: -3, marginRight: 4 }} />
              새로고침
            </button>
          </div>
        </>)}

        {/* ══════════ 종목 상세 ══════════ */}
        {!loading && detail && (
          <div className="fade-up">

            {/* 종목 헤더 */}
            <div style={{ ...cardStyle, padding: 24, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3 }}>{detail.name}</span>
                    <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: C.purpleL, color: C.purple }}>{detail.sector}</span>
                  </div>
                  <span className="mono" style={{ fontSize: 12, color: C.mt }}>{detail.code}</span>
                </div>
                <div style={{ position: "relative" }}>
                  <svg width="80" height="80" viewBox="0 0 80 80" style={{ transform: "rotate(-90deg)" }}>
                    <circle cx="40" cy="40" r="33" fill="none" stroke={C.grey} strokeWidth="5" />
                    <circle cx="40" cy="40" r="33" fill="none"
                      stroke={probColor(detail.probability)} strokeWidth="5"
                      strokeDasharray={`${(detail.probability / 100) * 207.3} 207.3`}
                      strokeLinecap="round" />
                  </svg>
                  <div style={{
                    position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
                    fontFamily: "'DM Mono'", fontSize: 22, fontWeight: 700, color: probColor(detail.probability),
                  }}>{detail.probability}%</div>
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <div className="mono" style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1 }}>₩{detail.price?.toLocaleString()}</div>
                <span className="mono" style={{ fontSize: 14, fontWeight: 600, color: detail.chg >= 0 ? C.green : C.red }}>
                  {detail.chg >= 0 ? "+" : ""}{detail.chg}%
                </span>
              </div>

              <div style={{
                marginTop: 14, padding: "12px 14px", background: probBg(detail.probability),
                borderRadius: 12, display: "flex", alignItems: "center", gap: 10,
              }}>
                <Icon name="auto_awesome" size={20} color={probColor(detail.probability)} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: probColor(detail.probability) }}>{probDesc(detail.probability)}</div>
                  <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{detail.reason}</div>
                </div>
              </div>
            </div>

            {/* 스코어 분해 */}
            <div style={{ ...cardStyle, padding: 24, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 18 }}>
                <Icon name="analytics" size={20} color={C.blue} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>스코어 분석</span>
                <span className="mono" style={{ fontSize: 13, color: C.blue, fontWeight: 600, marginLeft: "auto" }}>{detail.score}/100</span>
              </div>
              {[
                { icon: "trending_up", label: "돌파 거리", desc: "120일 고점 대비 위치", val: detail.features?.breakout || 50 },
                { icon: "bar_chart", label: "거래량 Z-score", desc: `평균 대비 ${detail.volZRaw || "1.0"}배`, val: detail.features?.volumeZ || 50, raw: `${detail.volZRaw || "1.0"}x` },
                { icon: "show_chart", label: "추세 강도", desc: "MA20 vs MA60 정배열", val: detail.features?.trend || 50 },
                { icon: "compress", label: "변동성 수축", desc: "볼린저밴드 수축도", val: detail.features?.volContraction || 50 },
                { icon: "group_work", label: "섹터 상대강도", desc: "업종 내 상대 위치", val: detail.features?.sectorRS || 50 },
              ].map((f, i) => (
                <div key={i} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Icon name={f.icon} size={18} color={C.sub} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{f.label}</div>
                        <div style={{ fontSize: 11, color: C.mt }}>{f.desc}</div>
                      </div>
                    </div>
                    <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: probColor(f.val) }}>{f.raw || f.val}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: C.grey, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 3, width: `${f.val}%`, background: `linear-gradient(90deg, ${probColor(f.val)}88, ${probColor(f.val)})`, transition: "width .8s cubic-bezier(.22,1,.36,1)" }} />
                  </div>
                </div>
              ))}
            </div>

            {/* 매매 가이드 */}
            <div style={{ ...cardStyle, padding: 24, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
                <Icon name="assistant_navigation" size={20} color={C.green} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>매매 가이드</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                <div style={{ padding: 16, background: C.greenL, borderRadius: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
                    <Icon name="flag" size={16} color={C.green} />
                    <span style={{ fontSize: 11, color: C.green, fontWeight: 600 }}>목표가 (+15%)</span>
                  </div>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: C.green }}>₩{Math.round(detail.price * 1.15).toLocaleString()}</div>
                </div>
                <div style={{ padding: 16, background: C.redL, borderRadius: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
                    <Icon name="shield" size={16} color={C.red} />
                    <span style={{ fontSize: 11, color: C.red, fontWeight: 600 }}>손절가 (-5%)</span>
                  </div>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: C.red }}>₩{Math.round(detail.price * 0.95).toLocaleString()}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 16, padding: "12px 0" }}>
                {[
                  { icon: "schedule", label: "보유기간", val: "20일" },
                  { icon: "balance", label: "손익비", val: "3 : 1" },
                  { icon: "pie_chart", label: "권장비중", val: "10%" },
                ].map((m, i) => (
                  <div key={i} style={{ flex: 1, textAlign: "center" }}>
                    <Icon name={m.icon} size={20} color={C.mt} />
                    <div style={{ fontSize: 10, color: C.mt, marginTop: 4, marginBottom: 2 }}>{m.label}</div>
                    <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: C.tx }}>{m.val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 백테스트 */}
            <div style={{ ...cardStyle, padding: 24, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
                <Icon name="history" size={20} color={C.purple} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>백테스트 성과</span>
                <span style={{ fontSize: 11, color: C.mt, marginLeft: "auto" }}>유사 패턴 기준</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[
                  { label: "승률", val: `${Math.round(detail.probability * 0.9)}%`, color: C.green },
                  { label: "평균수익", val: "+12.3%", color: C.blue },
                  { label: "샤프비율", val: "1.42", color: C.purple },
                  { label: "최대낙폭", val: "-8.2%", color: C.red },
                  { label: "표본 수", val: "847건", color: C.tx },
                  { label: "분석기간", val: "3년", color: C.tx },
                ].map((m, i) => (
                  <div key={i} style={{ padding: 14, background: C.bg, borderRadius: 12, textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: C.mt, marginBottom: 6, fontWeight: 500 }}>{m.label}</div>
                    <div className="mono" style={{ fontSize: 17, fontWeight: 700, color: m.color }}>{m.val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI 분석 버튼 + 결과 */}
            <div style={{ ...cardStyle, padding: 24, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
                <Icon name="psychology" size={20} color={C.blue} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>AI 분석</span>
              </div>

              {!analysis && !analyzing && (
                <button onClick={() => handleAnalyze(detail)} style={{
                  width: "100%", padding: "14px 0", borderRadius: 14, border: "none",
                  background: `linear-gradient(135deg, ${C.blue}, #00b4d8)`,
                  color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
                  fontFamily: "'Pretendard'", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  boxShadow: "0 4px 16px rgba(49,130,246,.25)",
                }}>
                  <Icon name="auto_awesome" size={20} color="#fff" />
                  AI에게 이 종목 분석 요청
                </button>
              )}

              {analyzing && (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <span className="spinner" />
                  <p style={{ fontSize: 13, color: C.sub, marginTop: 10 }}>AI가 분석하고 있어요...</p>
                </div>
              )}

              {analysis && !analyzing && (
                <div className="fade-in" style={{ fontSize: 13, lineHeight: 2, color: C.tx, whiteSpace: "pre-wrap", wordBreak: "keep-all" }}>
                  {analysis}
                </div>
              )}
            </div>

            {/* 주의사항 */}
            <div style={{
              padding: "14px 16px", background: C.amberL, borderRadius: 14,
              display: "flex", alignItems: "flex-start", gap: 10,
            }}>
              <Icon name="info" size={20} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.7 }}>
                확률은 과거 데이터 기반 통계 추정값이며 미래 수익을 보장하지 않아요. 분산 투자와 손절 규칙을 꼭 지켜주세요.
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
