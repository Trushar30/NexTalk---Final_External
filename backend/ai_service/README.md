# NexTalk AI Service

This directory contains the AI microservice for the NexTalk platform. It is built using [FastAPI](https://fastapi.tiangolo.com/) and provides various AI-powered features for the main backend.

## Features

- **Toxicity Detection**: Analyzes text messages and content to detect toxicity, hate speech, or inappropriate language.
- **Face Authentication**: Provides endpoints for facial recognition and secure face-based authentication.
- **Message Summarization**: Generates concise summaries from conversation history or long text inputs.

## Requirements

- Python 3.10+
- See `requirements.txt` for the complete list of dependencies.

## Setup & Running

1. **Create and activate a virtual environment (if not already done):**
   ```bash
   python -m venv venv
   source venv/bin/activate  # macOS / Linux
   # or
   .\venv\Scripts\activate   # Windows
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the server:**
   ```bash
   uvicorn main:app --reload --port 8000
   ```

The AI service runs on port `8000` by default. NexTalk's primary backend communicates with this service over HTTP.

## API Documentation

Once the server is running, you can access the automatically generated interactive API documentation provided by FastAPI:
- Swagger UI (Interactive endpoints): [http://localhost:8000/docs](http://localhost:8000/docs)
- ReDoc (Alternative layout): [http://localhost:8000/redoc](http://localhost:8000/redoc)

## Environment Variables

- `AI_SERVICE_SECRET` (optional): Used to verify the internal service-to-service communication. If configured here, it should match the `AI_SERVICE_SECRET` in the main Node.js backend to prevent unauthorized access.
