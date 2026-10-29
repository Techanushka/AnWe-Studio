# AnWe Studio 🎬

### AI-Powered, Transcript-Based Video Editing Platform

AnWe Studio is a full-stack web application that simplifies video editing using AI-powered transcription and text-based editing. Instead of manually searching through a video timeline, users can work with the generated transcript to identify and remove unwanted portions of a recording.

The platform combines a React-based editing interface with a Python FastAPI backend to support video transcription, editing workflows, AI-generated insights, and project management.

## ✨ Features

### 1. Transcript-Based Video Editing
- Generate transcripts from uploaded videos using speech recognition.
- Display timestamped transcript segments.
- Select transcript text to identify portions of a video for removal.
- Search within the transcript.
- Support transcript-based editing workflows.

### 2. Video Preview and Interactive Timeline
- Preview uploaded videos directly in the browser.
- Play, pause, seek, and control playback speed.
- Navigate through video content using timestamps.
- Visualize editing boundaries and waveform information.
- Connect transcript navigation with video playback.

### 3. Undo, Redo, and Edit History
- Track editing operations.
- Undo and redo supported changes.
- Recover from accidental editing actions.
- Maintain editing state during the editing session.

### 4. AI-Powered Editing Assistance
- Generate summaries and key insights from video content.
- Identify potential highlights and important moments.
- Prepare editing suggestions based on user instructions.
- Support workflows such as removing long pauses and creating highlights.

### 5. Smart Video Editing Tools
- Generate video highlights from selected moments.
- Support vertical-video and short-form content workflows.
- Assist with subtitle generation and multilingual editing workflows.
- Provide editing proposals for review before applying supported changes.

### 6. Project Management and Analytics
- Upload and manage video projects.
- Track transcription and project processing status.
- Display project statistics and processing insights.
- Organize the editing workflow through a centralized dashboard.

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, JavaScript/TypeScript, Vite |
| UI and State Management | React components, Zustand |
| Backend | Python, FastAPI |
| Speech Recognition | Whisper, faster-whisper, Transformers.js |
| AI Integration | Google Gemini API |
| Database | MongoDB Atlas |
| Cloud Storage | Supabase Storage |
| Video Preview | HTML5 Video API |
| Timeline and Audio | Canvas/SVG, Web Audio API |
| Development Tools | Git, GitHub, npm, Python virtual environments |

*The exact technologies used by individual features depend on their current implementation and configuration.*

## 🏗️ Application Architecture

AnWe Studio follows a frontend-backend architecture.

1. **Frontend:** Provides the user interface for authentication, project management, video preview, transcript navigation, and editing controls.
2. **Backend:** Uses FastAPI to expose API endpoints for authentication, project operations, transcription, and supported AI workflows.
3. **Speech Recognition:** Converts spoken audio into timestamped transcript segments using the configured transcription engine.
4. **Database:** Stores application and project-related data in MongoDB Atlas.
5. **Cloud Storage:** Uses Supabase Storage for supported video-file storage workflows.
6. **AI Services:** Uses the configured Gemini model for supported summaries, insights, and editing suggestions.

## 🔄 How It Works

1. Sign up or log in to the application.
2. Open the dashboard and create a project.
3. Upload a video recording.
4. Generate a timestamped transcript.
5. Review the transcript while previewing the video.
6. Select transcript segments or request supported AI editing suggestions.
7. Review the proposed edits and use the available editing controls.
8. Preview the resulting edit and continue refining the project.

## 📋 Prerequisites

Install the following before running the application:

- Node.js and npm
- Python 3.10 or a compatible version supported by the backend dependencies
- MongoDB Atlas account or another supported MongoDB deployment
- Supabase project for cloud-storage functionality
- Google Gemini API key for AI-powered functionality

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Techanushka/AnWe-Studio.git
cd AnWe-Studio
```

### 2. Set up the backend

Open a terminal in the project root:

```powershell
cd backend
python -m venv .venv
```

Activate the virtual environment on Windows:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install the backend dependencies using the project's dependency file:

```powershell
pip install -r requirements.txt
```

Create or configure `backend/.env` using the environment variables required by the backend configuration.

Then start the FastAPI server:

```powershell
uvicorn app.main:app --reload
```

The backend should be available at:

- API: http://127.0.0.1:8000
- Interactive API documentation: http://127.0.0.1:8000/docs

### 3. Set up the frontend

Open another terminal from the project root:

```powershell
cd frontend
npm install
```

Configure the frontend environment variables in `frontend/.env` according to the project's existing environment configuration.

Start the development server:

```powershell
npm run dev
```

Open the local URL printed by Vite, typically:

http://localhost:5173

## 🔐 Environment Configuration

Keep API keys, database credentials, and other secrets in local environment files. Do not commit `.env` files containing real credentials.

Configure the required values according to the backend and frontend settings, including:

- MongoDB connection string and database name
- Supabase URL and storage credentials
- Gemini API key and model configuration
- Frontend API URL and CORS origins
- Authentication and session settings
- Optional transcription-service configuration

Use the project's existing environment-variable names and example configuration where available. Never publish actual API keys, passwords, session secrets, or database credentials.

## 📁 Project Structure

```text
AnWe-Studio/
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── ...
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   └── ...
│   ├── requirements.txt
│   └── ...
├── .gitignore
└── README.md
```

The directory structure above is a simplified overview; individual modules may vary as the project evolves.

## 🧪 Testing and Verification

Before using the application, verify that:

- The frontend starts successfully.
- The backend starts without configuration errors.
- Required database and storage services are configured.
- Authentication and project APIs respond correctly.
- Video upload and transcription work with the configured processing engine.
- Transcript navigation and supported editing actions behave as expected.
- AI features work when the required API credentials are configured.

Use the FastAPI documentation at `/docs` to inspect and test available API endpoints.

## 🔮 Future Enhancements

- More precise word-level transcript editing.
- Improved waveform visualization and timeline controls.
- More robust editing history and project recovery.
- Enhanced speaker identification and multilingual subtitle support.
- Additional AI-assisted editing workflows.
- Improved export options and rendering performance.

## 🤝 Contributing

Contributions and suggestions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Implement and test your changes.
4. Commit your changes with a descriptive message.
5. Open a pull request describing the changes.

## 📄 License

Add the appropriate license for this project before distributing or reusing its code.

---

**AnWe Studio** — Making video editing more intuitive through transcripts, AI, and interactive editing tools.
