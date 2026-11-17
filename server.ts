import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

function getGenAIClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const SIBELIUS_SYSTEM_INSTRUCTION = `Sen "Sibelius Soru Asistanı"sın. Görevin yalnızca sana verilen canlı veritabanı özetine (snapshot) dayanarak ekip üyelerinin öğrenci sayıları, devamsızlıklar, dersler ve eğitmen yoklamaları hakkındaki basit sorularını yanıtlamaktır.

Kurallar:
1. Cevapların ÇOK KISA, ÖZ ve DOĞRUDAN olsun (en fazla 1-3 kısa cümle). Gereksiz giriş cümleleri ("Merhaba", "Tabii ki", "Veritabanını incelediğimde...") veya uzun açıklamalar ASLA yazma.
2. Yalnızca sana verilen JSON verisindeki kesin sayıları kullan; asla tahminde bulunma.
3. Eğer sorulan bir öğrencinin tam eşleşmesi "directHint" veya "matchedStudents" içinde varsa, kaç oturumdan kaçına gelmediğini (absentCount / totalSessionsHeld) ve varsa hangi hafta/derslerde gelmediğini doğrudan söyle.
4. Çevrim içi veya yüz yüze öğrenci sayısı sorulduğunda hem o eğitim türünde ders alan toplam tekil öğrenci sayısını hem de (varsa) hem çevrim içi hem yüz yüze ders alan hibrit öğrenci sayısını kısaca belirt.
5. Eğer sorulan isim "matchedStudents" veya "matchedInstructors" içinde bulunamadıysa, "bu isimde kayıtlı bir öğrenci/eğitmen bulunamadı." diyerek kısaca yanıtla.`;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateSibeliusAnswerWithRetry(
  ai: GoogleGenAI,
  prompt: string
): Promise<string> {
  const attempts: Array<{ model: string; useLowThinking: boolean; delayMs: number }> = [
    { model: 'gemini-4-hydrogen', useLowThinking: true, delayMs: 0 },
    { model: 'gemini-4-hydrogen', useLowThinking: true, delayMs: 600 },
    { model: 'gemini-3.1-flash-lite', useLowThinking: false, delayMs: 300 },
  ];

  let lastError: unknown = null;

  for (const attempt of attempts) {
    if (attempt.delayMs > 0) {
      await sleep(attempt.delayMs);
    }
    try {
      const response = await ai.models.generateContent({
        model: attempt.model,
        contents: prompt,
        config: {
          systemInstruction: SIBELIUS_SYSTEM_INSTRUCTION,
          ...(attempt.useLowThinking
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : {}),
        },
      });
      const text = (response.text ?? '').trim();
      if (text) {
        return text;
      }
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('overloaded') ||
        msg.includes('high demand');
      if (!isTransient) {
        throw err;
      }
    }
  }

  throw lastError ?? new Error('Model yanıt vermedi.');
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.post('/api/sibelius-chat', async (req, res) => {
    try {
      const { question, snapshot } = req.body ?? {};
      if (!question || typeof question !== 'string' || !question.trim()) {
        res.status(400).json({ error: 'Lütfen bir soru yazın.' });
        return;
      }

      if (!process.env.GEMINI_API_KEY) {
        res.status(500).json({
          error:
            'GEMINI_API_KEY tanımlı değil. Lütfen Settings > Secrets panelinden API anahtarını kontrol edin.',
        });
        return;
      }

      const ai = getGenAIClient();
      const prompt = [
        `Kullanıcı sorusu: ${question.trim()}`,
        `Canlı Sibelius Veritabanı Özeti (JSON):`,
        JSON.stringify(snapshot ?? {}),
      ].join('\n\n');

      const answer = await generateSibeliusAnswerWithRetry(ai, prompt);
      res.json({ answer });
    } catch (error: unknown) {
      console.error('Sibelius AI Assistant error:', error);
      const rawMessage =
        error instanceof Error ? error.message : String(error);
      let status = 500;
      let userMessage = `Yapay zeka yanıtı alınamadı: ${rawMessage}`;

      if (
        rawMessage.includes('PERMISSION_DENIED') ||
        rawMessage.includes('API_KEY_INVALID') ||
        rawMessage.includes('403') ||
        rawMessage.includes('400')
      ) {
        status = 403;
        userMessage =
          'API anahtarı geçersiz veya yetkisiz. Lütfen Settings > Secrets panelinden API anahtarını kontrol edin.';
      } else if (
        rawMessage.includes('RESOURCE_EXHAUSTED') ||
        rawMessage.includes('429')
      ) {
        status = 429;
        userMessage =
          'İstek kotası doldu (429). Settings > Secrets panelinden faturalandırması açık bir API anahtarı seçebilirsiniz.';
      } else if (
        rawMessage.includes('503') ||
        rawMessage.includes('UNAVAILABLE')
      ) {
        status = 503;
        userMessage =
          'Yapay zeka servisi şu an yoğun, lütfen birkaç saniye sonra tekrar deneyin.';
      }

      res.status(status).json({ error: userMessage });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
