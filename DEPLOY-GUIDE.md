# คู่มือ Deploy — Course Upload Web App

สรุปภาพรวมโปรเจกต์ + ขั้นตอน deploy บน Render (อัปเดตล่าสุด: ก.ค. 2026)

---

## 1. โปรเจกต์นี้คืออะไร

เว็บแอปอัปโหลดไฟล์หลักสูตร (Word/PDF) โดย **เก็บไฟล์ไว้ใน GitHub repository โดยตรง ไม่เก็บบนโฮสต์** — ตัวโฮสต์รันแค่เว็บ (stateless) จึงโหลดเร็วและไม่บวมตามจำนวนไฟล์

```
Browser (อัปโหลด)  ──►  Render (Node/Express)  ──►  GitHub repo /uploads
                          (ไม่เขียนไฟล์ลงดิสก์ — buffer ใน memory แล้ว push ต่อ)
```

**ฟีเจอร์:**
- อัปโหลดไฟล์หลักสูตร → commit เข้า GitHub folder `uploads/` (ชื่อไฟล์รองรับภาษาไทย)
- แสดงรายการไฟล์ที่อัปโหลดแล้ว พร้อมลิงก์ไป GitHub
- (ตัวเลือก) วิเคราะห์หลักสูตรด้วย AI ตาม brief C.L.E.A.R. — สรุป Course Understanding + สร้างแบบประเมิน draft ตาม Master Template 5 section

**Tech stack:** Node.js + Express · GitHub Contents API · Azure OpenAI (สำหรับฟีเจอร์ AI)

---

## 2. สถานะปัจจุบัน (ทำอะไรไปแล้ว)

| ขั้นตอน | สถานะ |
|---|---|
| เขียนโค้ดแอป (server, UI, AI analysis) | ✅ เสร็จ ทดสอบผ่าน |
| Push ขึ้น GitHub: `naruepons/course-upload-webapp` | ✅ เสร็จ |
| เพิ่ม `render.yaml` (Blueprint) + ลบ Azure workflow | ✅ เสร็จ |
| Deploy บน Render | 🔄 กำลังทำ — เหลือกรอก env var + กด Deploy |

**หมายเหตุ:** เดิมตั้งใจ deploy บน Azure App Service แต่ subscription ติด **VM quota = 0** สร้างไม่ได้ จึงเปลี่ยนมาใช้ **Render** (ฟรี เชื่อม GitHub ง่าย ไม่ต้องแก้โค้ด)

---

## 3. ขั้นตอน Deploy บน Render

### 3.1 สร้าง GitHub Token (จำเป็น)
แอปต้องใช้ token เพื่อ commit ไฟล์เข้า repo:
1. ไป https://github.com/settings/personal-access-tokens → **Generate new token** (Fine-grained)
2. **Repository access** → Only select repositories → เลือก `course-upload-webapp`
3. **Permissions → Repository → Contents → Read and write**
4. **Generate token** → คัดลอกเก็บไว้ (ขึ้นครั้งเดียว)

### 3.2 Deploy ผ่าน Blueprint
1. https://render.com → login ด้วย GitHub
2. **New +** → **Blueprint** → เลือก repo `course-upload-webapp` → Connect
3. Render อ่าน `render.yaml` แล้วให้กรอกค่า:
   - **Blueprint Name**: `course-upload-webapp`
   - **GITHUB_TOKEN**: วาง token จากข้อ 3.1
   - **UPLOAD_KEY**: เว้นว่าง (หรือใส่รหัสลับกันคนนอกอัปโหลด)
   - **AZURE_OPENAI_ENDPOINT / API_KEY / DEPLOYMENT**: เว้นว่างได้ (ฟีเจอร์ AI จะปิด — เติมทีหลังได้)
4. **Deploy / Apply** → รอ build ~2-3 นาที
5. ได้ URL: `https://course-upload-webapp.onrender.com`

### 3.3 ทดสอบ
เปิด URL → อัปโหลดไฟล์ → เช็คว่าไฟล์ไปโผล่ใน repo โฟลเดอร์ `uploads/`

---

## 4. ตารางค่า Environment Variables

| ตัวแปร | จำเป็น? | ค่า |
|---|---|---|
| `GITHUB_TOKEN` | ✅ | token สิทธิ์ Contents: Read & write |
| `GITHUB_OWNER` | ✅ | `naruepons` (ตั้งไว้ใน render.yaml แล้ว) |
| `GITHUB_REPO` | ✅ | `course-upload-webapp` (ตั้งไว้แล้ว) |
| `GITHUB_BRANCH` | — | `main` (ตั้งไว้แล้ว) |
| `UPLOAD_PATH` | — | `uploads` (ตั้งไว้แล้ว) |
| `MAX_UPLOAD_MB` | — | `25` (ตั้งไว้แล้ว) |
| `UPLOAD_KEY` | — | เว้นว่าง = ใครก็อัปโหลดได้ |
| `AZURE_OPENAI_ENDPOINT` | เฉพาะ AI | `https://xxx.openai.azure.com` |
| `AZURE_OPENAI_API_KEY` | เฉพาะ AI | key จาก Azure OpenAI |
| `AZURE_OPENAI_DEPLOYMENT` | เฉพาะ AI | ชื่อ deployment ของ chat model |

> Render ตั้ง `PORT` ให้อัตโนมัติ — ไม่ต้องกรอกเอง

---

## 5. ข้อควรรู้

- **Free tier หลับ:** ถ้าไม่มีคนใช้ 15 นาที เว็บจะหลับ ครั้งถัดไปโหลด ~30-60 วิ (ครั้งเดียว) จากนั้นเร็วปกติ — สำหรับแบบประเมินหลังอบรมถือว่ารับได้
- **ขนาดไฟล์:** GitHub Contents API เหมาะกับไฟล์ ≤ ~25 MB ต่อไฟล์
- **ความลับข้อมูล:** ตอนนี้ repo เป็น **Public** — ไฟล์ที่อัปโหลดใครก็เห็นได้ ถ้าเป็นข้อมูลภายใน CPF ควรเปลี่ยน repo เป็น **Private** (Settings → General → Danger Zone → Change visibility)
- **`.env` ปลอดภัย:** ถูก `.gitignore` ไว้ ไม่หลุดขึ้น GitHub — บน Render ใส่ค่าเป็น Environment variable แทน
- **แก้โค้ดแล้ว push:** Render จะ auto-deploy ใหม่ทุกครั้งที่ push ขึ้น `main`

---

## 6. รันทดสอบในเครื่อง (ทางเลือก)

```bash
cd course-upload-webapp
npm install
cp .env.example .env      # แก้ค่าในไฟล์
npm start                 # เปิด http://localhost:8080
```

---

## 7. สิ่งที่ยังทำต่อได้ (ตาม brief C.L.E.A.R.)

โปรเจกต์นี้ครอบคลุม Phase 2-4 ของ brief (อัปโหลด → อ่านหลักสูตร → สร้างแบบประเมิน draft) ส่วนที่ยังต่อได้:
- Phase 6-7: สร้าง Google Form + QR Code อัตโนมัติ (ต่อ Google API)
- Phase 8-13: ดึง response หลังอบรม → วิเคราะห์ → สร้าง report + แนะนำหลักสูตรต่อไป (ต่อ n8n / Google Sheets API)

---

**ลิงก์สำคัญ**
- Repo: https://github.com/naruepons/course-upload-webapp
- Render: https://render.com
- GitHub Token: https://github.com/settings/personal-access-tokens
