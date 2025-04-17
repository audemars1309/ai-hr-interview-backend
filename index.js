import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import cors from "cors";
import axios from "axios";
import OpenAI from "openai";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
const upload = multer();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post("/interview", upload.none(), async (req, res) => {
  try {
    const { transcript, company, role, name, resumeData, previousQA = [] } = req.body;

    // Combine recent interaction memory if any
    const memory = previousQA.map(pair => {
      return [
        { role: "user", content: pair.question },
        { role: "assistant", content: pair.answer }
      ];
    }).flat();

    const prompt = `
You are a real human HR from ${company}, interviewing a candidate named ${name} for the role of ${role}.
You are emotionally intelligent, slightly casual but very professional — like a senior HR from Infosys, TCS, or Deloitte.

You must sound 100% human. Occasionally add:
- Natural fillers: "um", "so", "right..."
- Small interjections: "haha", "interesting", "ahem, sorry", "please continue", "go ahead"
- Thought pauses: "hmm...", "let me think for a second..."
- Encouragement: "that’s great", "thanks for sharing that", "good point"

Stay concise, warm, interactive, and don’t speak too long. You're doing a voice interview with a human. Maintain a professional vibe.

The candidate's background is: ${resumeData}
They just said: "${transcript}"

Ask a relevant follow-up question based on their answer, or smoothly move to the next interview question.
`;

    const messages = [
      { role: "system", content: prompt },
      ...memory,
      { role: "user", content: transcript }
    ];

    const gptRes = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
    });

    const reply = gptRes.choices[0].message.content.trim();

    // Convert reply to voice using ElevenLabs
    const audioResponse = await axios.post(
      "https://api.elevenlabs.io/v1/text-to-speech/3gsg3cxXyFLcGIfNbM6C/stream",
      {
        text: reply,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.48,
          similarity_boost: 0.8
        },
      },
      {
        responseType: "arraybuffer",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    const audioBase64 = Buffer.from(audioResponse.data).toString("base64");

    // Send audio to D-ID to generate face video
    const didRes = await axios.post(
      "https://api.d-id.com/talks",
      {
        script: {
          type: "audio",
          audio: `data:audio/mpeg;base64,${audioBase64}`
        },
        source_url: "https://i.ibb.co/YBpdtd3/male-hr-face.png"
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.D_ID_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const videoUrl = `https://studio.d-id.com/talks/${didRes.data.id}`;
    res.json({ reply, videoUrl });

  } catch (err) {
    if (err.response) {
      console.error("API Error Response:", err.response.data);
    } else {
      console.error("Server Error:", err.message);
    }
    res.status(500).send("Interview system encountered an error. Please try again.");
  }
});

app.get("/", (req, res) => res.send("AI HR Backend is running"));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
