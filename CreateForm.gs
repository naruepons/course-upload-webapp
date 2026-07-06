/**
 * CPFTC — สร้าง Google Form จากแบบประเมินที่ Approve แล้ว
 *
 * วิธีติดตั้ง (ทำครั้งเดียว):
 * 1. ไปที่ https://script.google.com → New project
 * 2. ลบโค้ดเดิม แล้ววางโค้ดไฟล์นี้ทั้งหมด → กด Save (ตั้งชื่อ เช่น "CPFTC Form Creator")
 * 3. กด Deploy → New deployment → เลือกประเภท "Web app"
 *    - Execute as: **Me** (ฟอร์มจะถูกสร้างใน Google Drive ของคุณ)
 *    - Who has access: **Anyone**
 * 4. กด Deploy → อนุญาตสิทธิ์ (Authorize) → คัดลอก "Web app URL" (ลงท้าย /exec)
 * 5. นำ URL ไปใส่ใน Render → Environment → ตัวแปร GAS_WEBAPP_URL → Save
 *
 * หมายเหตุ: ถ้าแก้โค้ดภายหลัง ต้อง Deploy → Manage deployments → Edit → New version
 */

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    let title = data.title || 'แบบประเมินหลังการอบรม';
    if (data.courseCode) title += ' [' + data.courseCode + ']';

    const form = FormApp.create(title);
    const descParts = [];
    if (data.courseName) descParts.push('หลักสูตร: ' + data.courseName + (data.courseCode ? ' (' + data.courseCode + ')' : ''));
    if (data.instruction) descParts.push(data.instruction);
    if (descParts.length) form.setDescription(descParts.join('\n'));

    (data.sections || []).forEach(function (sec, i) {
      form.addSectionHeaderItem().setTitle('ส่วนที่ ' + (i + 1) + ': ' + (sec.section_name || ''));
      (sec.questions || []).forEach(function (q) {
        const text = q.question_text || '';
        if (!text) return;
        if (q.question_type === 'rating') {
          form.addScaleItem().setTitle(text).setBounds(1, 5).setLabels('น้อยที่สุด', 'มากที่สุด');
        } else if (q.question_type === 'multiple_choice' && q.answer_options && q.answer_options.length) {
          form.addMultipleChoiceItem().setTitle(text).setChoiceValues(q.answer_options);
        } else {
          form.addParagraphTextItem().setTitle(text);
        }
      });
    });

    return ContentService
      .createTextOutput(JSON.stringify({
        ok: true,
        formId: form.getId(),
        editUrl: form.getEditUrl(),
        publishedUrl: form.getPublishedUrl(),
      }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// สำหรับทดสอบว่า deploy สำเร็จ — เปิด URL ในเบราว์เซอร์แล้วต้องเห็นข้อความนี้
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: 'CPFTC Form Creator', usage: 'POST JSON to create a Google Form' }))
    .setMimeType(ContentService.MimeType.JSON);
}
