# Adsyield Programmatic Optimizer - Web Platform

## Context

Mevcut Electron masaustu uygulamasi (React + TypeScript + MUI) web platformuna donusturulecek. Hedef: Adsyield account manager'larinin login yapip real-time performans verileri gorebilecegi, Claude AI ile sohbet edebilecegi, IVT raporlama yapabilecegi kapsamli bir web uygulamasi.

**Mevcut sistem**: 15 sayfa, 13 servis modulu, IndexedDB, manuel CSV upload, AI yok
**Hedef sistem**: Next.js full-stack, Supabase (PostgreSQL + Auth), Limelight API entegrasyonu, Claude AI chat, IVT pixel tracking, Vercel deploy
**Proje konumu**: Yeni klasor (`adsyield-optimizer/`) - mevcut projeye dokunulmaz
**Chat UI**: Her sayfadan erisilebilir floating widget (sag alt kose)
**Data sync**: Gunluk otomatik (06:00 UTC) + manuel "Sync Now" butonu
**Hosting notu**: Adsyield Hostinger kullaniyor. Proje Vercel'de deploy edilip, Hostinger uzerinden link/iframe ile gomulecek.

---

## Tech Stack

| Katman | Teknoloji |
|--------|-----------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript, MUI 5 |
| Backend | Next.js API Routes + Server Actions |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth (email/password) |
| AI | Anthropic Claude API (streaming) |
| Data Source | Limelight Stats API (REST) |
| IVT | Custom pixel endpoint + analiz kurallari |
| Deploy | Vercel (frontend + API) + Supabase (DB) |
| State Management | TanStack Query (React Query) |

---

## Veritabani Semasi (Supabase PostgreSQL)

### Core Tables

```sql
-- Limelight'tan cekilen ham veri
CREATE TABLE limelight_stats (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  demand_partner_name TEXT,
  supply_partner_name TEXT,
  publisher TEXT,
  bundle TEXT,
  ad_unit_type TEXT,
  channel_type TEXT,
  os TEXT,
  country TEXT,
  opportunities INTEGER DEFAULT 0,
  bid_requests INTEGER DEFAULT 0,
  bids INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  pub_payout DECIMAL(12,4) DEFAULT 0,
  demand_payout DECIMAL(12,4) DEFAULT 0,
  demand_service_fee DECIMAL(12,4) DEFAULT 0,
  bid_response_timeouts INTEGER DEFAULT 0,
  bid_response_errors INTEGER DEFAULT 0,
  -- Hesaplanan metrikler
  ecpm DECIMAL(10,4) GENERATED ALWAYS AS (
    CASE WHEN impressions > 0 THEN (demand_payout / impressions) * 1000 ELSE 0 END
  ) STORED,
  fill_rate DECIMAL(6,2) GENERATED ALWAYS AS (
    CASE WHEN bid_requests > 0 THEN (impressions::DECIMAL / bid_requests) * 100 ELSE 0 END
  ) STORED,
  timeout_rate DECIMAL(6,2) GENERATED ALWAYS AS (
    CASE WHEN bid_requests > 0 THEN (bid_response_timeouts::DECIMAL / bid_requests) * 100 ELSE 0 END
  ) STORED,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, demand_partner_name, supply_partner_name, publisher, bundle, os, country)
);

CREATE INDEX idx_stats_date ON limelight_stats(date);
CREATE INDEX idx_stats_demand ON limelight_stats(demand_partner_name);
CREATE INDEX idx_stats_supply ON limelight_stats(supply_partner_name);
CREATE INDEX idx_stats_bundle ON limelight_stats(bundle);
CREATE INDEX idx_stats_date_demand ON limelight_stats(date, demand_partner_name);

-- IVT pixel verileri
CREATE TABLE ivt_impressions (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  pub_id TEXT,
  bundle TEXT,
  ifa TEXT,
  ip INET,
  user_agent TEXT,
  device_make TEXT,
  device_model TEXT,
  os TEXT,
  os_version TEXT,
  creative_id TEXT,
  origin_ssp_pub_id TEXT,
  lat DECIMAL(9,6),
  lon DECIMAL(9,6),
  imp_id TEXT UNIQUE,
  -- IVT analiz sonuclari
  is_suspicious BOOLEAN DEFAULT FALSE,
  ivt_reasons TEXT[] DEFAULT '{}',
  ivt_score INTEGER DEFAULT 0,
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ivt_timestamp ON ivt_impressions(timestamp);
CREATE INDEX idx_ivt_ip ON ivt_impressions(ip);
CREATE INDEX idx_ivt_ifa ON ivt_impressions(ifa);
CREATE INDEX idx_ivt_bundle ON ivt_impressions(bundle);
CREATE INDEX idx_ivt_suspicious ON ivt_impressions(is_suspicious);

-- IVT kural tabanli analiz icin aggregate table
CREATE TABLE ivt_ip_frequency (
  ip INET PRIMARY KEY,
  impression_count INTEGER DEFAULT 0,
  unique_bundles INTEGER DEFAULT 0,
  unique_devices INTEGER DEFAULT 0,
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  is_flagged BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- App-ads.txt tracking
CREATE TABLE publisher_domains (
  id SERIAL PRIMARY KEY,
  domain TEXT UNIQUE NOT NULL,
  url TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  last_checked TIMESTAMPTZ,
  added_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE app_ads_txt_results (
  id SERIAL PRIMARY KEY,
  domain_id INTEGER REFERENCES publisher_domains(id),
  search_line TEXT NOT NULL,
  found BOOLEAN NOT NULL,
  content TEXT,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE app_ads_txt_search_history (
  id SERIAL PRIMARY KEY,
  search_line TEXT NOT NULL,
  total_publishers INTEGER,
  found_count INTEGER,
  duration_ms INTEGER,
  searched_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Chat
CREATE TABLE chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alertler ve task'lar
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('performance', 'revenue', 'technical', 'quality')),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  metric TEXT NOT NULL,
  threshold DECIMAL,
  current_value DECIMAL,
  previous_value DECIMAL,
  change_pct DECIMAL,
  message TEXT NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE optimization_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  priority TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  impact TEXT,
  estimated_revenue DECIMAL,
  effort TEXT,
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in-progress', 'completed')),
  actions TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Data sync log
CREATE TABLE sync_logs (
  id SERIAL PRIMARY KEY,
  sync_type TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  rows_synced INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

---

## Proje Dosya Yapisi

```
adsyield-optimizer/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout (theme, auth provider)
│   │   ├── page.tsx                  # Redirect to /dashboard
│   │   ├── login/
│   │   │   └── page.tsx              # Login sayfasi
│   │   ├── (dashboard)/              # Auth-protected layout group
│   │   │   ├── layout.tsx            # Sidebar + main content layout
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx          # Ana dashboard
│   │   │   ├── supply-demand/
│   │   │   │   └── page.tsx
│   │   │   ├── ad-size/
│   │   │   │   └── page.tsx
│   │   │   ├── timeout/
│   │   │   │   └── page.tsx
│   │   │   ├── bundles/
│   │   │   │   └── page.tsx
│   │   │   ├── tasks/
│   │   │   │   └── page.tsx
│   │   │   ├── recommendations/
│   │   │   │   └── page.tsx
│   │   │   ├── supply-quality/
│   │   │   │   └── page.tsx
│   │   │   ├── creative-performance/
│   │   │   │   └── page.tsx
│   │   │   ├── filter-analysis/
│   │   │   │   └── page.tsx
│   │   │   ├── alerts/
│   │   │   │   └── page.tsx
│   │   │   ├── demand-appetite/
│   │   │   │   └── page.tsx
│   │   │   ├── revenue-concentration/
│   │   │   │   └── page.tsx
│   │   │   ├── app-ads-txt/
│   │   │   │   └── page.tsx
│   │   │   ├── ivt/                  # YENi
│   │   │   │   └── page.tsx          # IVT raporlama dashboard
│   │   │   └── chat/                 # YENi (tam ekran fallback)
│   │   │       └── page.tsx          # AI Chat tam sayfa (opsiyonel)
│   │   ├── admin/                    # Admin paneli (sadece admin rolu)
│   │   │   ├── layout.tsx            # Admin layout + rol kontrolu
│   │   │   └── users/
│   │   │       └── page.tsx          # Kullanici yonetimi sayfasi
│   │   └── api/                      # API Routes
│   │       ├── auth/
│   │       │   └── [...supabase]/route.ts
│   │       ├── limelight/
│   │       │   ├── sync/route.ts     # Cron: veri senkronizasyonu
│   │       │   └── query/route.ts    # On-demand Limelight sorgusu
│   │       ├── stats/
│   │       │   ├── dashboard/route.ts
│   │       │   ├── partners/route.ts
│   │       │   ├── bundles/route.ts
│   │       │   ├── ad-sizes/route.ts
│   │       │   └── [dimension]/route.ts
│   │       ├── analysis/
│   │       │   ├── recommendations/route.ts
│   │       │   ├── opportunities/route.ts
│   │       │   ├── quality/route.ts
│   │       │   └── comprehensive/route.ts
│   │       ├── ivt/
│   │       │   ├── pixel/route.ts    # Pixel endpoint (GET, lightweight)
│   │       │   ├── report/route.ts   # IVT raporlari
│   │       │   └── analyze/route.ts  # IVT analiz trigger
│   │       ├── chat/
│   │       │   ├── route.ts          # Claude AI chat (streaming)
│   │       │   └── history/route.ts  # Chat gecmisi
│   │       ├── app-ads-txt/
│   │       │   ├── search/route.ts
│   │       │   ├── publishers/route.ts
│   │       │   └── history/route.ts
│   │       └── alerts/
│   │           └── route.ts
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx           # Mevcut sidebar (migrate)
│   │   │   ├── TopBar.tsx            # Ust bar (user menu, sync status)
│   │   │   └── FloatingChat.tsx      # Floating chat widget (tum sayfalarda)
│   │   ├── dashboard/                # Dashboard-specific components
│   │   ├── chat/
│   │   │   ├── ChatWindow.tsx        # Ana chat penceresi (panel)
│   │   │   ├── MessageBubble.tsx     # Mesaj balonu
│   │   │   ├── ChatInput.tsx         # Mesaj girisi
│   │   │   └── ConversationList.tsx  # Gecmis konusmalar
│   │   ├── ivt/
│   │   │   ├── IVTSummary.tsx
│   │   │   ├── IVTTable.tsx
│   │   │   └── IVTChart.tsx
│   │   └── shared/
│   │       ├── MetricCard.tsx
│   │       ├── DataTable.tsx
│   │       └── DateRangePicker.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts             # Browser supabase client
│   │   │   ├── server.ts             # Server supabase client
│   │   │   └── middleware.ts          # Auth middleware
│   │   ├── limelight/
│   │   │   ├── client.ts             # Limelight API client
│   │   │   └── transformer.ts        # API response -> DB format mapper
│   │   ├── claude/
│   │   │   ├── client.ts             # Claude API client
│   │   │   └── prompts.ts            # System prompts & context builder
│   │   └── ivt/
│   │       ├── analyzer.ts           # IVT kural motoru
│   │       └── rules.ts              # IVT kurallari tanimlamalari
│   ├── services/                     # Mevcut servisler (migrate)
│   │   ├── analysisEngine.ts
│   │   ├── recommendationsEngine.ts
│   │   ├── supplyQualityScorer.ts
│   │   ├── creativePerformanceAnalyzer.ts
│   │   ├── filterReasonAnalyzer.ts
│   │   ├── demandAppetiteAnalyzer.ts
│   │   ├── revenueConcentrationAnalyzer.ts
│   │   └── alertSystem.ts
│   ├── types/
│   │   └── index.ts                  # Mevcut tipler + yeni tipler
│   └── hooks/
│       ├── useStats.ts               # TanStack Query hooks
│       ├── useChat.ts
│       └── useIVT.ts
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── .env.local                        # API keys (GITIGNORE!)
├── next.config.js
├── package.json
├── tsconfig.json
├── vercel.json                       # Cron jobs config
└── middleware.ts                     # Auth middleware
```

---

## Limelight API Entegrasyonu

### Veri Cekme Stratejisi

```
API: http://stats.project-limelight.com/v1/stats
Auth: clientKey + secretKey (env vars)
Output: JSON
```

**Cron Job (Vercel Cron)** - Gunluk otomatik senkronizasyon:
- Her gun 06:00 UTC'de onceki gunun verisini cek
- Dimension breakdown: DATE, DEMAND_PARTNER_NAME, SUPPLY_PARTNER_NAME, PUBLISHER, OS, COUNTRY
- Tum metrikleri cek: OPPORTUNITIES, BID_REQUESTS, BIDS, WINS, IMPRESSIONS, PUB_PAYOUT, DEMAND_PAYOUT, DEMAND_SERVICE_FEE_PAYOUT, BID_RESPONSE_TIMEOUTS, BID_RESPONSE_ERRORS
- UPSERT ile veritabanina kaydet (duplicate'leri guncelle)
- Sync log tablosuna kayit yaz

**On-Demand Refresh** - UI'dan manuel tetikleme:
- Dashboard'da "Sync Now" butonu
- Kullanici istenen tarih araligini secer
- Background'da API cagrisi yapar, UI'da progress gosterir

**Ilk Kurulum**: Son 30 gunluk veriyi topluca cek

### Limelight Client (`lib/limelight/client.ts`)

```typescript
// Temel API cagrisi
async function fetchLimelightStats(params: {
  startDate: string;  // YYYY-MM-DD
  endDate: string;
  dimensions: string[];
  metrics: string[];
}): Promise<LimelightResponse[]>

// Gunluk sync
async function syncDailyStats(date: string): Promise<number>

// Tarih araligi sync
async function syncDateRange(start: string, end: string): Promise<number>
```

### Vercel Cron Config (`vercel.json`)

```json
{
  "crons": [
    {
      "path": "/api/limelight/sync",
      "schedule": "0 6 * * *"
    }
  ]
}
```

---

## Claude AI Chat Sistemi

### Mimari

1. Kullanici mesaj yazar
2. Server Action / API Route tetiklenir
3. Veritabanindan ilgili performans verisi cekilir (son 7 gun ozet)
4. Claude API'ye sistem prompt + veri context + kullanici mesaji gonderilir
5. Streaming response ile gercek zamanli yanit doner
6. Mesajlar `chat_messages` tablosuna kaydedilir

### System Prompt Yapisi (`lib/claude/prompts.ts`)

```
Sen Adsyield'in programmatic reklam optimizasyon asistanisin.

Gorevlerin:
- Performans verilerini analiz etmek ve icerik saglamak
- Optimizasyon onerileri vermek (bid floor, partner, bundle, ad size)
- Programmatic reklam stratejileri hakkinda danismanlik
- Raporlama ve trend analizi destegi

Mevcut Performans Ozeti:
{dinamik_veri_context}

Kurallar:
- Turkce ve Ingilizce yanit verebilirsin
- Somut, veri odakli oneriler ver
- Her oneride tahmini etki belirt
- Sistemde degisiklik yapamazsin, sadece oneri verebilirsin
```

### Context Builder

Her mesajda Claude'a gonderilecek veri context:
- Son 7 gunun toplam metrikleri (revenue, impressions, eCPM, fill rate)
- En iyi ve en kotu performans gosteren 5 partner
- Aktif alert sayisi ve kritik olanlar
- En buyuk 3 revenue opportunity
- Trend bilgisi (onceki 7 gune gore degisim)

### Streaming Implementation

- Next.js Route Handler ile `ReadableStream` kullanarak streaming
- Anthropic SDK'nin `stream` ozelligini kullan
- Frontend'de `useChat` hook'u ile real-time render

---

## IVT (Invalid Traffic) Pixel Tracking

### Pixel Endpoint (`/api/ivt/pixel`)

Limelight su URL'ye pixel atar:
```
https://app.adsyield.com/api/ivt/pixel?timestamp=%%timestamp%%&pubId=%%pubId%%&bundle=%%bundle%%&ifa=%%ifa%%&ip=%%ip%%&userAgent=%%userAgent%%&deviceMake=%%deviceMake%%&deviceModel=%%deviceModel%%&os=%%os%%&osv=%%osv%%&creativeId=%%creativeId%%&originSspPubId=%%originSspPubId%%&lat=%%lat%%&lon=%%lon%%&impId=%%impId%%
```

**Endpoint ozellikleri:**
- GET request (pixel fire)
- 1x1 seffaf GIF dondurur
- Minimal islem suresi (veriyi kaydet, analizi sonra yap)
- Rate limiting uygula
- Vercel Edge Function olarak deploy (dusuk latency)

### Temel IVT Kurallari (`lib/ivt/rules.ts`)

1. **IP Frequency**: Ayni IP'den 1 saat icinde >100 impression → suspicious
2. **Bot Detection**: Bilinen bot user-agent listesi kontrolu (IAB bots list)
3. **Geo Mismatch**: IP lokasyonu ile raporlanan lat/lon arasinda buyuk fark
4. **Device Fingerprint**: Ayni IFA'dan farkli device make/model gelirse
5. **Timestamp Anomaly**: Cok kisa araliklarla (<1sn) ayni kaynaktan impression
6. **Data Center IP**: Bilinen data center IP araliklari kontrolu

### IVT Dashboard

- Toplam impression vs suspicious impression orani
- Gunluk IVT trend grafigi
- En cok flag alan publisher/bundle/IP listesi
- IVT sebep dagilimi (pie chart)
- Detayli tablo: filtrelenebilir, aranabilir

### IVT Analiz Pipeline

```
Pixel fire → Edge Function → ivt_impressions INSERT
                                    ↓
                        Batch Analiz (her 5dk cron veya pg_cron)
                                    ↓
                        IVT kurallarini calistir
                                    ↓
                        is_suspicious + ivt_reasons guncelle
                                    ↓
                        ivt_ip_frequency tablosunu guncelle
```

---

## Authentication & Admin Paneli

- Supabase Auth ile email/password login
- 2 rol: **Admin** (siz) ve **Account Manager** (calisanlar)
- Middleware ile tum `/dashboard/*` route'lari koruma altina al
- Login sayfasi: `/login`
- Session yonetimi: Supabase otomatik refresh token

### Admin Sayfasi (`/admin/users`)
- Sadece Admin rolu erisebilir
- Kullanici listesi (email, rol, son giris tarihi, durum)
- Yeni kullanici ekle (email + gecici sifre ile davet gonder)
- Kullanici deaktif et / aktif et
- Sifre sifirlama linki gonder
- Supabase Auth API uzerinden calisan basit bir sayfa (Payload CMS gerekmez)

---

## Mevcut Kodun Migrasyonu

### Dogrudan Tasinacak Servisler (minimal degisiklik)

Bu dosyalar isletme mantigi icerdigi icin neredeyse oldugu gibi tasinacak:
- `analysisEngine.ts` → `src/services/analysisEngine.ts`
- `recommendationsEngine.ts` → `src/services/recommendationsEngine.ts`
- `supplyQualityScorer.ts` → `src/services/supplyQualityScorer.ts`
- `creativePerformanceAnalyzer.ts` → `src/services/creativePerformanceAnalyzer.ts`
- `filterReasonAnalyzer.ts` → `src/services/filterReasonAnalyzer.ts`
- `demandAppetiteAnalyzer.ts` → `src/services/demandAppetiteAnalyzer.ts`
- `revenueConcentrationAnalyzer.ts` → `src/services/revenueConcentrationAnalyzer.ts`
- `alertSystem.ts` → `src/services/alertSystem.ts`

**Degisiklik**: Input parametresi olarak `SupplyDemandData[]` yerine Supabase'den gelen veriyi alacak sekilde tip donusumu gerekecek. Limelight API response formatini mevcut `SupplyDemandData` tipine map eden bir transformer yazilacak.

### Donusturulecek Katmanlar

| Mevcut | Yeni | Degisiklik |
|--------|------|------------|
| `database.ts` (IndexedDB) | Supabase PostgreSQL queries | Tamamen yeniden yazilacak |
| `fileParser.ts` (CSV upload) | `lib/limelight/transformer.ts` | API response mapping'e donusecek |
| `App.tsx` (React Router) | Next.js App Router | File-based routing'e gecis |
| `Sidebar.tsx` | `components/layout/Sidebar.tsx` | Ayni tasarim, Next.js Link'lere gecis |
| `types/index.ts` | `types/index.ts` | Yeni tipler eklenecek (IVT, Chat, Limelight) |
| Her page component | `app/(dashboard)/*/page.tsx` | Props yerine React Query ile veri cekme |

### Sayfa Migrasyonu Stratejisi

Her sayfa icin:
1. Mevcut JSX yapisini koru (MUI componentleri ayni)
2. `props` yerine `useQuery` hook'lari ile veri cekme
3. API route'dan veri dondur
4. Server Component olabilenler SC yap, interaktif olanlar Client Component

---

## Sizden Gerekecek Bilgiler (Her Faz Icin)

| Faz | Sizden Ne Lazim | Aciklama |
|-----|-----------------|----------|
| Faz 1 | Supabase Project URL, Anon Key, Service Role Key | Supabase dashboard > Settings > API sayfasindan |
| Faz 1 | Anthropic API Key | console.anthropic.com'dan |
| Faz 2 | Limelight client key + secret key | Zaten paylasildi, .env dosyasina koyulacak |
| Faz 4 | Chat icin ozel istekler varsa | AI'in hangi dilde konusmasi, ozel kurallar |
| Faz 5 | Limelight'a pixel URL tanimlamasi | Deploy sonrasi URL'yi Limelight'a iletmeniz gerekecek |
| Faz 6 | Publisher domain listesi | Mevcut projeden otomatik alinacak (147 domain) |
| Son | Vercel'de deploy | `vercel` komutu ile veya GitHub baglantisi ile |

---

## Uygulama Fazlari

### Faz 1: Temel Altyapi
**Sizden gereken**: Supabase key'leri + Anthropic API key
- [ ] Next.js projesi olustur (`npx create-next-app`)
- [ ] Supabase baglantisi kur, DB schema'yi migrate et
- [ ] Auth sistemi (login/logout sayfasi)
- [ ] Admin paneli (kullanici ekle/sil/deaktif et)
- [ ] Layout: Sidebar + TopBar + protected routes
- [ ] Environment variables (.env.local dosyasina key'leri yaz)
- [ ] Temel tema (dark mode, MUI config)

### Faz 2: Limelight Entegrasyonu
**Sizden gereken**: Limelight key'leri (zaten paylasildi)
- [ ] Limelight API client (`lib/limelight/client.ts`)
- [ ] Data transformer (`lib/limelight/transformer.ts`)
- [ ] Sync API route (`/api/limelight/sync`)
- [ ] On-demand query route (`/api/limelight/query`)
- [ ] Vercel cron job config
- [ ] Sync status UI (TopBar'da "Sync Now" butonu)
- [ ] Ilk 30 gunluk veriyi topluca cekme

### Faz 3: Dashboard & Analiz Sayfalari (15 sayfa)
**Sizden gereken**: Yok (mevcut koddan migrate edilecek)
- [ ] Dashboard sayfasi (ana metrikler, KPI kartlari)
- [ ] Supply Demand sayfasi
- [ ] Ad Size Analysis
- [ ] Timeout Analysis
- [ ] Bundle Analytics
- [ ] Recommendations (AI destekli olacak)
- [ ] Supply Quality
- [ ] Alerts Dashboard
- [ ] Task Manager
- [ ] Creative Performance
- [ ] Filter Analysis
- [ ] Demand Appetite
- [ ] Revenue Concentration

### Faz 4: Claude AI Chat (Floating Widget)
**Sizden gereken**: Chat davranisi hakkinda ozel istekler
- [ ] Claude API client (`lib/claude/client.ts`)
- [ ] System prompt & context builder (performans verisi enjeksiyonu)
- [ ] Chat API route (streaming yanitlar)
- [ ] Floating chat widget (sag alt kose, tum sayfalarda)
- [ ] Chat penceresi (mesaj balonu, input, gecmis)
- [ ] Konusma gecmisi kaydetme
- [ ] Veri context injection (her mesajda son 7 gun ozeti)

### Faz 5: IVT Pixel Tracking
**Sizden gereken**: Deploy sonrasi pixel URL'yi Limelight'a iletme
- [ ] Pixel endpoint (Edge Function - dusuk latency)
- [ ] IVT kural motoru (IP frequency, bot detection, geo mismatch)
- [ ] Batch analiz pipeline (periyodik)
- [ ] IVT dashboard sayfasi (grafikler, tablolar)
- [ ] Raporlama ve filtreleme

### Faz 6: App-Ads.txt
**Sizden gereken**: Yok (mevcut koddan migrate edilecek)
- [ ] Publisher domain yonetimi
- [ ] App-ads.txt arama motoru (server-side)
- [ ] Arama gecmisi
- [ ] UI migrasyonu

---

## Kritik Dosyalar (Mevcut Proje)

Migrasyon sirasinda referans alinacak dosyalar:

- `src/renderer/types/index.ts` - 329 satir, 28 interface. Tum type sistemi.
- `src/renderer/services/analysisEngine.ts` - 515 satir. Merkezi analiz orkestratoru.
- `src/renderer/services/recommendationsEngine.ts` - 358 satir. Oneri motoru.
- `src/renderer/services/database.ts` - 370 satir. IndexedDB sema ve sorgular.
- `src/renderer/services/fileParser.ts` - Limelight kolon mapping mantigi.
- `src/App.tsx` - Route yapisi ve veri akisi.
- `src/renderer/components/Sidebar.tsx` - Navigasyon yapisi.

---

## Environment Variables (.env.local)

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Limelight
LIMELIGHT_CLIENT_KEY=
LIMELIGHT_SECRET_KEY=
LIMELIGHT_API_URL=http://stats.project-limelight.com/v1/stats

# Claude
ANTHROPIC_API_KEY=

# App
NEXT_PUBLIC_APP_URL=

# Cron secret
CRON_SECRET=
```

---

## Dogrulama / Test

1. **Auth**: Login/logout akisi, korunmus sayfalara erisim kontrolu
2. **Limelight Sync**: API'den veri cekme, DB'ye kayit, cron calismasi
3. **Dashboard**: Metriklerin dogru hesaplanmasi, mevcut analiz motorlariyla uyum
4. **AI Chat**: Streaming yanit, veri context'in dogru enjekte edilmesi
5. **IVT**: Pixel endpoint'in dogru kayit yapmasi, IVT kurallarinin calismasi
6. **App-ads.txt**: Domain tarama, sonuc gosterimi
7. **Genel**: Tum sayfalarda veri yuklenmesi, responsive tasarim, hata yonetimi
