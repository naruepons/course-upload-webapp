// AI course analysis — reads course rationale text and returns:
//  1) Course Understanding Summary
//  2) Evaluation questions built on the CPFTC Master Template
//
// Follows the C.L.E.A.R. brief (Phase 3 + Phase 4).
// Uses the Google Gemini API. Configure via env:
//   GEMINI_API_KEY   get one free at https://aistudio.google.com/apikey
//   GEMINI_MODEL     default: gemini-2.5-pro

const {
  GEMINI_API_KEY,
  GEMINI_MODEL = 'gemini-2.5-pro',
} = process.env;

function llmConfigured() {
  return Boolean(GEMINI_API_KEY);
}

const SYSTEM_PROMPT = `คุณคือผู้ช่วยของ CPF Training Center ทำหน้าที่อ่าน "หลักการและเหตุผล" ของหลักสูตร แล้ว (1) สรุปความเข้าใจหลักสูตร และ (2) สร้างแบบประเมินหลังอบรมตาม Master Template ของ CPFTC

กฎสำคัญ:
- ต้องอิงจากเนื้อหาเอกสารจริงเท่านั้น ห้ามแต่งข้อมูลที่ไม่มีในเอกสาร ถ้าข้อมูลไม่พอให้ใส่ค่าเป็น null หรือ []
- คำถามทุกข้อต้องผูกกับวัตถุประสงค์ เนื้อหา ทักษะ ผลที่คาดว่าจะได้รับ อุปสรรค หรือ support ที่ต้องการ (ไม่เอาคำถาม generic)
- แบบประเมินต้องคงโครง 5 section: Strategic Alignment, Performance & Skills, Deep Dive Insights, Actionable Support, Learner Segment
- ตอบเป็นภาษาไทยในเนื้อหา แต่คีย์ JSON เป็นภาษาอังกฤษตามสคีมา
- ตอบกลับเป็น JSON เท่านั้น ไม่มีข้อความอื่นหุ้ม ไม่ต้องใส่ code fence`;

function buildUserPrompt(courseText, meta = {}) {
  const metaLines = [
    meta.courseName ? `Course name: ${meta.courseName}` : '',
    meta.courseCode ? `Course code: ${meta.courseCode}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return `${metaLines ? metaLines + '\n\n' : ''}ต่อไปนี้คือเนื้อหาเอกสารหลักการและเหตุผลของหลักสูตร:
"""
${courseText.slice(0, 24000)}
"""

โปรดวิเคราะห์และตอบกลับเป็น JSON ตามสคีมานี้ (เท่านั้น):
{
  "course_understanding": {
    "course_goal": "string",
    "target_audience": "string | null",
    "key_learning_objectives": ["string"],
    "key_modules": ["string"],
    "core_skills": ["string"],
    "expected_outcomes": ["string"],
    "risk_or_limitation_topics": ["string"],
    "evaluation_focus": ["string"]
  },
  "evaluation_form": {
    "title": "string",
    "instruction": "string",
    "sections": [
      {
        "section_name": "Strategic Alignment | Performance & Skills | Deep Dive Insights | Actionable Support | Learner Segment",
        "questions": [
          {
            "question_text": "string",
            "question_type": "rating | multiple_choice | open_ended",
            "answer_options": ["string"],
            "linked_to": "objective | module | skill | outcome | barrier | support"
          }
        ]
      }
    ]
  }
}`;
}

async function callGemini(systemPrompt, userPrompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data && data.error ? data.error.message : `HTTP ${res.status}`;
    throw new Error(`Gemini API error: ${detail}`);
  }
  const content =
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts.map((p) => p.text || '').join('');
  if (!content) throw new Error('Gemini API returned no content.');
  return content;
}

async function analyzeCourse(courseText, meta = {}) {
  if (!courseText || courseText.length < 40) {
    throw new Error('Extracted text is too short to analyze (document may be scanned images or empty).');
  }
  if (!llmConfigured()) {
    throw new Error('AI is not configured. Set GEMINI_API_KEY.');
  }

  const raw = await callGemini(SYSTEM_PROMPT, buildUserPrompt(courseText, meta));
  try {
    return JSON.parse(raw);
  } catch {
    // In case the model wraps JSON in text or a code fence, grab the first {...} block.
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Could not parse AI response as JSON.');
  }
}

module.exports = { analyzeCourse, llmConfigured };
