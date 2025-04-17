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
    const { transcript, company, role, name, resumeData } = req.body;

    const prompt = `
You are a professional HR from ${company}, interviewing a candidate named ${name} for the role of ${role}.
Ask realistic HR questions one by one. The candidate has this background: ${resumeData}.
They just said: "${transcript}". Continue the interview like a real human HR.
`;

    const gptRes = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }],
    });

    const reply = gptRes.choices[0].message.content;

    // Convert reply to voice using ElevenLabs
    const audioResponse = await axios.post(
      "https://api.elevenlabs.io/v1/text-to-speech/YOUR_VOICE_ID/stream",
      {
        text: reply,
        model_id: "eleven_monolingual_v1",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
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
        script: { type: "audio", audio: `data:audio/mpeg;base64,${audioBase64}` },
        source_url: "https://i.ibb.co/k5Y4GG7/indian-hr-face.png"
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
    console.error("Error:", err.response?.data || err.message);
    res.status(500).send("Something went wrong.");
  }
});

app.get("/", (req, res) => res.send("AI HR Backend is running"));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
