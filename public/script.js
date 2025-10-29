const socket = io();
const msgInput = document.getElementById('msg');
const sendBtn = document.getElementById('send');
const messagesDiv = document.getElementById('messages');
const endMsg = document.getElementById('end');
const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');
const player = document.getElementById('player');

// --- CHAT ---
if (sendBtn) {
  sendBtn.onclick = () => {
    const text = msgInput.value.trim();
    if (text) {
      socket.emit('chat', { from: 'Usuario', text });
      msgInput.value = '';
    }
  };
}

socket.on('chat', msg => {
  const p = document.createElement('p');
  p.textContent = `${msg.from}: ${msg.text}`;
  messagesDiv.appendChild(p);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

// --- AUDIO RECEPCIÓN (Oyente) ---
if (player) {
  const audioCtx = new AudioContext();
  socket.on('audio', data => {
    const floatArray = new Float32Array(data);
    const buffer = audioCtx.createBuffer(1, floatArray.length, 44100);
    buffer.copyToChannel(floatArray, 0);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start();
  });

  socket.on('stopStream', () => {
    if (endMsg) endMsg.style.display = 'block';
  });
}

// --- TRANSMISIÓN (Locutor) ---
if (startBtn) {
  let mediaStream;
  startBtn.onclick = async () => {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const context = new AudioContext();
    const source = context.createMediaStreamSource(mediaStream);
    const processor = context.createScriptProcessor(2048, 1, 1);

    source.connect(processor);
    processor.connect(context.destination);

    processor.onaudioprocess = e => {
      const channelData = e.inputBuffer.getChannelData(0);
      socket.emit('audio', channelData);
    };

    startBtn.disabled = true;
    stopBtn.disabled = false;
  };

  stopBtn.onclick = () => {
    mediaStream.getTracks().forEach(t => t.stop());
    socket.emit('stopStream');
    stopBtn.disabled = true;
  };
}
