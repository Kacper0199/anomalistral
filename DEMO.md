# 🚀 Anomalistral — Demo Walkthrough Script

**Project:** Anomalistral  
**Event:** Mistral Hackathon 2026 (48h)  
**Goal:** 3-5 Minute Live Demo  
**Repository:** [github.com/Kacper0199/anomalistral](https://github.com/Kacper0199/anomalistral)

---

## 🛠️ Pre-demo Checklist
- [ ] **Backend:** Running on `http://localhost:8000` (`uvicorn app.main:app --reload`)
- [ ] **Frontend:** Running on `http://localhost:3000` (`npm run dev`)
- [ ] **API Health:** Verify `http://localhost:8000/api/health` returns `{"status": "ok"}`
- [ ] **Environment:** Mistral API Key loaded in `backend/.env`
- [ ] **Sample Data:** Have `iot_sensor_data.csv` ready for upload
- [ ] **Browser:** Clean window, zoom at 100-110% for visibility.

---

## 🎙️ Opening Hook (30s)
> "Managing MLOps for time-series anomaly detection is usually a manual, fragmented process. Data scientists spend hours writing boilerplate code, validating outputs, and tuning algorithms. 
> 
> Meet **Anomalistral**: the first fully autonomous, agentic MLOps platform for time-series anomaly detection. Powered by **5 specialized Mistral Agents**, it transforms a natural language prompt into a complete, validated production pipeline in under 60 seconds."

---

## 📍 Step 1: Landing Page (30s)
*Show the landing page (`/`)*
- **Action:** Scroll through the hero section.
- **Talking Point:** "Our UI is built for the modern engineer—clean, fast, and focused. We don't just 'generate code'; we manage the entire lifecycle of a detection session."
- **Emphasize:** "The 'Start New Session' button is where the magic begins."

---

## 📍 Step 2: Create Session (30s)
*Click 'Start New Session', enter prompt and upload dataset*
- **Action:** Upload a CSV file (e.g. `iot_sensor_data.csv`) and paste the prompt: `"Detect anomalies in IoT temperature sensor data using statistical and ML-based approaches. Focus on detecting sudden spikes and gradual drift patterns."`
- **Action:** Click "Create Session".
- **Talking Point:** "I'm uploading a real dataset and describing my business problem in natural language. No YAML configs, no Python scripts. The dataset gets uploaded to Mistral's sandbox via the Files API so every agent can directly access it."

---

## 📍 Step 3: Pipeline in Action (60s)
*The workspace loads, showing the DAG (React Flow)*
- **Action:** Watch the nodes change state from `pending` → `running` → `completed`.
- **Talking Point:** "We are now watching a **sequential agent pipeline** powered by Mistral's Agents API. Each phase runs via `conversations.start` with the dataset file attached as a `ToolFileChunk`. The backend streams real-time updates via **Server-Sent Events (SSE)** directly to the DAG."
- **Talking Point:** "Notice the progress bars and elapsed timers on each node. 
  1. **EDA Agent** is profiling data quality using code_interpreter in the sandbox.
  2. **Algorithm Agent** selects the best approach (e.g., Isolation Forest vs. Z-Score).
  3. **Code Agent** generates the detection logic with live sandbox execution.
  4. **Validation Agent** runs statistical validation on the results."

---

## 📍 Step 4: Results (60s)
*Switch through the tabs in the Results Panel*
- **Action (EDA Tab):** "The EDA Agent produced this report. Look at the data quality badges and the distribution charts. It found the spikes I mentioned in my prompt."
- **Action (Code Tab):** "Here is the **generated Python code**. It's fully syntax-highlighted (using Shiki). This is ready-to-run, production-grade code, not just a snippet."
- **Action (Validation Tab):** "The **Validation Agent** ran this code against our metrics. We have an overall score and a detailed checklist of what passed or failed."
- **Action (Anomaly Tab):** "Finally, the visual proof. Here is our time-series with the detected anomalies highlighted in red. The agents successfully identified both the sudden spikes and the drift."

---

## 📍 Step 5: Chat Interaction (30s)
*Go to the Chat Panel on the right*
- **Action:** Type: `"Can you explain why you chose Isolation Forest over simple Z-score for this data?"`
- **Action:** Send and watch the real-time response.
- **Talking Point:** "The session is interactive. I can interrogate the agents about their decisions. This 'human-in-the-loop' capability ensures the platform remains transparent and trustworthy."

---

## 🏁 Closing / Architecture (30s)
- **Talking Point:** "Under the hood, Anomalistral runs a sequential agent pipeline. Each phase is an independent `conversations.start` call with dataset files uploaded to Mistral's sandbox via the Files API."
- **Key Metrics to Drop:** 
  - "5 specialized Mistral Agents with code_interpreter."
  - "Real-time SSE streaming for zero-latency feedback."
  - "Full pipeline execution in under 60 seconds."
  - "Production-ready Docker deployment on Railway/Vercel."
- **Ending:** "Anomalistral: From intent to production anomaly detection, autonomously. Thank you."

---

## 🆘 Backup Plan
- **If API is slow:** "Mistral is doing some heavy lifting here—generating complex logic and validating data in real-time. Let's give the agents a moment to finalize the validation."
- **If a node fails:** "The platform is built with **resilience and retry logic** (exponential backoff). If an agent call fails, it retries automatically."
- **If file upload fails:** "The Files API requires `purpose='code_interpreter'` for CSV uploads. Double-check the backend .env has a valid API key and the file is a valid CSV."
- **If local env fails:** Have a pre-recorded video or a hosted production URL ready in a background tab.

---

## 📊 Key Highlights for Judges
- **Sequential Agent Pipeline:** Not just one LLM call, but a chain of specialized experts with shared dataset access via the Mistral Files API.
- **SSE Integration:** Exceptional UX with real-time state synchronization.
- **Clean Architecture:** FastAPI + Next.js 15 + Zustand + Pandera for strict data validation.
- **Scalability:** Built to handle production MLOps workflows.
