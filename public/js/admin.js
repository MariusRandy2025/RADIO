// === Conexión con el servidor ===
const socket = io({
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 2000,
});

// === Elementos del DOM ===
const msgInput = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const messagesDiv = document.getElementById("messages");
const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
const player = document.getElementById("player");
const musicInput = document.getElementById("musicFile");
const sendMusicBtn = document.getElementById("sendMusic");
const statusText = document.getElementById("statusText");
const toggleMusicBtn = document.getElementById("toggleMusic");
const volumeControlDiv = document.getElementById("musicVolumeControl");
const volumeSlider = document.getElementById("musicVolume");

// === Hora actual ===
const nowTime = () => new Date().toLocaleTimeString();

// === Funciones de utilidad ===
function escapeHtmlAllowEmoji(text) {
  return (text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function addMessage(msg) {
  if (!messagesDiv) return;
  const p = document.createElement("p");
  const isAdmin = msg.from === "Administrador";
  p.innerHTML = isAdmin
    ? `<strong style="color:#e91e63;">🎙️ ${escapeHtmlAllowEmoji(msg.from)}</strong>
       <span style="color:#888;font-size:0.8em">[${msg.time || ""}]</span>:
       ${escapeHtmlAllowEmoji(msg.text)}`
    : `<strong>👤 Invitado ${msg.id || ""}</strong>
       <span style="color:#888;font-size:0.8em">[${msg.time || ""}]</span>:
       ${escapeHtmlAllowEmoji(msg.text)}`;
  messagesDiv.appendChild(p);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// === Mostrar historial guardado del chat ===
window.addEventListener("load", () => {
  const saved = JSON.parse(localStorage.getItem("chat_history") || "[]");
  saved.forEach(addMessage);
});

// === CHAT ADMINISTRADOR ===
if (msgInput && sendBtn) {
  const sendMessage = () => {
    const text = msgInput.value.trim();
    if (!text) return;
    const msg = { from: "Administrador", text, time: nowTime() };
    socket.emit("chatMessage", msg);
    msgInput.value = "";
  };

  sendBtn.onclick = sendMessage;
  msgInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

// === Recibir mensajes ===
socket.on("chatMessage", (msg) => {
  addMessage(msg);
  const old = JSON.parse(localStorage.getItem("chat_history") || "[]");
  old.push(msg);
  if (old.length > 100) old.shift();
  localStorage.setItem("chat_history", JSON.stringify(old));
});

// === AUDIO STREAM PARA ADMIN TEST (opcional) ===
if (player) {
  const mediaSource = new MediaSource();
  player.src = URL.createObjectURL(mediaSource);
  player.autoplay = true;
  player.playsInline = true;

  let sourceBuffer = null;
  let audioQueue = [];
  let expectedMime = null;

  socket.on("audio-meta", (meta) => {
    expectedMime = meta && meta.mimeType ? meta.mimeType : null;
  });

  mediaSource.addEventListener("sourceopen", () => {
    if (expectedMime) {
      try {
        sourceBuffer = mediaSource.addSourceBuffer(expectedMime);
        sourceBuffer.mode = "sequence";
        sourceBuffer.addEventListener("updateend", onUpdateEnd);
      } catch (err) {
        console.error("❌ Error creando SourceBuffer:", err);
      }
    }
  });

  function onUpdateEnd() {
    if (audioQueue.length > 0 && sourceBuffer && !sourceBuffer.updating) {
      const chunk = audioQueue.shift();
      try {
        sourceBuffer.appendBuffer(chunk);
      } catch (err) {
        console.error("❌ appendBuffer fallo:", err);
      }
    }
  }

  socket.on("audio", (data) => {
    const chunk = new Uint8Array(data).buffer;

    if (!sourceBuffer && expectedMime && mediaSource.readyState === "open") {
      try {
        sourceBuffer = mediaSource.addSourceBuffer(expectedMime);
        sourceBuffer.mode = "sequence";
        sourceBuffer.addEventListener("updateend", onUpdateEnd);
      } catch (err) {
        console.error("❌ No se pudo crear SourceBuffer:", err);
      }
    }

    if (sourceBuffer && !sourceBuffer.updating) {
      try {
        sourceBuffer.appendBuffer(chunk);
      } catch {
        audioQueue.push(chunk);
      }
    } else {
      audioQueue.push(chunk);
    }
  });
}

// === TRANSMISIÓN (voz + música) ===
let mediaRecorder = null;
let audioContext = null;
let destination = null;
let micSource = null;
let musicSource = null;
let musicGain = null;
let micStream = null;
let isTransmitting = false;

// === Iniciar micrófono ===
async function startMic() {
  if (isTransmitting) return;
  try {
    if (!audioContext) audioContext = new AudioContext();
    destination = audioContext.createMediaStreamDestination();

    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micSource = audioContext.createMediaStreamSource(micStream);
    micSource.connect(destination);

    if (musicSource) musicSource.connect(destination);

    const mime = "audio/webm;codecs=opus";
    socket.emit("audio-meta", { mimeType: mime });

    mediaRecorder = new MediaRecorder(destination.stream, {
      mimeType: mime,
      audioBitsPerSecond: 64000,
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        event.data.arrayBuffer().then((buf) => {
          socket.emit("audio", new Uint8Array(buf));
        });
      }
    };

    mediaRecorder.start(500);
    isTransmitting = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusText.textContent = "🎙️ Transmitiendo micrófono y música...";
  } catch (err) {
    alert("Error al acceder al micrófono: " + err.message);
    console.error("❌ getUserMedia error:", err);
  }
}

// === Detener transmisión ===
if (startBtn && stopBtn) {
  startBtn.onclick = startMic;

  stopBtn.onclick = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
    }
    if (musicSource) {
      try { musicSource.stop(); } catch {}
      musicSource = null;
    }
    socket.emit("stopStream");
    isTransmitting = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    statusText.textContent = "⏹️ Transmisión detenida.";
  };
}

// === Compartir música ===
if (sendMusicBtn && musicInput) {
  sendMusicBtn.onclick = async () => {
    const file = musicInput.files[0];
    if (!file) return alert("Selecciona un archivo de audio primero.");

    if (!audioContext) audioContext = new AudioContext();

    if (musicSource) {
      try { musicSource.stop(); } catch {}
    }

    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    musicSource = audioContext.createBufferSource();
    musicSource.buffer = audioBuffer;
    musicSource.loop = true;

    // 🎚️ Control de volumen
    musicGain = audioContext.createGain();
    musicGain.gain.value = parseFloat(volumeSlider.value) || 1.0;

    // Conexión
    musicSource.connect(musicGain);
    musicGain.connect(audioContext.destination);
    if (destination) musicGain.connect(destination);

    // Slider funcional
    volumeControlDiv.style.display = "block";
    volumeSlider.oninput = () => {
      const vol = parseFloat(volumeSlider.value);
      musicGain.gain.setValueAtTime(vol, audioContext.currentTime);
    };

    musicSource.start();
    statusText.textContent = "🎧 Transmitiendo música + micrófono...";

    // Mostrar botón de pausa/reanudar
    if (toggleMusicBtn) {
      toggleMusicBtn.style.display = "inline-block";
      toggleMusicBtn.innerHTML = '<i class="fa-solid fa-pause"></i> Pausar música';
      toggleMusicBtn.onclick = () => {
        if (musicGain.gain.value > 0) {
          musicGain.gain.setValueAtTime(0, audioContext.currentTime);
          toggleMusicBtn.innerHTML = '<i class="fa-solid fa-play"></i> Reanudar música';
        } else {
          musicGain.gain.setValueAtTime(parseFloat(volumeSlider.value), audioContext.currentTime);
          toggleMusicBtn.innerHTML = '<i class="fa-solid fa-pause"></i> Pausar música';
        }
      };
    }
  };
  // === Limpiar chat al cerrar sesión ===
document.querySelector('a[href="/logout"]')?.addEventListener("click", () => {
  localStorage.removeItem("chat_history");
});

}













