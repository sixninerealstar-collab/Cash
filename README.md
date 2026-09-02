# CLASS FUND — Phase 1 + Phase 2

ระบบจัดการเงินกองกลางห้องเรียน

## Phase 1 — โครงสร้าง, Database, Authentication แบบ 2-Step, Classroom Isolation

- Database schema เต็มรูปแบบ (`supabase/schema.sql`) — ทุกตารางตามสเปค + RLS ทุกตาราง + Seed data 24 คน
- ฟังก์ชันค้นหาแบบปลอดภัย (`supabase/rpc_login.sql`) — ห้ามอ่านตารางตรง ๆ จาก client
- Edge Function `login` (`supabase/functions/login/index.ts`) — ตรวจรหัสครู/เหรัญญิก และยืนยันตัวตนนักเรียน **ฝั่งเซิร์ฟเวอร์เท่านั้น** แล้ว mint session จริงผ่าน Supabase Auth
- Frontend: React + TypeScript + Vite + Tailwind, 2-Step Login (เลือกห้อง → เลือก Role), Persistent Login (Supabase session, ไม่ใช่ password ใน localStorage), Logout พร้อม Confirmation Modal, Dark mode support, PWA manifest

## Phase 2 — Weekly Payment, เช็คเงิน, Fund Balance, Transaction Ledger

- `supabase/rpc_payments.sql` — RPC ทั้งหมดทำงานแบบ **atomic** ด้วย `pg_advisory_xact_lock` ต่อห้องเรียน ป้องกัน race condition จากการกดซ้ำ/เปิดสองแท็บ:
  - `ensure_week_payments` — สร้างแถวสัปดาห์ใหม่ให้นักเรียนทุกคน (idempotent, ไม่ซ้ำ)
  - `record_weekly_payment` — บันทึกจ่ายเงิน 1 รายการ (กันจ่ายซ้ำด้วย `ALREADY_PAID`)
  - `reverse_weekly_payment` — ยกเลิกสถานะจ่าย พร้อม audit log และหักคืนยอด (กันติดลบด้วย `NEGATIVE_BALANCE`)
  - `record_multiple_payments` — จ่ายหลายสัปดาห์พร้อมกัน (สำหรับหน้าค้างจ่าย)
  - `get_fund_summary` — สรุปยอดกองกลาง/เงินเข้า-ออก/จ่ายแล้วกี่คน สำหรับ Dashboard
- หน้า **"เช็คเงิน"** (`/payments`) — เห็นเฉพาะครู/เหรัญญิก เท่านั้น (Route guard คืนข้อความ "คุณไม่มีสิทธิ์เข้าถึงหน้านี้" ให้นักเรียนที่พยายามเปิด URL ตรง ๆ), มี Tab รายสัปดาห์ + ค้างจ่าย, ปุ่ม Disable ระหว่างประมวลผลกันกดซ้ำ, Confirmation Modal ก่อนยกเลิกสถานะจ่าย
- Dashboard นักเรียน (`/`) — เห็นสถานะจ่ายของตัวเองรายสัปดาห์ (✅/❌) และยอดค้าง เท่านั้น (RLS บล็อกไม่ให้เห็นของคนอื่น)
- Dashboard ครู/เหรัญญิก — การ์ดสรุปยอดกองกลาง + ลิงก์ไปหน้าเช็คเงิน

รันเพิ่มหลัง Phase 1: ใน SQL Editor รัน `supabase/rpc_payments.sql` ต่อจาก schema/rpc_login เดิม (ไม่ต้อง redeploy Edge Function)

## ทำไมต้องมี Edge Function แยก

รหัสครู (`THCF`) และเหรัญญิก (`STUCF`) **ไม่ถูกเก็บในตารางที่ client อ่านได้เลย** — เก็บเป็น Secret บน Supabase Edge Function เท่านั้น ป้องกันไม่ให้ใครเปิด DevTools แล้วดึงรหัสออกไปได้ ตรงตามกฎ "Backend ต้องเป็นผู้ตรวจสอบ Permission, ห้ามเชื่อ Role จาก Frontend"

## ขั้นตอน Deploy จริง

1. สร้างโปรเจกต์ที่ https://supabase.com (ฟรี tier ใช้ได้)
2. ใน SQL Editor รันตามลำดับ: `supabase/schema.sql` แล้วค่อย `supabase/rpc_login.sql`
3. ติดตั้ง Supabase CLI แล้ว deploy Edge Function:
   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase secrets set TEACHER_CODE=THCF TREASURER_CODE=STUCF
   supabase functions deploy login
   ```
4. คัดลอก `.env.example` เป็น `.env.local` แล้วใส่ค่า URL / anon key / Edge Function URL จากหน้า Project Settings → API
5. รันเครื่อง dev:
   ```bash
   npm install
   npm run dev
   ```
6. Deploy ขึ้น Vercel/Netlify ตามปกติ (framework: Vite) — อย่าลืมตั้งค่า environment variables 3 ตัวในระบบ deploy ด้วย

## ทดสอบ Login

- ห้องทดสอบที่ seed มาให้: รหัสโรงเรียน `CMC`, ระดับชั้น `มัธยมปลาย`, เลขห้อง `5/1`
- ครู/เหรัญญิก: รหัส `THCF` / `STUCF`
- นักเรียน: พิมพ์ชื่อ เช่น `ธนบดี`

## Roadmap ที่เหลือ (ตามสเปคเดิม)

- **Phase 3** — Withdrawal request, Teacher approval (atomic tx), Reject, Comments, Notifications
- **Phase 4** — Financial history, Audit log UI, Reports, Excel/PDF export
- **Phase 5** — Dashboards + Charts, Global search, QR student, Announcements, Budget
- **Phase 6** — Responsive polish, Mobile nav, Animation pass, Dark mode toggle UI, PWA install prompt
- **Phase 7** — Security audit, bug bash, performance pass

บอกได้เลยว่าอยากให้เริ่ม Phase 3 (ระบบเบิกเงิน + อนุมัติ + Comments + Notifications) ต่อเลยไหมครับ
