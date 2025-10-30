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
const activarBtn = document.getElementById("activarAudio");
const statusText = document.getElementById("statusText");

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
  let audioCtx;
  let audioEnabled = false;

  // Botón de activación (solo para navegadores modernos)
  if (activarBtn) {
    activarBtn.onclick = async () => {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        await audioCtx.resume();
        audioEnabled = true;
        activarBtn.disabled = true;
        if (statusText) statusText.textContent = "🔴 En vivo o esperando señal...";
        console.log("🎧 AudioContext activado");
      } catch (err) {
        alert("Error activando el audio: " + err.message);
      }
    };
  } else {
    // Si no hay botón, crear contexto directamente (modo locutor o pruebas locales)
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioEnabled = true;
  }

  socket.on("audio", async (data) => {
    if (!audioEnabled || !audioCtx) return;
    try {
      const floatArray = new Float32Array(data);
      const buffer = audioCtx.createBuffer(1, floatArray.length, 44100);
      buffer.copyToChannel(floatArray, 0);
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      source.start(0);
      if (statusText) statusText.textContent = "🟢 Transmitiendo...";
    } catch (err) {
      console.error("Error reproduciendo audio:", err);
    }
  });

  socket.on("stopStream", () => {
    if (statusText) statusText.textContent = "⏹️ Transmisión detenida.";
    const endMsg = document.getElementById("end");
    if (endMsg) endMsg.style.display = "block";
    console.log("🔴 Transmisión detenida.");
  });
}

// === TRANSMISIÓN (Locutor) ===
if (startBtn) {
  let mediaStream;
  let processor;
  let context;

  startBtn.onclick = async () => {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      context = new (window.AudioContext || window.webkitAudioContext)();
      await context.resume();

      const source = context.createMediaStreamSource(mediaStream);
      processor = context.createScriptProcessor(2048, 1, 1);

      source.connect(processor);
      processor.connect(context.destination);

      processor.onaudioprocess = (e) => {
        const channelData = e.inputBuffer.getChannelData(0);
        socket.emit("audio", channelData);
      };

      startBtn.disabled = true;
      stopBtn.disabled = false;
      console.log("🎙️ Transmisión iniciada.");
    } catch (err) {
      alert("Error accediendo al micrófono: " + err.message);
      console.error(err);
    }
  };

  stopBtn.onclick = () => {
    if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
    if (processor) processor.disconnect();
    if (context) context.close();

    socket.emit("stopStream");
    startBtn.disabled = false;
    stopBtn.disabled = true;
    console.log("🛑 Transmisión detenida.");
  };
}
