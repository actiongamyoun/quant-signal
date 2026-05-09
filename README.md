# QuantSignal — 확률 기반 투자 시그널

"이 종목이 20일 내 15% 오를 확률은 73%입니다"

확률이 먼저 보이는 주식앱. 기존 앱들과 완전히 다른 UX.

## 구조

```
quant-signal/
├── app/
│   ├── page.js                ← 토스 스타일 메인 UI
│   ├── layout.js / globals.css
│   └── api/
│       ├── signals/route.js   ← 핵심: KIS 데이터 → 스코어링 → 시그널
│       ├── analyze/route.js   ← Claude AI 분석
│       ├── kis-token/route.js
│       └── kis-proxy/route.js
└── lib/
    └── scoring.js             ← 피처 엔지니어링 + 규칙 스코어링
```

## 스코어링 엔진 (5개 피처)

| 피처 | 가중치 | 설명 |
|------|--------|------|
| 돌파 거리 | 25% | 120일 고점 대비 현재가 위치 |
| 거래량 Z-score | 20% | 최근 거래량 / 과거 평균 대비 |
| 추세 강도 | 25% | MA20 vs MA60 정배열 + 기울기 |
| 변동성 수축 | 15% | 볼린저밴드 수축도 |
| 섹터 상대강도 | 15% | 업종 내 상대 RSI |

스코어 → 확률 매핑 (시그모이드 변환)

## 배포 (Vercel)

```bash
git init && git add . && git commit -m "QuantSignal v1.0"
git remote add origin https://github.com/YOUR/quant-signal.git
git push -u origin main
```

Vercel > New Project > GitHub 연결 > Deploy

### 환경변수 (필수)

| 변수 | 설명 |
|------|------|
| `KIS_APP_KEY` | 한국투자증권 APP KEY |
| `KIS_APP_SECRET` | 한국투자증권 APP SECRET |
| `ANTHROPIC_API_KEY` | Claude API 키 (AI 분석용) |

> 환경변수 없으면 데모 모드로 동작

## 로드맵

- [x] Step 1: 규칙 기반 스코어링 + 대시보드
- [ ] Step 2: 종목 상세 (차트 보조)
- [ ] Step 3: XGBoost ML 모델 연동
- [ ] Step 4: 알림 + PWA
