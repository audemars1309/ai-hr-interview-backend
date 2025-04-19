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

    const memory = previousQA.map(pair => [
      { role: "user", content: pair.question },
      { role: "assistant", content: pair.answer }
    ]).flat();

    const prompt = `
You are a real human HR from ${company}, interviewing a candidate named ${name} for the role of ${role}.
You are deeply emotionally intelligent, slightly casual but very professional - like a top HR at Infosys, TCS, or Deloitte.
Act 100% human. Add subtle things like:
- Fillers: "um", "so", "like", "you know..."
- Interjections: "hmm", "interesting", "oh right", "I see"
- Breathing, coughing lightly, stuttering sometimes: "ahem", "uhh", "s-sure"
- Brief pauses: "Let me think...", "Hmm one sec..."
- Warm tone: "thanks for sharing that", "good point", "no worries"
- Keep it voice-friendly: no long paragraphs, speak like real conversation.
- React to their answers emotionally, like: "Oh wow, that's really cool."
You're not a bot. You are a real HR in a virtual video call.

The candidate's resume summary is: ${resumeData}
They just said: "${transcript}"

Ask a meaningful, human-sounding follow-up question based on their answer. Or continue the interview flow naturally.
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

    const audioResponse = await axios.post(
  "https://api.elevenlabs.io/v1/text-to-speech/3sgs3cXyFLCGIFbN6C/stream",
  {
    text: reply,
    model_id: "eleven_monolingual_v1",
    voice_settings: {
      stability: 0.32,
      similarity_boost: 0.85,
      style: 0.5,
      use_speaker_boost: true,
    }
  },
  {
    responseType: "arraybuffer",
    validateStatus: () => true, // capture all responses including errors
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
    },
  }
);

// Check if response is audio or error JSON
const contentType = audioResponse.headers["content-type"];
if (!contentType || !contentType.includes("audio")) {
  const errorJson = JSON.parse(Buffer.from(audioResponse.data).toString("utf8"));
  throw new Error("ElevenLabs Error: " + (errorJson?.detail || JSON.stringify(errorJson)));
}

    const audioBase64 = Buffer.from(audioResponse.data).toString("base64");

    const didRes = await axios.post(
      "https://api.d-id.com/talks",
      {
        script: {
          type: "audio",
          audio: `data:audio/mpeg;base64,${audioBase64}`,
        },
        source_url: "https://i.postimg.cc/Z5cpsXyH/male-hr-jpg.jpg"
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.D_ID_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!didRes.data || !didRes.data.id) {
      console.error("D-ID API Error:", didRes.data);
      return res.status(500).json({ error: "D-ID API returned an invalid response." });
    }

    const videoUrl = `https://studio.d-id.com/talks/${didRes.data.id}`;
    res.json({ reply, videoUrl });

  } catch (err) {
    if (err.response && err.response.data) {
      console.error("API Error Response:", err.response.data);
      res.status(500).json({ error: err.response.data });
    } else {
      console.error("Server Error:", err.message);
      res.status(500).json({ error: "Server error occurred." });
    }
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`AI HR backend is running on port ${PORT}`);
});
