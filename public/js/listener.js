document.addEventListener("DOMContentLoaded", () => {
  // === ID único por visitante ===
  let visitorId = localStorage.getItem("visitor_id");
  if (!visitorId) {
    visitorId = Math.floor(Math.random() * 1000000);
    localStorage.setItem("visitor_id", visitorId);
  }

  // === Conexión con el servidor ===
  const socket = io({
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
  });

  // === Elementos del DOM ===
  const player = document.getElementById("player");
  const activarBtn = document.getElementById("activarAudio");
  const statusText = document.getElementById("statusText");
  const msgInput = document.getElementById("msg");
  const sendBtn = document.getElementById("send");
  const messagesDiv = document.getElementById("messages");

  // ==============================
  // 🎧 AUDIO STREAM
  // ==============================
  if (player) {
    const mediaSource = new MediaSource();
    player.src = URL.createObjectURL(mediaSource);
    player.autoplay = true;
    player.playsInline = true;
    player.muted = false;

    let sourceBuffer = null;
    let audioQueue = [];
    let expectedMime = null;

    function appendNextChunk() {
      if (sourceBuffer && !sourceBuffer.updating && audioQueue.length > 0) {
        const chunk = audioQueue.shift();
        try {
          sourceBuffer.appendBuffer(chunk);
        } catch (err) {
          console.error("❌ appendBuffer error:", err);
        }
      }
    }

    function createSourceBuffer() {
      if (!sourceBuffer && expectedMime && mediaSource.readyState === "open") {
        try {
          sourceBuffer = mediaSource.addSourceBuffer(expectedMime);
          sourceBuffer.mode = "sequence";
          sourceBuffer.addEventListener("updateend", appendNextChunk);
          console.log("🎶 SourceBuffer creado:", expectedMime);
        } catch (err) {
          console.error("❌ No se pudo crear SourceBuffer:", err);
        }
      }
    }

    mediaSource.addEventListener("sourceopen", createSourceBuffer);

    socket.on("audio-meta", (meta) => {
      expectedMime = meta?.mimeType || "audio/mpeg";
      createSourceBuffer();
    });

    socket.on("audio", (data) => {
      const chunk = new Uint8Array(data);
      if (sourceBuffer && !sourceBuffer.updating) {
        try {
          sourceBuffer.appendBuffer(chunk);
        } catch {
          audioQueue.push(chunk);
        }
      } else {
        audioQueue.push(chunk);
      }

      player.play().catch(() => {
        if (activarBtn) activarBtn.style.display = "inline-block";
      });
    });

    socket.on("stopStream", () => {
      if (statusText) statusText.textContent = "⏹️ Transmisión detenida.";
    });

    // === ACTIVAR AUDIO MANUAL ===
    if (activarBtn) {
      activarBtn.addEventListener("click", () => {
        player.play()
          .then(() => {
            activarBtn.style.display = "none";
            appendNextChunk();
          })
          .catch((err) => {
            console.error("❌ No se pudo reproducir el audio:", err);
          });
      });
    }
  }
    // ==============================
  // 🎵 MÚSICA COMPARTIDA
  // ==============================

  const musicPlayer = new Audio();
  musicPlayer.autoplay = false;
  musicPlayer.loop = false;
  musicPlayer.controls = false;
  musicPlayer.volume = 1.0;

  let musicPlaying = false;

  // Recibir música desde el servidor (archivo compartido)
  socket.on("music", (fileData) => {
    console.log("🎵 Recibiendo música compartida...");

    // Crear URL temporal del blob recibido
    const blob = new Blob([fileData], { type: "audio/mpeg" });
    const musicUrl = URL.createObjectURL(blob);

    // Detener cualquier reproducción anterior
    if (musicPlaying) {
      musicPlayer.pause();
      URL.revokeObjectURL(musicPlayer.src);
    }

    // Asignar nueva música
    musicPlayer.src = musicUrl;
    musicPlayer.play().then(() => {
      musicPlaying = true;
      if (statusText)
        statusText.textContent = "🎶 Reproduciendo música compartida...";
    }).catch((err) => {
      console.error("❌ No se pudo reproducir música:", err);
    });
  });

  // Recibir señal para detener música
  socket.on("stopMusic", () => {
    if (musicPlaying) {
      musicPlayer.pause();
      musicPlaying = false;
      URL.revokeObjectURL(musicPlayer.src);
      if (statusText)
        statusText.textContent = "⏹️ Música detenida.";
    }
  });


  // ==============================
  // 💬 CHAT EN VIVO
  // ==============================

  if (msgInput && sendBtn && messagesDiv) {
    // 🛠️ Función auxiliar segura
    function escapeHtmlAllowEmoji(text) {
      if (!text) return "";
      return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    // Enviar mensaje (oyente)
    sendBtn.addEventListener("click", () => {
      const msg = msgInput.value.trim();
      if (msg !== "") {
        const payload = {
          id: visitorId,
          from: `Oyente #${visitorId}`,
          text: msg,
          time: new Date().toLocaleTimeString(),
        };

        // ✅ Mostrar el mensaje inmediatamente en pantalla (sin esperar el rebote del servidor)
        renderMessage(payload);

        // ✅ Enviar mensaje al servidor para que lo vean todos (incluido el admin)
        socket.emit("chatMessage", payload);

        msgInput.value = "";
      }
    });

    // Enviar con Enter
    msgInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
      }
    });

    // Recibir mensajes (de admin y otros oyentes)
    socket.on("chatMessage", (msg) => {
      // Evitar duplicar el mensaje del propio usuario (ya mostrado localmente)
      if (msg.id == visitorId) return;
      renderMessage(msg);
    });

    // === Mostrar mensaje en pantalla ===
    function renderMessage(msg) {
      const p = document.createElement("p");
      const isAdmin =
        msg.from === "Administrador" || msg.from?.startsWith?.("Administrador");

      p.innerHTML = isAdmin
        ? `<strong style="color:#e91e63;">🎙️ ${msg.from}</strong>
            <span style="color:#888;font-size:0.8em">[${msg.time || ""}]</span>:
            ${escapeHtmlAllowEmoji(msg.text)}`
        : `<strong>👤 ${escapeHtmlAllowEmoji(
            msg.from || "Oyente #" + (msg.id || "")
          )}</strong>
            <span style="color:#888;font-size:0.8em">[${msg.time || ""}]</span>:
            ${escapeHtmlAllowEmoji(msg.text)}`;

      messagesDiv.appendChild(p);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    // Estado de conexión
    socket.on("connect", () => {
      if (statusText) statusText.textContent = "🔴 Transmisión en vivo conectada.";
    });

    socket.on("disconnect", () => {
      if (statusText)
        statusText.textContent = "⚠️ Desconectado del servidor.";
    });
  }
});




