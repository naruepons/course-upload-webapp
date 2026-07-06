# Course Upload Web App

เว็บแอปสำหรับอัปโหลดไฟล์หลักสูตร (Word/PDF) โดย **จัดเก็บไฟล์ไว้ใน GitHub repository โดยตรง ไม่เก็บบน Azure** — Azure ทำหน้าที่แค่รันเว็บ (stateless) เว็บจึงโหลดเร็วและไม่บวมตามจำนวนไฟล์

Node.js + Express · เก็บไฟล์ผ่าน GitHub Contents API · deploy บน Azure App Service

---

## สถาปัตยกรรมโดยย่อ

```
Browser (upload)  ──►  Azure App Service (Express)  ──►  GitHub repo /uploads
                          (ไม่เขียนไฟล์ลงดิสก์ Azure — buffer ใน memory แล้ว push ต่อ)
```

ไฟล์ที่อัปโหลดจะถูก commit เข้า folder `uploads/` ใน repo ที่กำหนด ชื่อไฟล์เป็น `<timestamp>-<ชื่อเดิม>` (รองรับภาษาไทย)

> **ทำไม token อยู่ฝั่ง server:** GitHub token ต้องเก็บใน backend เท่านั้น ห้ามใส่ในหน้าเว็บ (จะรั่ว) — ดังนั้นจึงต้องมี Express server รับ upload แล้วค่อย push

---

## 1. รันบนเครื่อง (Local)

ต้องมี Node.js 18 ขึ้นไป

```bash
cd course-upload-webapp
npm install
cp .env.example .env      # แล้วแก้ค่าในไฟล์ .env
npm start
```

เปิด http://localhost:8080

### ค่าใน `.env`

| ตัวแปร | ความหมาย |
|---|---|
| `GITHUB_TOKEN` | Personal Access Token ที่มีสิทธิ์ **Contents: Read and write** บน repo เป้าหมาย |
| `GITHUB_OWNER` | ชื่อ user หรือ org เจ้าของ repo |
| `GITHUB_REPO` | ชื่อ repo ที่ใช้เก็บไฟล์ |
| `GITHUB_BRANCH` | branch ปลายทาง (ค่าเริ่มต้น `main`) |
| `UPLOAD_PATH` | โฟลเดอร์ใน repo (ค่าเริ่มต้น `uploads`) |
| `MAX_UPLOAD_MB` | ขนาดไฟล์สูงสุด (แนะนำ ≤ 25 สำหรับ Contents API) |
| `UPLOAD_KEY` | (ตัวเลือก) รหัสลับกันคนนอก upload — ถ้าตั้งไว้ browser ต้องส่ง header `x-upload-key` |
| `PORT` | พอร์ต (Azure ตั้งให้อัตโนมัติ) |

### สร้าง GitHub Token
GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens**
→ เลือก repo เป้าหมาย → Permissions → **Contents: Read and write** → สร้างแล้วคัดลอกมาใส่ `GITHUB_TOKEN`

---

## 2. Push ขึ้น GitHub

```bash
cd course-upload-webapp
git init
git add .
git commit -m "Initial commit: course upload web app"
git branch -M main
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

> ไฟล์ `.env` ถูก ignore ไว้แล้ว — จะไม่ถูก push (ปลอดภัย)

คุณสามารถใช้ repo เดียวกันนี้เก็บทั้งโค้ดและไฟล์ที่อัปโหลด หรือแยก repo สำหรับเก็บไฟล์ก็ได้ (แนะนำแยก ถ้าไฟล์เยอะ)

---

## 3. Deploy บน Azure App Service

### วิธี A — ผ่าน GitHub Actions (แนะนำ)
1. สร้าง Web App บน Azure: **Runtime = Node 20 LTS, OS = Linux**
2. ในไฟล์ `.github/workflows/azure-deploy.yml` แก้ `AZURE_WEBAPP_NAME` เป็นชื่อ Web App ของคุณ
3. Azure Portal → Web App → **Deployment Center → Manage publish profile → Download**
4. GitHub repo → **Settings → Secrets and variables → Actions** → เพิ่ม secret ชื่อ `AZURE_WEBAPP_PUBLISH_PROFILE` วางเนื้อหา publish profile ที่ดาวน์โหลดมา
5. push ขึ้น `main` → GitHub Actions จะ deploy ให้อัตโนมัติ

### วิธี B — เชื่อม Azure กับ GitHub โดยตรง
Azure Portal → Web App → **Deployment Center** → เลือก Source = GitHub → เลือก repo/branch → Save (Azure จะสร้าง workflow ให้เอง)

### ตั้งค่า Environment Variables บน Azure
Web App → **Settings → Environment variables (Application settings)** เพิ่มค่าเหมือนใน `.env`:

```
GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH,
UPLOAD_PATH, MAX_UPLOAD_MB, UPLOAD_KEY
```

> **สำคัญ:** อย่าใส่ `GITHUB_TOKEN` ในโค้ดหรือ push ขึ้น GitHub — ใส่เป็น Environment variable บน Azure เท่านั้น

Azure จะรัน `npm start` ให้อัตโนมัติ และตั้งค่า `PORT` เอง

---

## ฟีเจอร์ AI วิเคราะห์หลักสูตร (ตาม brief C.L.E.A.R.)

เมื่อตั้งค่า Azure OpenAI แล้ว จะมีปุ่ม **"วิเคราะห์ด้วย AI"** ระบบจะ:
1. อ่านไฟล์ (PDF / DOCX / TXT) และสกัดข้อความ
2. สรุป **Course Understanding** (Course goal, objectives, modules, skills, outcomes, risks, evaluation focus)
3. สร้าง **แบบประเมิน draft** ตาม Master Template 5 section (Strategic Alignment / Performance & Skills / Deep Dive Insights / Actionable Support / Learner Segment)

> ผลที่ได้เป็น **draft** ตาม Rule 4 ของ brief — ต้องผ่าน Human Review ก่อนนำไปสร้าง Google Form

ตั้งค่าใน `.env` (หรือ Environment variables บน Azure):
```
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_DEPLOYMENT=your-chat-deployment-name
AZURE_OPENAI_API_VERSION=2024-06-01
```
ถ้าไม่ตั้งค่า → ปุ่มอัปโหลดและรายการไฟล์ยังใช้ได้ปกติ แค่ปิดการวิเคราะห์ AI

> หมายเหตุ: ไฟล์ PDF ที่เป็นภาพสแกน (ไม่มี text layer) จะสกัดข้อความไม่ได้ ต้องทำ OCR ก่อน

## API

| Method | Endpoint | รายละเอียด |
|---|---|---|
| `GET` | `/api/health` | เช็คสถานะ + การตั้งค่า GitHub / AI |
| `GET` | `/api/files` | รายการไฟล์ที่อัปโหลดแล้วใน repo |
| `POST` | `/api/upload` | อัปโหลดไฟล์ (multipart, field ชื่อ `file`; optional `courseName`, `courseCode`) |
| `POST` | `/api/analyze` | วิเคราะห์หลักสูตร — ส่งไฟล์ (`file`) หรือ JSON `{ repoPath }` ของไฟล์ที่อัปโหลดแล้ว |

ตัวอย่างผลลัพธ์ upload สำเร็จ:
```json
{
  "ok": true,
  "originalName": "AI-for-Leader.pdf",
  "repoPath": "uploads/2025-10-16T...-AI-for-Leader.pdf",
  "htmlUrl": "https://github.com/owner/repo/blob/main/uploads/...",
  "commitSha": "abc123..."
}
```

---

## ข้อจำกัดที่ควรรู้
- GitHub Contents API เหมาะกับไฟล์ **ไม่เกิน ~25 MB** ต่อไฟล์ (ฮาร์ดลิมิต 100 MB) — ถ้าไฟล์ใหญ่มากควรพิจารณา Git LFS หรือ storage อื่น
- เก็บไฟล์ใน repo เป็น public/private ตามการตั้งค่า repo — ถ้าไฟล์เป็นความลับ ให้ใช้ **private repo**
- แต่ละ upload = 1 commit ถ้าอัปโหลดถี่มากจะมี commit เยอะใน history (ปกติสำหรับ use case นี้)
