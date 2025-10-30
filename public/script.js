// === Conexión con el servidor ===
const socket = io.connect(window.location.origin, {
  transports: ["websocket"],
  secure: true
});

// === Elementos del DOM ===
const msgInput = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const messagesDiv = document.getElementById("messages");
const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
const player = document.getElementById("player");

// === CHAT ===
if (sendBtn) {
  sendBtn.onclick = () => {
    const text = msgInput.value.trim();
    if (text) {
      socket.emit("chat", { from: "Usuario", text });
      msgInput.value = "";
    }
  };
}

socket.on("chat", (msg) => {
  const p = document.createElement("p");
  p.textContent = `${msg.from}: ${msg.text}`;
  messagesDiv.appendChild(p);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

// === AUDIO RECEPCIÓN (Oyente) ===
if (player) {
  // Creamos un MediaSource dinámico
  const mediaSource = new MediaSource();
  player.src = URL.createObjectURL(mediaSource);
  player.autoplay = true;
  player.playsInline = true;

  let sourceBuffer;
  let audioQueue = [];

  mediaSource.addEventListener("sourceopen", () => {
    sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
    sourceBuffer.mode = "sequence";

    sourceBuffer.addEventListener("updateend", () => {
      if (audioQueue.length > 0 && !sourceBuffer.updating) {
        const chunk = audioQueue.shift();
        sourceBuffer.appendBuffer(chunk);
      }
    });
  });

  // Recibir audio desde el servidor (formato Blob o Uint8Array)
  socket.on("audio", (data) => {
    const chunk = new Uint8Array(data);
    if (sourceBuffer && !sourceBuffer.updating) {
      sourceBuffer.appendBuffer(chunk);
    } else {
      audioQueue.push(chunk);
    }
  });

  socket.on("stopStream", () => {
    console.log("🔴 Transmisión detenida.");
  });
}

// === TRANSMISIÓN (Locutor) ===
if (startBtn) {
  let mediaRecorder;

  startBtn.onclick = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          event.data.arrayBuffer().then(buffer => {
            socket.emit("audio", new Uint8Array(buffer));
          });
        }
      };

      mediaRecorder.start(200); // envía fragmentos cada 200ms
      startBtn.disabled = true;
      stopBtn.disabled = false;

      console.log("🎙️ Transmisión iniciada.");
    } catch (err) {
      alert("Error accediendo al micrófono: " + err.message);
      console.error(err);
    }
  };

  stopBtn.onclick = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    socket.emit("stopStream");
    startBtn.disabled = false;
    stopBtn.disabled = true;
    console.log("🛑 Transmisión detenida.");
  };
}

