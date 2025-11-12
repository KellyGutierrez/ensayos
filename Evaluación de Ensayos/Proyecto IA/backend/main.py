import os
import re
import openai
from gtts import gTTS
from uuid import uuid4

from flask import Flask, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from docx import Document
from dotenv import load_dotenv
from flask_cors import CORS

# Cargar variables del .env
load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
openai.api_key = OPENAI_API_KEY

# Importar la variable global desde storage.py
from storage import ESSAYS_DATA

app = Flask(__name__)
CORS(app)  # Habilita CORS

# Rutas absolutas a la carpeta raíz del proyecto
BASE_DIR = os.path.dirname(__file__)               # Carpeta backend
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))  # Carpeta que contiene backend y frontend

# Carpetas de uploads y audio, al mismo nivel que backend y frontend
UPLOAD_FOLDER = os.path.join(PROJECT_ROOT, "uploads")
AUDIO_FOLDER = os.path.join(PROJECT_ROOT, "audio")

ALLOWED_EXTENSIONS = {'txt', 'pdf', 'docx', 'csv'}

# Crear las carpetas si no existen
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(AUDIO_FOLDER, exist_ok=True)

def clean_folder(folder_path):
    """
    Elimina todos los archivos en la carpeta especificada.
    """
    if os.path.exists(folder_path):
        for filename in os.listdir(folder_path):
            file_path = os.path.join(folder_path, filename)
            if os.path.isfile(file_path):
                os.remove(file_path)

# Limpiar las carpetas al iniciar el servidor
clean_folder(UPLOAD_FOLDER)
clean_folder(AUDIO_FOLDER)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def extract_text_from_file(file_path, extension):
    if extension == "docx":
        try:
            doc = Document(file_path)
            full_text = [para.text for para in doc.paragraphs]
            return "\n".join(full_text)
        except Exception as e:
            print(f"Error leyendo docx: {e}")
            return ""
    elif extension == "txt":
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception as e:
            print(f"Error leyendo txt: {e}")
            return ""
    else:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception as e:
            print(f"Error leyendo archivo {extension}: {e}")
            return ""

def extract_author(text):
    match = re.search(r'Autor:\s*(.+)', text, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return "Desconocido"

def review_with_ai(text, additional_instructions=""):
    system_message = {
        "role": "system",
        "content": (
            "Eres un evaluador de ensayos académicos. Tu tarea es analizar el ensayo y devolver una respuesta EXACTA en el siguiente formato, sin agregar texto adicional:\n"
            "Calificación: <número entre 1 y 10>\n"
            "Comentarios: <explicación breve y general del porqué de la calificación>\n"
            "Áreas de fortaleza: <enfocadas en la redacción del ensayo>\n"
            "Áreas de mejora: <sugerencias concretas para mejorar el ensayo>\n"
            "No incluyas el ensayo ni otro texto adicional.\n"
            f"Instrucciones adicionales: {additional_instructions}"
        )
    }
    user_message = {
        "role": "user",
        "content": f"Ensayo:\n{text}"
    }
    try:
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[system_message, user_message],
            max_tokens=300,
            temperature=0.7,
        )
        content = response["choices"][0]["message"]["content"].strip()
        return content
    except Exception as e:
        print(f"Error llamando a OpenAI API: {e}")
        return "Error al llamar a la API de OpenAI."

@app.route("/upload", methods=["POST"])
def upload_files():
    # Se espera que en el formulario se incluya un campo de texto con name "instructions"
    additional_instructions = request.form.get("instructions", "")
    
    files = request.files.getlist("files")
    essays_info = []
    all_texts = []  # Para evaluación grupal

    for file in files:
        if file and allowed_file(file.filename):
            original_filename = secure_filename(file.filename)
            file_path = os.path.join(UPLOAD_FOLDER, original_filename)
            file.save(file_path)

            extension = original_filename.rsplit(".", 1)[1].lower()
            text = extract_text_from_file(file_path, extension)
            all_texts.append(text)

            author = extract_author(text)
            review = review_with_ai(text, additional_instructions)

            unique_id = str(uuid4())
            audio_filename = f"{unique_id}.mp3"
            tts_path = os.path.join(AUDIO_FOLDER, audio_filename)
            try:
                tts = gTTS(review, lang="es")
                tts.save(tts_path)
            except Exception as e:
                print(f"Error al generar TTS: {e}")
                audio_filename = None

            #try:
            #    os.remove(file_path)
            #except OSError as e:
            #    print(f"Error al eliminar el archivo {file_path}: {e}")

            essays_info.append({
                "id": unique_id,
                "filename": original_filename,
                "author": author,
                "review": review,
                "audio_url": f"/audio/{audio_filename}" if audio_filename else None,
                "details_url": f"/details.html?id={unique_id}"
            })

            # Almacenar el ensayo en ESSAYS_DATA para uso en análisis detallado
            ESSAYS_DATA[unique_id] = {
                "author": author,
                "text": text,
                "review": review,
                "audio_filename": audio_filename
            }

    # Si se subieron más de un ensayo, generar evaluación grupal
    group_review = ""
    group_audio_url = None
    if len(all_texts) > 1:
        group_review = group_review_with_ai(all_texts, additional_instructions="")
        group_audio_filename = f"group_{uuid4()}.mp3"
        group_tts_path = os.path.join(AUDIO_FOLDER, group_audio_filename)
        try:
            group_tts = gTTS(group_review, lang="es")
            group_tts.save(group_tts_path)
            group_audio_url = f"/audio/{group_audio_filename}"
        except Exception as e:
            print(f"Error al generar TTS para evaluación grupal: {e}")
            group_audio_url = None

    return jsonify({
        "ensayos_procesados": essays_info,
        "group_review": group_review,
        "group_audio_url": group_audio_url
    })

@app.route("/audio/<path:filename>")
def serve_audio(filename):
    return send_from_directory(AUDIO_FOLDER, filename)

# Servir index.html y otros archivos estáticos
@app.route("/")
def serve_index():
    frontend_dir = os.path.join(PROJECT_ROOT, "frontend")
    return send_from_directory(frontend_dir, "index.html")

@app.route("/<path:path>")
def serve_static(path):
    frontend_dir = os.path.join(PROJECT_ROOT, "frontend")
    return send_from_directory(frontend_dir, path)

def group_review_with_ai(texts, additional_instructions=""):
    """
    Combina una lista de ensayos y produce una evaluación grupal.
    """
    combined_text = "\n---\n".join(texts)
    system_message = {
        "role": "system",
        "content": (
            "Eres un evaluador de ensayos académicos. Tu tarea es analizar en conjunto los siguientes ensayos y devolver una evaluación grupal EXACTA en el siguiente formato, sin agregar texto adicional:\n"

            "Comentarios: <explicación breve y general del porqué de la calificación>\n"
            "Áreas de fortaleza: <fortalezas generales en la redacción de los ensayos>\n"
            "Áreas de mejora: <sugerencias concretas para mejorar la escritura en conjunto>\n"
            "No incluyas los ensayos ni otro texto adicional.\n"
            f"Instrucciones adicionales: {additional_instructions}"
        )
    }
    user_message = {
        "role": "user",
        "content": f"Ensayos:\n{combined_text}"
    }
    try:
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[system_message, user_message],
            max_tokens=300,
            temperature=0.7,
        )
        content = response["choices"][0]["message"]["content"].strip()
        return content
    except Exception as e:
        print(f"Error llamando a OpenAI API para evaluación grupal: {e}")
        return "Error al llamar a la API de OpenAI para evaluación grupal."

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

#Para correr ngrok, se usa el comando ".\ngrok.exe http 5000"
